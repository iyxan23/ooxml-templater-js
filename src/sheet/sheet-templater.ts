/** ## Sheet Templater
 *
 * This is where everything templating-related happens in a sheet.
 * `src/xlsx/index.ts` makes use of this file to do the actual templating.
 * It's also supposed to be used for `src/docx/index.ts`'s table element, so I
 * would say the abstractions are pretty good.
 *
 * More is explained in `./sheet.md`
 */

import {
  type BasicExpressionsWithStaticTexts,
  parseBasicExpressions,
} from "../expression/parser";
import { Sheet } from "./sheet";
import { evaluateExpression, TemplaterFunction } from "../expression/evaluate";
import { Result, resultSymbol, success, Issue, failure } from "../result";
import { getBuiltinFunctions } from "../expression/function/builtin";
import { Block, extractVarsAndBlocks } from "./sheet-extractor";
import { isNumeric } from "../utils";

// @internal
export interface TemplatableCell {
  getTextContent(): string;
  editTextContent(content: string): ThisType<this>;
  cloneWithTextContent(content: string): ThisType<this>;
}

// @internal
export type Indexable2DArray<T> = Record<number, Record<number, T>>;

// @internal
export type SheetAddr = { col: number; row: number };

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

// @internal
export class SheetTemplater<SheetT extends TemplatableCell> {
  private sheet: Sheet<SheetT>;

  private functions: Record<string, TemplaterFunction<any, SheetAddr>> = {
    ...getBuiltinFunctions<SheetAddr>(),
  };

  constructor(
    sheet: Sheet<SheetT>,
    {
      functions,
    }: {
      functions?: Record<string, TemplaterFunction<any, SheetAddr>>;
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
  ): Result<
    {
      sheet: Sheet<SheetT>;
    },
    SheetAddr
  > {
    const issues = [];
    const parsedExpressions = this.parseExpressions(this.sheet);

    // stage 1: extract hoists and blocks
    const {
      variables,
      blocks,
      issues: extractIssues,
    } = extractVarsAndBlocks(parsedExpressions);
    issues.push(...extractIssues);

    // stage 2: evaluate variable hoists
    const globalVariables: Record<string, any> = {};
    for (const { col, row, expr, identifier } of variables) {
      const sheetCell = this.sheet.getCell(col, row);
      if (sheetCell === null) {
        throw new Error(
          `fatal: cannot find the cell referenced by variable hoist on` +
          ` col ${col} row ${row}`,
        );
      }

      const result =
        typeof expr === "string"
          ? success<string, SheetAddr>(expr)
          : evaluateExpression<SheetAddr>(
            expr,
            {
              addr: {
                col,
                row,
              },
              callTree: [`hoisted variable \`${identifier}\``],
            },
            (funcName) => this.functions[funcName],
            (variableName) =>
              globalVariables[variableName] ?? data[variableName],
          );

      issues.push(...result.issues);

      if (result.status === "failed") {
        return result;
      }

      globalVariables[identifier] = result.result;
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
          context: { addr: { col, row } },
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
    ) => TemplaterFunction<any, SheetAddr> | undefined,
    lookupVariable: (name: string) => any | undefined,
    sheetShiftEmitter: SheetShiftEmitter,
  ): Result<Indexable2DArray<Record<string, any>>, SheetAddr> {
    const issues: Issue<SheetAddr>[] = [];
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
        localVariables[row][col] = Object.assign(
          {},
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

      localVariables = Object.assign({}, localVariables, result.result);

      let repeatAmountResult;

      if (typeof block.arg === "string") {
        if (isNumeric(block.arg)) {
          const num = parseInt(block.arg);
          repeatAmountResult = success<number, SheetAddr>(num);
        } else {
          repeatAmountResult = failure<number, SheetAddr>(
            {
              message: `invalid repeat block argument "${block.arg}"`,
              addr: {
                col: block.start.col,
                row: block.start.row,
              },
            },
            issues,
          );
        }
      } else {
        repeatAmountResult = evaluateExpression<SheetAddr>(
          block.arg,
          {
            addr: {
              col: block.start.col,
              row: block.start.row,
            },
            callTree: [`${block.identifier} block`],
          },
          (fName) => lookupFunction(fName),
          (vName) => lookupVariable(vName),
        );
      }

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
      context: { addr: SheetAddr };
      lookupVariable: (name: string) => any | undefined;
    },
  ): Result<SheetT, SheetAddr> {
    const issues: Issue<SheetAddr>[] = [];
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
    const expressionSheet = new Sheet<
      [BasicExpressionsWithStaticTexts, SheetT]
    >();
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
