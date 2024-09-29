import { parseElements } from "./elements";
import { Result, success } from "../result";
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

  for (let i = 0; i < bodyElements.length; i++) {
    const elem = bodyElements[i]!;

    elem.expand(
      { addr: i, callTree: ["<root>"] },
      (varName) => input[varName],
      (funcName) => opts?.functions[funcName] ?? docxBuiltinFunctions[funcName],
    );
  }

  for (let i = 0; i < bodyElements.length; i++) {
    const elem = bodyElements[i]!;

    elem.evaluate(
      { addr: i, callTree: ["<root>"] },
      (varName) => input[varName],
      (funcName) => opts?.functions[funcName] ?? docxBuiltinFunctions[funcName],
    );
  }

  return success(bodyElements.map((elem) => elem.rebuild()).flat(), []);
}
