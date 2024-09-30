import { parseElements } from "./elements";
import { Issue, Result, success } from "../result";
import { TemplaterFunction } from "../expression/evaluate";
import { getBuiltinFunctions } from "../expression/function/builtin";

// @internal
export type DocAddr = number;

const docxBuiltinFunctions = getBuiltinFunctions<DocAddr>();

// @internal
export function performDocumentTemplating(
  documentElement: any,
  input: any,
  opts?: {
    functions: Record<string, TemplaterFunction<any, DocAddr>>;
  },
): Result<any[], DocAddr> {
  const document = Array.isArray(documentElement)
    ? documentElement
    : [documentElement];

  const bodyElements = parseElements(document);
  const issues: Issue<DocAddr>[] = [];

  for (let i = 0; i < bodyElements.length; i++) {
    const elem = bodyElements[i]!;

    const expansionResult = elem.expand(
      { addr: i, callTree: ["<root>"] },
      (varName) => input[varName],
      (funcName) => opts?.functions[funcName] ?? docxBuiltinFunctions[funcName],
    );

    if (expansionResult.status === "failed") return expansionResult;
    issues.push(...expansionResult.issues);
  }

  for (let i = 0; i < bodyElements.length; i++) {
    const elem = bodyElements[i]!;

    const evalResult = elem.evaluate(
      { addr: i, callTree: ["<root>"] },
      (varName) => input[varName],
      (funcName) => opts?.functions[funcName] ?? docxBuiltinFunctions[funcName],
    );

    if (evalResult.status === "failed") return evalResult;
    issues.push(...evalResult.issues);
  }

  return success(bodyElements.map((elem) => elem.rebuild()).flat(), issues);
}
