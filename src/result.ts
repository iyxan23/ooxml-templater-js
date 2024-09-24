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

export function success<T>(result: T, issues: Issue[] = []): Result<T> {
  return {
    status: "success",
    result,
    issues,
    sym: resultSymbol,
  };
}

export function failure<T>(error: Issue, issues: Issue[] = []): Result<T> {
  return {
    status: "failed",
    error,
    issues,
    sym: resultSymbol,
  };
}

export function isResult(result: any): result is Result<any> {
  return result.sym === resultSymbol;
}
