import { type ExpressionCell, parseExpressionCell } from "./expression/parser";
import { Block, extractHoistsAndBlocks } from "./expression/extractor";
import { Sheet } from "./sheet";
import { z } from "zod";
import {
  evaluateExpression,
  Issue,
  LambdaFunction,
  TemplaterFunction,
} from "./expression/evaluate";
import { resultSymbol, success } from "./expression/result";
import { Result } from "./expression/result";
import deepmerge from "deepmerge";

export interface TemplatableCell {
  getTextContent(): string;
  editTextContent(content: string): ThisType<this>;
  cloneWithTextContent(content: string): ThisType<this>;
}

type Indexable2DArray<T> = Record<number, Record<number, T>>;

export function createTemplaterNoArgsFunction<R>(
  call: () => R,
): TemplaterFunction<R> {
  return {
    call: () => success(call()),
  };
}

/**
 * Please note that the result of a lambda call is a form of `Result<any>`,
 * which has the following structure:
 *
 * ```
 * export type Result<T> =
 *   | { status: "success"; result: T; issues: Issue[]; sym: ResultSymbol }
 *   | { status: "failed"; issues: Issue[]; error: Issue; sym: ResultSymbol };
 * ```
 */
export function callLambda(
  f: Function,
): (opts: {
  variables?: Record<string, any>;
  customVariableResolver?: (variableName: string) => any;
}) => Result<any> {
  return (opts) =>
    f(
      (vName: string) =>
        opts.customVariableResolver?.(vName) ?? opts.variables?.[vName],
    );
}

type MapFunctionToLambda<T> = T extends (...args: any[]) => infer R
  ? LambdaFunction<R>
  : T;
type MapFunctionsToLambdas<T> = { [K in keyof T]: MapFunctionToLambda<T[K]> };

/**
 * ## Calling a lambda
 * To call a lambda, use `z.function()` as arg, but call
 * `callLambda(theFunc)()` to call the lambda.
 *
 * It's possible specify local variables that will only be defined within the
 * lambda by passing a `Record<string, any>` on the field `variables` to the
 * function returned by `callLambda`, as such:
 *
 * ```
 * callLambda(theFunc)({ variables: { index: 0 } })
 * ```
 *
 * The variable `index` will be defined within the lambda.
 *
 * It's also possible to provide variables through a function instead of
 * passing a Record, use the `customVariableResolver`:
 *
 * ```
 * callLambda(theFunc)({
 *   customVariableResolver:
 *     (vName) => vName === "myVar" ? "hello" : undefined
 * })
 * ```
 *
 * ## Return
 *
 * The caller of this function should return a `Result<any>` value, which can
 * represent a successful or failed execution. It's also possible to include
 * issues in the result, which will be handled by the caller at the upmost
 * level.
 *
 * If you're working with lambdas, it's highly recommended to collect the
 * `issues` returned by a lambda call, and accumulate them into a list, where
 * it will be included in this function's `Result<any>` return value.
 *
 * See `success(...)`, and `failure(...)` to easily create `Result<any>` objects.
 */
export function createTemplaterFunction<T extends z.ZodTuple, R>(
  schema: T,
  call: (...args: MapFunctionsToLambdas<z.infer<T>>) => Result<R>,
): TemplaterFunction<R> {
  return {
    call: (funcName, ...args: any) => {
      const result = schema.safeParse(args);

      if (!result.success) {
        throw new Error(
          `invalid arguments when evaluating function \`${funcName}\`: ${result.error}`,
        );
      }

      return call(...(result.data as MapFunctionsToLambdas<z.infer<T>>));
    },
  };
}

export class SheetTemplater<SheetT extends TemplatableCell, RowInfo, ColInfo> {
  private sheet: Sheet<SheetT>;

  private rowInfo: Record<number, RowInfo> = {};
  private colInfo: Record<number, ColInfo> = {};

  private functions: Record<string, TemplaterFunction<any>> = {
    helloWorld: createTemplaterNoArgsFunction(() => "hello world"),
    testLambda: createTemplaterFunction(z.tuple([z.function()]), (a) =>
      success(a()),
    ),
  };

  constructor(
    sheet: Sheet<SheetT>,
    {
      rowInfo,
      colInfo,
      functions,
    }: {
      rowInfo?: Record<number, RowInfo>;
      colInfo?: Record<number, ColInfo>;
      functions?: Record<string, TemplaterFunction<any>>;
    },
  ) {
    this.sheet = sheet;
    this.sheet.optimizeSheet();

    if (rowInfo) this.rowInfo = rowInfo;
    if (colInfo) this.colInfo = colInfo;

    if (functions) {
      // merge this.functions with functions
      for (const [key, value] of Object.entries(functions)) {
        this.functions[key] = value;
      }
    }
  }

  interpret(data: any): Result<{
    sheet: Sheet<SheetT>;
    rowInfo?: Record<number, RowInfo>;
    colInfo?: Record<number, ColInfo>;
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
          `cannot find the cell referenced by variable hoist on` +
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
        (funcName) => this.functions[funcName]?.call,
        (variableName) => globalVariables[variableName] ?? data[variableName],
      );

      issues.push(...result.issues);

      if (result.status === "failed") {
        return result;
      }

      globalVariables[expr.identifier] = result.result;
    }

    const colInfo = this.colInfo ? Object.assign({}, this.colInfo) : undefined;
    const rowInfo = this.rowInfo ? Object.assign({}, this.rowInfo) : undefined;

    // stage 3: block expansion
    const expandBlocksResult = this.expandBlocks(
      parsedExpressions,
      blocks,
      (fName) => this.functions[fName]?.call,
      (vName) => globalVariables[vName] ?? data[vName],
      { colInfo, rowInfo },
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
      result: { sheet: resultSheet, colInfo, rowInfo },
      issues,
    };
  }

  private expandBlocks<T>(
    sheet: Sheet<T>,
    blocks: Block[],
    lookupFunction: (
      name: string,
    ) => TemplaterFunction<any>["call"] | undefined,
    lookupVariable: (name: string) => any | undefined,
    {
      colInfo,
      rowInfo,
    }: {
      colInfo?: Record<number, ColInfo>;
      rowInfo?: Record<number, RowInfo>;
    },
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
        { colInfo, rowInfo },
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
          rowInfo
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
          colInfo
        });
      }
    }

    return success(localVariables, issues);
  }

  // this function will also shift other blocks and colInfos
  private duplicateAndShiftCols<T>({
    sheet,
    count,
    rowStart,
    rowEnd,
    col,
    otherBlocks,
    setIndexVariable,
    colInfo,
  }: {
    sheet: Sheet<T>;
    count: number;
    rowStart: number;
    rowEnd: number;
    col: number;
    otherBlocks: Block[];
    setIndexVariable: (col: number, row: number, index: number) => void;
    colInfo?: Record<number, ColInfo>;
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

    if (!colInfo) return;

    for (const [key, val] of Object.entries(colInfo)) {
      const keyNum = parseInt(key);
      // shift infos that are over the current row, but duplicate the ones that
      // is on the same row
      if (keyNum === col) {
        for (let i = 0; i < count; i++) {
          colInfo[keyNum + count] = val;
        }
      } else if (keyNum > col) {
        colInfo[keyNum + count] = val;
        delete colInfo[keyNum];
      }
    }
  }

  // this function will also shift other blocks and rowInfos
  private duplicateAndShiftRows<T>({
    sheet,
    count,
    colStart,
    colEnd,
    row,
    otherBlocks,
    setIndexVariable,
    rowInfo,
  }: {
    sheet: Sheet<T>;
    count: number;
    colStart: number;
    colEnd: number;
    row: number;
    otherBlocks: Block[];
    setIndexVariable: (col: number, row: number, index: number) => void;
    rowInfo?: Record<number, RowInfo>;
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

    if (!rowInfo) return;

    for (const [key, val] of Object.entries(rowInfo)) {
      const keyNum = parseInt(key);
      // shift infos that are over the current row, but duplicate the ones that
      // is on the same row
      if (keyNum === row) {
        for (let i = 0; i < count; i++) {
          rowInfo[keyNum + count] = val;
        }
      } else if (keyNum > row) {
        rowInfo[keyNum + count] = val;
        delete rowInfo[keyNum];
      }
    }
  }

  private evaluateExpressionCell(
    cell: ExpressionCell,
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
        (funcName) => this.functions[funcName]?.call,
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
  ): Sheet<[ExpressionCell, SheetT]> {
    const expressionSheet = new Sheet<[ExpressionCell, SheetT]>();
    const bounds = sheet.getBounds();

    for (let r = 0; r <= bounds.rowBound; r++) {
      for (let c = 0; c <= bounds.colBound; c++) {
        const cell = sheet.getCell(c, r);
        if (!cell) continue;

        const expressionCell = parseExpressionCell(cell.getTextContent());
        expressionSheet.setCell(c, r, [expressionCell, cell]);
      }
    }

    return expressionSheet;
  }
}
