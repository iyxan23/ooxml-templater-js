import { type ExpressionCell, parseExpressionCell } from "./expression/parser";
import { extractHoistsAndBlocks } from "./expression/extractor";
import { Sheet } from "./sheet";
import { z } from "zod";
import {
  evaluateExpression,
  Issue,
  Result,
  TemplaterFunction,
} from "./expression/evaluate";

interface TemplatableCell {
  getTextContent(): string;
  editTextContent(content: string): this;
  cloneWithTextContent(content: string): this;
}

export function createTemplaterNoArgsFunction<T extends z.ZodTuple, R>(
  call: (...args: z.infer<T>) => R,
): TemplaterFunction<R> {
  return {
    call: (_funcName, ...args: any) => call(...args),
  };
}

export function createTemplaterFunction<T extends z.ZodTuple, R>(
  schema: T,
  call: (...args: z.infer<T>) => R,
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
  };

  constructor(
    sheet: Sheet<SheetT>,
    {
      data,
      rowInfo,
      colInfo,
      functions,
    }: {
      data: any;
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

  interpret() {
    const parsedExpressions = this.parseExpressions();
    // @ts-expect-error will be used later
    const { variableHoists, blockHoists } =
      extractHoistsAndBlocks(parsedExpressions);

    // find hoists and collect them
    // and also match some blockStart and blockEnds
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
        context,
        (funcName) => this.functions[funcName]?.call,
        lookupVariable,
      );

      issues.push(...evalResult.issues);

      if (evalResult.status === "failed") {
        return { ...evalResult, issues };
      }

      result += evalResult.result;
    }

    return {
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
