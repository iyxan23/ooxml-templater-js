import { Expression } from "./parser";

export const resultSymbol = Symbol("result");
export type ResultSymbol = typeof resultSymbol;

export type Issue = {
  col: number;
  row: number;
  message: string;
  index?: number;
};

export type Result<T> =
  | { status: "success"; result: T; issues: Issue[]; sym: ResultSymbol }
  | { status: "failed"; issues: Issue[]; error: Issue; sym: ResultSymbol };

export type TemplaterFunction<R> = {
  call: (funcName: string, ...args: any[]) => R;
};

export function evaluateExpression(
  item: Expression,
  context: { col: number; row: number; callTree: string[] },
  lookupFunction: (funcName: string) => ((...args: any[]) => any) | undefined,
  lookupVariable: (name: string) => any | undefined,
): Result<any | undefined> {
  if (
    item.type === "blockStart" ||
    item.type === "blockEnd" ||
    item.type === "variableHoist"
  ) {
    console.warn(
      `at col ${context.col} ${context.row} ${item.type} is not supposed` +
      ` to be in the evaluation stage.`,
    );

    return {
      sym: resultSymbol,
      status: "success",
      result: undefined,
      issues: [
        {
          col: context.col,
          row: context.row,
          message:
            `expressions of type ${item.type} is not supposed to be` +
            ` in the evaluation stage.`,
        },
      ],
    };
  }

  if (item.type === "lambda") {
    // please really do note that lambda expressions return a simple function
    // that takes a record of local variables to be applied within this scope
    //
    // the return type is of type Issue<any>, which could be a "failed" (known
    // from `.status`) execution, due to the nature of interpreted languages.
    // there could also be issues that can be seen from `.status`.
    return {
      sym: resultSymbol,
      status: "success",
      result: (localVars: Record<string, any>) =>
        evaluateExpression(
          item.expression,
          {
            ...context,
            callTree: [...context.callTree, "lambda"],
          },
          lookupFunction,

          /* lookupVariable: */
          (varName) => localVars[varName] ?? lookupVariable(varName),
        ),
      issues: [],
    };
  }

  if (item.type === "call") {
    const funcArgs = [];
    const issues = [];
    for (const arg of item.args) {
      if (typeof arg === "string") {
        funcArgs.push(arg);
        continue;
      }

      const result = evaluateExpression(
        arg,
        {
          ...context,
          callTree: [
            ...context.callTree,
            `function \`${item.identifier}\` call`,
          ],
        },
        lookupFunction,
        lookupVariable,
      );
      issues.push(...result.issues);

      if (result.status === "failed") {
        return result;
      }
    }

    const func = lookupFunction(item.identifier);

    if (!func) {
      return {
        sym: resultSymbol,
        status: "success",
        result: undefined,
        issues: [
          ...issues,
          {
            col: context.col,
            row: context.row,
            message: `function \`${item.identifier}\` is not defined.`,
          },
        ],
      };
    }

    let result = func.call(item.identifier, ...item.args);

    if (typeof result !== "string") {
      result = JSON.stringify(result);

      return {
        sym: resultSymbol,
        status: "success",
        result,
        issues: [
          ...issues,
          {
            col: context.col,
            row: context.row,
            message:
              `function \`${item.identifier}\` should return a ` +
              `string, falling back to JSON.stringify.`,
          },
        ],
      };
    }

    return {
      sym: resultSymbol,
      status: "success",
      result,
      issues,
    };
  }

  // item is a variableAccess

  const variable = lookupVariable(item.identifier);
  if (!variable) {
    return {
      sym: resultSymbol,
      status: "success",
      result: undefined,
      issues: [
        {
          col: context.col,
          row: context.row,
          message: `variable \`${item.identifier}\` is not defined.`,
        },
      ],
    };
  }

  return {
    sym: resultSymbol,
    status: "success",
    result: variable,
    issues: [],
  };
}
