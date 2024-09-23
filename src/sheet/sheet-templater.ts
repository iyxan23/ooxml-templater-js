import { type BasicExpressionsWithStaticTexts, parseBasicExpressions } from "./expression/parser";
import { Block, extractHoistsAndBlocks } from "./expression/extractor";
import { Sheet } from "./sheet";
import {
  evaluateExpression,
  Issue,
  TemplaterFunction,
} from "./expression/evaluate";
import { resultSymbol, success } from "./expression/result";
import { Result } from "./expression/result";
import deepmerge from "deepmerge";
import { builtinFunctions } from "./functions";

export interface TemplatableCell {
  getTextContent(): string;
  editTextContent(content: string): ThisType<this>;
  cloneWithTextContent(content: string): ThisType<this>;
}

export type Indexable2DArray<T> = Record<number, Record<number, T>>;

type SheetShiftListener = (
  shift:
    | {
        direction: "row";
        row: number;
        amount: number;
        colStart: number;
        colEnd: number;
      }
    | {
        direction: "col";
        col: number;
        amount: number;
        rowStart: number;
        rowEnd: number;
      },
) => void;

class SheetShiftEmitter {
  private listeners: SheetShiftListener[] = [];

  onShift(listener: SheetShiftListener) {
    this.listeners.push(listener);
  }

  emitShift(shift: Parameters<SheetShiftListener>[0]) {
    this.listeners.forEach((l) => l(shift));
  }

  clear() {
    this.listeners = [];
  }
}

export class SheetTemplater<SheetT extends TemplatableCell> {
  private sheet: Sheet<SheetT>;

  private functions: Record<string, TemplaterFunction<any>> = {
    ...builtinFunctions,
  };

  constructor(
    sheet: Sheet<SheetT>,
    {
      functions,
    }: {
      functions?: Record<string, TemplaterFunction<any>>;
    },
  ) {
    this.sheet = sheet;
    this.sheet.optimizeSheet();

    if (functions) {
      // merge this.functions with functions
      for (const [key, value] of Object.entries(functions)) {
        this.functions[key] = value;
      }
    }
  }

  interpret(
    data: any,
    { onShift }: { onShift?: SheetShiftListener },
  ): Result<{
    sheet: Sheet<SheetT>;
  }> {
    const issues = [];
    const parsedExpressions = this.parseExpressions(this.sheet);

    // stage 1: extract hoists and blocks
    const { variableHoists, blocks } = extractHoistsAndBlocks(
      parsedExpressions.getBounds(),
      (col, row) => parsedExpressions.getCell(col, row)?.[0] ?? null,
      (col, row, data) =>
        parsedExpressions.setCell(col, row, [
          data,
          parsedExpressions.getCell(col, row)?.[1]!,
        ]),
    );

    // stage 2: evaluate variable hoists
    const globalVariables: Record<string, any> = {};
    for (const { col, row, expr } of variableHoists) {
      const sheetCell = this.sheet.getCell(col, row);
      if (sheetCell === null) {
        throw new Error(
          `fatal: cannot find the cell referenced by variable hoist on` +
            ` col ${col} row ${row}`,
        );
      }

      const result = evaluateExpression(
        expr.expression,
        {
          col,
          row,
          callTree: [`hoisted variable \`${expr.identifier}\``],
        },
        (funcName) => this.functions[funcName],
        (variableName) => globalVariables[variableName] ?? data[variableName],
      );

      issues.push(...result.issues);

      if (result.status === "failed") {
        return result;
      }

      globalVariables[expr.identifier] = result.result;
    }

    // setup the sheet shift emitter
    const sheetShiftEmitter = new SheetShiftEmitter();
    if (onShift) sheetShiftEmitter.onShift(onShift);

    // stage 3: block expansion
    const expandBlocksResult = this.expandBlocks(
      parsedExpressions,
      blocks,
      (fName) => this.functions[fName],
      (vName) => globalVariables[vName] ?? data[vName],
      sheetShiftEmitter,
    );

    if (expandBlocksResult.status === "failed") return expandBlocksResult;
    issues.push(...expandBlocksResult.issues);

    const localVariables = expandBlocksResult.result;

    // stage 4: execution
    const bounds = parsedExpressions.getBounds();
    parsedExpressions.optimizeSheet(bounds);

    const resultSheet = new Sheet<SheetT>();

    for (let row = 0; row <= bounds.rowBound; row++) {
      for (let col = 0; col <= bounds.colBound; col++) {
        const cell = parsedExpressions.getCell(col, row);
        if (cell === null) continue;

        const [exprCell, sheetCell] = cell;

        const result = this.evaluateExpressionCell(exprCell, sheetCell, {
          context: { col, row },
          lookupVariable: (name) =>
            localVariables[row]?.[col]?.[name] ??
            globalVariables[name] ??
            data[name],
        });

        if (result.status === "failed") return result;
        issues.push(...result.issues);

        resultSheet.setCell(col, row, result.result);
      }
    }

    return {
      sym: resultSymbol,
      status: "success",
      result: { sheet: resultSheet },
      issues,
    };
  }

  private expandBlocks<T>(
    sheet: Sheet<T>,
    blocks: Block[],
    lookupFunction: (
      name: string,
    ) => TemplaterFunction<any> | undefined,
    lookupVariable: (name: string) => any | undefined,
    sheetShiftEmitter: SheetShiftEmitter,
  ): Result<Indexable2DArray<Record<string, any>>> {
    const issues: Issue[] = [];
    let localVariables: Indexable2DArray<Record<string, any>> = {};

    function setLocalVariables(
      col: number,
      row: number,
      variables: Record<string, any>,
    ) {
      if (!localVariables[row]) {
        localVariables[row] = { [col]: variables };
      } else if (!localVariables[row][col]) {
        localVariables[row][col] = variables;
      } else {
        localVariables[row][col] = deepmerge(
          localVariables[row][col],
          variables,
        );
      }
    }

    function getLocalVariables(col: number, row: number): Record<string, any> {
      if (!localVariables[row]) return {};
      if (!localVariables[row][col]) return {};
      return localVariables[row][col];
    }

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]!;

      // expand inner blocks first
      const result = this.expandBlocks(
        sheet,
        block.innerBlocks,
        lookupFunction,
        lookupVariable,
        sheetShiftEmitter,
      );

      if (result.status === "failed") return result;
      issues.push(...result.issues);

      localVariables = deepmerge(localVariables, result.result);

      const repeatAmountResult = evaluateExpression(
        block.arg,
        {
          col: block.start.col,
          row: block.start.row,
          callTree: [`${block.identifier} block`],
        },
        (fName) => lookupFunction(fName),
        (vName) => lookupVariable(vName),
      );

      if (repeatAmountResult.status === "failed") {
        return repeatAmountResult;
      }

      issues.push(...repeatAmountResult.issues);
      const repeatAmount = repeatAmountResult.result;

      if (block.identifier === "repeatRow") {
        const ident = block.indexVariableIdentifier;
        const row = block.start.row;

        // first row
        for (let col = block.start.col; col < block.end.col + 1; col++) {
          setLocalVariables(col, row, { [ident]: 0 });
        }

        // the rest of the rows
        this.duplicateAndShiftRows({
          sheet,
          row,
          colStart: block.start.col,
          colEnd: block.end.col + 1,
          count: repeatAmount - 1, // exclude the first row
          otherBlocks: blocks.slice(i),
          setIndexVariable: (curCol, curRow, index) => {
            // set this cell's variables to be the same as the first row with
            // the new index
            setLocalVariables(curCol, curRow, {
              ...getLocalVariables(curCol, row),
              [ident]: index,
            });
          },
          sheetShiftEmitter,
        });
      } else if (block.identifier === "repeatCol") {
        const ident = block.indexVariableIdentifier;
        const col = block.start.col;

        // first col
        for (let row = block.start.row; row < block.end.row + 1; row++) {
          setLocalVariables(col, row, { [ident]: 0 });
        }

        // the rest of the cols
        this.duplicateAndShiftCols({
          sheet,
          col,
          rowStart: block.start.row,
          rowEnd: block.end.row + 1,
          count: repeatAmount - 1, // exclude the first col
          otherBlocks: blocks.slice(i),
          setIndexVariable: (curCol, curRow, index) => {
            setLocalVariables(curCol, curRow, {
              ...getLocalVariables(col, curRow),
              [ident]: index,
            });
          },
          sheetShiftEmitter,
        });
      }
    }

    return success(localVariables, issues);
  }

  // this function will also shift other blocks and other
  // listeners of ShiftEventEmitter
  private duplicateAndShiftCols<T>({
    sheet,
    count,
    rowStart,
    rowEnd,
    col,
    otherBlocks,
    setIndexVariable,
    sheetShiftEmitter,
  }: {
    sheet: Sheet<T>;
    count: number;
    rowStart: number;
    rowEnd: number;
    col: number;
    otherBlocks: Block[];
    setIndexVariable: (col: number, row: number, index: number) => void;
    sheetShiftEmitter: SheetShiftEmitter;
  }) {
    // do the cloneMapCol operation
    sheet.cloneMapCol({
      col,
      rowStart,
      rowEnd,
      count,
      map: ({ relativeCol, relativeRow, previousData }) => {
        const num = relativeCol + 1;
        const curRow = rowStart + relativeRow;
        const curCol = col + num;

        setIndexVariable(curCol, curRow, num);

        return previousData;
      },
    });

    // then shift the other blocks and colInfos
    function shiftBlocks(blocks: Block[]) {
      for (const block of blocks) {
        shiftBlocks(block.innerBlocks);
        if (block.start.col >= col) block.start.col += count;
        if (block.end.col >= col) block.end.col += count;
      }
    }

    shiftBlocks(otherBlocks);

    sheetShiftEmitter.emitShift({
      direction: "col",
      col,
      amount: count,
      rowStart,
      rowEnd,
    });
  }

  // this function will also shift other blocks and other
  // listeners of ShiftEventEmitter
  private duplicateAndShiftRows<T>({
    sheet,
    count,
    colStart,
    colEnd,
    row,
    otherBlocks,
    setIndexVariable,
    sheetShiftEmitter,
  }: {
    sheet: Sheet<T>;
    count: number;
    colStart: number;
    colEnd: number;
    row: number;
    otherBlocks: Block[];
    setIndexVariable: (col: number, row: number, index: number) => void;
    sheetShiftEmitter: SheetShiftEmitter;
  }) {
    // do the cloneMapRow operation
    sheet.cloneMapRow({
      row,
      colStart,
      colEnd,
      count,
      map: ({ relativeCol, relativeRow, previousData }) => {
        const num = relativeRow + 1;
        const curRow = row + num;
        const curCol = colStart + relativeCol;

        setIndexVariable(curCol, curRow, num);

        return previousData;
      },
    });

    // then shift the other blocks and colInfos
    function shiftBlocks(blocks: Block[]) {
      for (const block of blocks) {
        shiftBlocks(block.innerBlocks);
        if (block.start.row >= row) block.start.row += count;
        if (block.end.row >= row) block.end.row += count;
      }
    }

    shiftBlocks(otherBlocks);

    sheetShiftEmitter.emitShift({
      direction: "row",
      row,
      amount: count,
      colStart,
      colEnd,
    });
  }

  private evaluateExpressionCell(
    cell: BasicExpressionsWithStaticTexts,
    sheetCell: SheetT,
    {
      context,
      lookupVariable,
    }: {
      context: { row: number; col: number };
      lookupVariable: (name: string) => any | undefined;
    },
  ): Result<SheetT> {
    const issues: Issue[] = [];
    let result = "";

    for (const item of cell) {
      if (typeof item === "string") {
        result += item;
        continue;
      }

      const evalResult = evaluateExpression(
        item,
        { ...context, callTree: ["<root>"] },
        (funcName) => this.functions[funcName],
        lookupVariable,
      );

      issues.push(...evalResult.issues);

      if (evalResult.status === "failed") {
        return { ...evalResult, issues };
      }

      if (typeof evalResult.result !== "undefined") result += evalResult.result;
    }

    return {
      sym: resultSymbol,
      status: "success",
      result: sheetCell.cloneWithTextContent(result) as SheetT,
      issues,
    };
  }

  private parseExpressions(
    sheet: Sheet<SheetT>,
  ): Sheet<[BasicExpressionsWithStaticTexts, SheetT]> {
    const expressionSheet = new Sheet<[BasicExpressionsWithStaticTexts, SheetT]>();
    const bounds = sheet.getBounds();

    for (let r = 0; r <= bounds.rowBound; r++) {
      for (let c = 0; c <= bounds.colBound; c++) {
        const cell = sheet.getCell(c, r);
        if (!cell) continue;

        const expressionCell = parseBasicExpressions(cell.getTextContent());
        expressionSheet.setCell(c, r, [expressionCell, cell]);
      }
    }

    return expressionSheet;
  }
}
