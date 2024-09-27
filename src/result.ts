export const resultSymbol = Symbol("result");
export type ResultSymbol = typeof resultSymbol;

export type Issue<Addr> = {
  addr: Addr;
  message: string;
  index?: number;
};

export type Result<T, Addr> =
  | { status: "success"; result: T; issues: Issue<Addr>[]; sym: ResultSymbol }
  | { status: "failed"; issues: Issue<Addr>[]; error: Issue<Addr>; sym: ResultSymbol };

export function success<T, Addr>(result: T, issues: Issue<Addr>[] = []): Result<T, Addr> {
  return {
    status: "success",
    result,
    issues,
    sym: resultSymbol,
  };
}

export function failure<T, Addr>(error: Issue<Addr>, issues: Issue<Addr>[] = []): Result<T, Addr> {
  return {
    status: "failed",
    error,
    issues,
    sym: resultSymbol,
  };
}

export function isResult(result: any): result is Result<any, any> {
  return result.sym === resultSymbol;
}
