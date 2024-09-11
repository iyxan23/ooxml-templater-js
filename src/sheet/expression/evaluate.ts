import { Expression } from "./parser";

export type Issue = {
  col: number;
  row: number;
  message: string;
  index?: number;
};
export type Result<T> =
  | { status: "success"; result: T; issues: Issue[] }
  | { status: "failed"; issues: Issue[]; error: Issue };

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
    return {
      status: "success",
      result: (...args: any[]) => {
        const result = evaluateExpression(
          item.expression,
          {
            ...context,
            callTree: [...context.callTree, "lambda"],
          },
          lookupFunction,
          lookupVariable,
        );

        if (result.status === "failed") {
          // todo: gracefully return with a failed info
          throw new Error("inner lambda failed to execute");
        }

        return result.result;
      },
      issues: [
        {
          col: context.col,
          row: context.row,
          message: `lambda expressions should not be used as the sole expression.`,
        },
      ],
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
      status: "success",
      result,
      issues,
    };
  }

  // item is a variableAccess

  const variable = lookupVariable(item.identifier);
  if (!variable) {
    return {
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
    status: "success",
    result: variable,
    issues: [],
  };
}
