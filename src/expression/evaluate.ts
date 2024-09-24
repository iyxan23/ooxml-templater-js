import { BasicExpression } from "./parser";
import { failure, Result, success } from "../result";

// Rule of thumb when erroring out:
//  - use `failure()` when it is a user error
//  - use throw new Error() when it is a fatal error from the author itself

export type TemplaterFunctionContext = {
  functionName: string;
  col: number;
  row: number;
  callTree: string[];
};
export type TemplaterFunction<R> = (
  context: TemplaterFunctionContext,
  ...args: any[]
) => Result<R>;

export type LambdaFunction<T> = (
  lookupLocalVariable?: (name: string) => any,
) => Result<T>;

export function evaluateExpression(
  item: BasicExpression,
  context: { col: number; row: number; callTree: string[] },
  lookupFunction: (funcName: string) => TemplaterFunction<any> | undefined,
  lookupVariable: (name: string) => any | undefined,
): Result<any | undefined> {
  const result = evaluateExpressionInternal(
    item,
    context,
    lookupFunction,
    lookupVariable,
  );

  if (result.status === "failed") return result;

  const { spread, data } = result.result;

  if (spread)
    throw new Error(
      "spread is not supposed to be used in the top-level expression tree",
    );

  return success(data, result.issues);
}

type CanBeSpread<T> = { spread: boolean; data: T };

function evaluateExpressionInternal(
  item: BasicExpression,
  context: { col: number; row: number; callTree: string[] },
  lookupFunction: (funcName: string) => TemplaterFunction<any> | undefined,
  lookupVariable: (name: string) => any | undefined,
): Result<CanBeSpread<any | undefined>> {
  if (item.type == "specialCall") {
    console.warn(
      `at col ${context.col} ${context.row}, special call is not supposed` +
        ` to be in the evaluation stage.`,
    );

    return success({ spread: false, data: undefined }, [
      {
        col: context.col,
        row: context.row,
        message:
          `expressions of type specialCall is not supposed to be` +
          ` in the evaluation stage.`,
      },
    ]);
  }

  if (item.type === "spread") {
    const exprResult = evaluateExpressionInternal(
      item.expr,
      context,
      lookupFunction,
      lookupVariable,
    );

    if (exprResult.status === "failed") return exprResult;

    const { spread, data } = exprResult.result;

    if (spread)
      throw new Error("spread is not supposed to be used more than once");

    return success({ spread: true, data }, []);
  }

  if (item.type === "lambda") {
    // please really do note that lambda expressions return a simple function
    // that takes a record of local variables to be applied within this scope
    //
    // the return type is of type Issue<any>, which could be a "failed" (known
    // from `.status`) execution, due to the nature of interpreted languages.
    // there could also be issues that can be seen from `.status`.
    return success<CanBeSpread<LambdaFunction<any>>>({
      spread: false,
      data: (lookupLocalVariable?: (name: string) => any) => {
        const result = evaluateExpressionInternal(
          item.expression,
          {
            ...context,
            callTree: [...context.callTree, "lambda"],
          },
          lookupFunction,

          /* lookupVariable: */
          (varName) =>
            lookupLocalVariable?.(varName) ?? lookupVariable(varName),
        );

        if (result.status === "failed") return result;

        const { spread, data } = result.result;

        if (spread) {
          return failure(
            {
              col: context.col,
              row: context.row,
              message: "spread is not supposed to be used in a lambda",
            },
            result.issues,
          );
        }

        return success(data, result.issues);
      },
    });
  }

  if (item.type === "call") {
    const funcArgs = [];
    const issues = [];
    let idx = -1; // -1 because i want idx++ at the start of the for loop

    for (const arg of item.args) {
      idx++;
      if (typeof arg === "string") {
        funcArgs.push(arg);
        continue;
      }

      const result = evaluateExpressionInternal(
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

      const { data: argResult, spread } = result.result;

      // before pushing, we check whether the result is "spread"
      if (!spread) {
        funcArgs.push(argResult);
        continue;
      }

      if (argResult == null) {
        funcArgs.push(argResult);
      } else if (Symbol.iterator in Object(argResult)) {
        // check whether it is iterable
        funcArgs.push(...argResult);
      } else {
        // return an error!
        return failure(
          {
            col: context.col,
            row: context.row,
            message: `when calling function \`${item.identifier}\`: [${item.identifier} ${funcArgs.map(() => "--").join(" ")} ???], argument ??? is being spread "..." but it's not iterable`,
          },
          [...issues],
        );
      }
    }

    const func = lookupFunction(item.identifier);

    if (!func) {
      return success({ spread: false, data: undefined }, [
        ...issues,
        {
          col: context.col,
          row: context.row,
          message: `function \`${item.identifier}\` is not defined.`,
        },
      ]);
    }

    let result = func(
      { functionName: item.identifier, ...context },
      ...funcArgs,
    );

    if (result.status === "failed") {
      return result;
    }

    return success({ spread: false, data: result.result }, [
      ...result.issues,
      ...issues,
    ]);
  }

  // item is a variableAccess

  const variable = lookupVariable(item.identifier);
  if (variable === undefined) {
    return success({ spread: false, data: undefined }, [
      {
        col: context.col,
        row: context.row,
        message: `variable \`${item.identifier}\` is not defined.`,
      },
    ]);
  }

  // also get its args and index with them

  const indexes = [];
  const issues = [];

  for (const arg of item.args) {
    if (typeof arg === "string") {
      indexes.push(arg);
      continue;
    }

    const result = evaluateExpressionInternal(
      arg,
      {
        ...context,
        callTree: [
          ...context.callTree,
          `variable index access \`${item.identifier}\``,
        ],
      },
      lookupFunction,
      lookupVariable,
    );

    if (result.status === "failed") {
      return result;
    }

    issues.push(...result.issues);

    const { spread, data: argResult } = result.result;

    // before pushing, we check whether the result is "spread"
    if (!spread) {
      indexes.push(argResult);
      continue;
    }

    // check whether it is iterable
    if (argResult == null) {
      indexes.push(argResult);
    } else if (Symbol.iterator in Object(argResult)) {
      indexes.push(...argResult);
    } else {
      // return an error!
      return failure(
        {
          col: context.col,
          row: context.row,
          message: `when indexing the variable \`${item.identifier}\`: [:${item.identifier} ${indexes.join(" ")} ???], the ??? is being spread "..." but it's not iterable`,
        },
        [...issues],
      );
    }
  }

  // try to access the variable given the indexes
  let ret = variable;
  for (const index of indexes) {
    if (ret === undefined || ret === null) {
      return success({ spread: false, data: undefined }, [
        ...issues,
        {
          col: context.col,
          row: context.row,
          message: `variable indexed [:${item.identifier} ${indexes.join(" ")} ???], the ??? is not defined.`,
        },
      ]);
    }

    ret = ret[index];
  }

  return success({ spread: false, data: ret });
}
