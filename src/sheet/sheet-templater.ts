import { type ExpressionCell, parseExpressionCell } from "./expression/parser";
import { extractHoistsAndBlocks } from "./expression/extractor";
import { Sheet } from "./sheet";
import { z } from "zod";
import {
  evaluateExpression,
  Issue,
  TemplaterFunction,
} from "./expression/evaluate";
import { resultSymbol, success } from "./expression/result";
import { Result } from "./expression/result";

interface TemplatableCell {
  getTextContent(): string;
  editTextContent(content: string): this;
  cloneWithTextContent(content: string): this;
}

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
  call: (...args: z.infer<T>) => Result<R>,
): TemplaterFunction<R> {
  return {
    call: (funcName, ...args: any) => {
      const result = schema.safeParse(args);

      if (!result.success) {
        throw new Error(
          `invalid arguments when evaluating function \`${funcName}\`: ${result.error}`,
        );
      }

      return call(...result.data);
    },
  };
}

export class SheetTemplater<SheetT extends TemplatableCell, RowInfo, ColInfo> {
  private sheet: Sheet<SheetT>;

  // @ts-expect-error will be used later
  private rowInfo: Record<number, RowInfo> = {};
  // @ts-expect-error will be used later
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

  interpret(data: any): Result<undefined> {
    const issues = [];
    const parsedExpressions = this.parseExpressions();

    // stage 1: extract hoists and blocks
    const { variableHoists, blocks } =
      extractHoistsAndBlocks(parsedExpressions);

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
        expr,
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

    return {
      sym: resultSymbol,
      status: "success",
      result: undefined,
      issues,
    };
  }

  private evaluateExpression(
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
      result: sheetCell.cloneWithTextContent(result),
      issues,
    };
  }

  private parseExpressions(): Sheet<ExpressionCell> {
    const expressionSheet = new Sheet<ExpressionCell>();
    const theSheet = this.sheet.getSheet();

    for (let r = 0; r < theSheet.length; r++) {
      for (let c = 0; c < theSheet[0]!.length; c++) {
        const cell = theSheet[r]![c];
        if (!cell) continue;

        const expressionCell = parseExpressionCell(cell.getTextContent());
        // skip if there are no expressions
        if (!expressionCell.some((c) => typeof c === "object")) continue;

        expressionSheet.setCell(c, r, expressionCell);
      }
    }

    return expressionSheet;
  }
}
