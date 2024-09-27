import { z } from "zod";
import { LambdaFunction, TemplaterFunction } from "../evaluate";
import { failure, Result, success } from "../../result";

export function createTemplaterNoArgsFunction<R, Addr>(
  call: () => R,
): TemplaterFunction<R, Addr> {
  return () => success(call());
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
export function callLambda<Addr>(
  f: Function,
): (opts: {
  variables?: Record<string, any>;
  customVariableResolver?: (variableName: string) => any;
}) => Result<any, Addr> {
  return (opts) =>
    f(
      (vName: string) =>
        opts.customVariableResolver?.(vName) ?? opts.variables?.[vName],
    );
}

type MapFunctionToLambda<T, Addr> = T extends (...args: any[]) => infer R
  ? LambdaFunction<R, Addr>
  : T;
type MapFunctionsToLambdas<T, Addr> = {
  [K in keyof T]: MapFunctionToLambda<T[K], Addr>;
};

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
export function createTemplaterFunction<
  Addr,
  ReturnType,
  ArgsZod extends z.AnyZodTuple,
>(
  schema: ArgsZod,
  call: (
    ...args: MapFunctionsToLambdas<z.infer<ArgsZod>, Addr>
  ) => Result<ReturnType, Addr>,
): TemplaterFunction<ReturnType, Addr> {
  return ({ functionName, ...context }, ...args: any) => {
    const result = schema.safeParse(args);

    if (!result.success) {
      // todo: parse zod errors to get detailed errors
      //       and perhaps be able to return the arguments of this function
      //       call to make it easier to debug
      return failure(
        {
          message: `Invalid arguments while calling ${functionName}. trace: ${context.callTree.join(" > ")}`,
          addr: context.addr,
        },
        [],
      );
    }

    try {
      return call(...(result.data as MapFunctionsToLambdas<z.infer<ArgsZod>, Addr>));
    } catch (e) {
      return failure(
        {
          message: `Error while calling ${functionName}. trace: ${context.callTree.join(
            " > ",
          )}. Error: ${JSON.stringify(e)}`,
          addr: context.addr,
        },
        [],
      );
    }
  };
}
