import {
  BasicExpression,
  BasicExpressionsWithStaticTexts,
  parseBasicExpressions,
} from "../expression/parser";
import { BodyElement } from "./doc-elements";
import { Issue, Result, success } from "../result";
import { Expressionish, extract, Source } from "../expression/extractor";
import { isNumeric } from "../utils";
import { evaluateExpression, TemplaterFunction } from "../expression/evaluate";
import { getBuiltinFunctions } from "../expression/function/builtin";

// @internal
export type DocAddr = number;

const docxBuiltinFunctions = getBuiltinFunctions<DocAddr>();

// @internal
export function performDocumentTemplating(
  items: BodyElement[],
  input: any,
  opts?: {
    functions: Record<string, TemplaterFunction<any, DocAddr>>;
  },
): Result<BodyElement[], DocAddr> {
  const issues: Issue<DocAddr>[] = [];

  const parsedItems = parseBodyElements(items);
  const extractionResult = extractVarsAndSpecials(parsedItems);

  if (extractionResult.status === "failed") return extractionResult;
  issues.push(...extractionResult.issues);
  const { variables: variableDefs, specials } = extractionResult.result;

  const variables: Record<DocAddr, Record<string, any>> = {};

  const variableEvalResult = evaluateVariables(variableDefs, {
    defineVariable: (addr, name, value) => {
      if (variables[addr] === undefined) variables[addr] = { [name]: value };
      else variables[addr] = value;
    },
    lookupVariable: (addr: DocAddr, varName: string) =>
      variables[addr]?.[varName] ?? input[varName],
  });

  if (variableEvalResult.status === "failed") return variableEvalResult;

  issues.push(...variableEvalResult.issues);

  const repeatLineResult = handleRepeatLines(items, specials.l.repeatLines, {
    lookupFunction: (funcName: string) =>
      docxBuiltinFunctions[funcName] ?? opts?.functions[funcName],
    lookupVariable: (addr: DocAddr, varName: string) =>
      variables[addr]?.[varName] ?? input[varName],
    defineVariable: (addr: DocAddr, name: string, value: any) => {
      if (variables[addr] === undefined) variables[addr] = { [name]: value };
      else variables[addr] = value;
    },
  });

  if (repeatLineResult.status === "failed") return repeatLineResult;
  issues.push(...repeatLineResult.issues);

  const newItems = repeatLineResult.result;

  // todo: evaluate expressions

  return success(newItems);
}

function evaluateVariables(
  variableDefs: Record<DocAddr, Record<string, Variable>>,
  {
    defineVariable,
    lookupVariable,
  }: {
    defineVariable: (addr: DocAddr, name: string, value: any) => void;
    lookupVariable: (addr: DocAddr, name: string) => any | undefined;
  },
): Result<void, DocAddr> {
  const issues: Issue<DocAddr>[] = [];

  for (const [addrStr, defs] of Object.entries(variableDefs)) {
    const addr = parseInt(addrStr);
    for (const [name, def] of Object.entries(defs)) {
      const result =
        typeof def.expr === "string"
          ? success<string, DocAddr>(def.expr)
          : evaluateExpression<DocAddr>(
            def.expr,
            { addr, callTree: ["<root>", "g#var", "arg0"] },
            (funcName: string) => docxBuiltinFunctions[funcName] ?? undefined,
            (varName) => lookupVariable(addr, varName),
          );

      if (result.status === "failed") {
        issues.push({
          message: `[g#var] failed to evaluate variable ${name}: ${result.error.message} at line ${result.error.addr}`,
          addr,
        });

        continue;
      }

      defineVariable(addr, name, result.result);
      issues.push(...result.issues);
    }
  }

  return success(undefined, issues);
}

function handleRepeatLines(
  items: BodyElement[],
  specials: Record<DocAddr, RepeatLine>,
  {
    lookupFunction,
    lookupVariable,
    defineVariable,
  }: {
    lookupFunction: (
      name: string,
    ) => TemplaterFunction<any, DocAddr> | undefined;
    lookupVariable: (addr: DocAddr, name: string) => any | undefined;
    defineVariable: (addr: DocAddr, name: string, value: any) => void;
  },
): Result<BodyElement[], DocAddr> {
  const issues: Issue<DocAddr>[] = [];
  const newItems: BodyElement[] = [];

  for (let addr = 0; addr < items.length; addr++) {
    const item = items[addr]!;
    const repeatLine = specials[addr];

    if (repeatLine === undefined) {
      newItems.push(item);
      continue;
    }

    let repeatCount;

    if (typeof repeatLine.expr === "string") {
      if (!isNumeric(repeatLine.expr)) {
        issues.push({
          message: `[l#repeatLine] count must be a number, got ${repeatLine.expr}`,
          addr,
        });

        continue;
      }

      repeatCount = parseInt(repeatLine.expr);
    } else {
      const result = evaluateExpression<DocAddr>(
        repeatLine.expr,
        { addr: addr, callTree: ["<root>", "l#repeatLine", "arg0"] },
        lookupFunction,
        (varName) => lookupVariable(addr, varName),
      );

      if (result.status === "failed") {
        issues.push({
          message: `[l#repeatLine] failed to evaluate count expression: ${result.error.message} at line ${result.error.addr}`,
          addr,
        });

        continue;
      }

      repeatCount = result.result;
      issues.push(...result.issues);
    }

    newItems.push(...Array(repeatCount).fill(item));

    for (let i = 0; i < repeatCount; i++)
      defineVariable(addr + i, repeatLine.idxVarIdentifier, i);
  }

  return success(newItems);
}

class ElementPair implements Expressionish {
  constructor(
    // the original BodyElement
    public elem: BodyElement,
    // the actual parsed expression
    public expr?: BasicExpressionsWithStaticTexts,
  ) { }

  getExpression(): BasicExpressionsWithStaticTexts {
    return this.expr ?? [];
  }

  removeExpression(index: number): void {
    if (!this.expr) return;

    this.expr.splice(index, 1);

    // merge adjacent strings
    const prev = this.expr[index - 1];
    const next = this.expr[index];
    if (typeof prev === "string" && typeof next === "string") {
      this.expr[index - 1] = prev + this.expr[index];
      this.expr.splice(index, 1);
      return;
    }
  }

  replaceExpression(expr: BasicExpression, index: number): void {
    if (!this.expr) return;

    this.expr[index] = expr;
  }
}

function parseBodyElements(elements: BodyElement[]): ElementPair[] {
  const expressions: ElementPair[] = [];

  for (const element of elements) {
    if (element.type === "paragraph") {
      if (!element.text) {
        expressions.push(new ElementPair(element));
        continue;
      }

      const { text } = element.text;
      const expr = parseBasicExpressions(text);

      expressions.push(new ElementPair(element, expr));
    } else if (element.type === "table") {
      // todo: handle tables
    } else {
      expressions.push(new ElementPair(element));
    }
  }

  return expressions;
}

class DocumentSource implements Source<number, ElementPair> {
  constructor(private elements: ElementPair[]) { }

  getItem(addr: number): ElementPair | null {
    return this.elements[addr] ?? null;
  }

  setItem(addr: number, item: ElementPair): void {
    this.elements[addr] = item;
  }
}

type Variable = {
  identifier: string;
  expr: BasicExpression | string;
};

type RepeatLine = {
  expr: BasicExpression | string;
  idxVarIdentifier: string;
};

function extractVarsAndSpecials(parsedItems: ElementPair[]): Result<
  {
    variables: Record<DocAddr, Record<string, Variable>>;
    specials: {
      l: {
        repeatLines: Record<DocAddr, RepeatLine>;
      };
    };
  },
  DocAddr
> {
  const variables: Record<DocAddr, Record<string, Variable>> = {};
  const specials: { l: { repeatLines: Record<string, RepeatLine> } } = {
    l: { repeatLines: {} },
  };

  const issues: Issue<DocAddr>[] = [];

  extract<DocAddr, ElementPair>(
    new DocumentSource(parsedItems),
    {
      visitSpecialCall(addr, _item, expr, _index) {
        const args = expr.args;
        if (expr.code === "l" && expr.identifier === "repeatLine") {
          if (args.length !== 2) {
            issues.push({
              message:
                "[l#repeatLine] requires two arguments: [l#repeatLine [expr] ..ident..]",
              addr,
            });

            return { deleteExpr: true };
          }

          const countExpr = expr.args[0]!;
          const idxVarIdentifier = expr.args[1]!;

          if (typeof idxVarIdentifier !== "string") {
            issues.push({
              message: "[l#repeatLine] 2nd argument must be a text identifier",
              addr,
            });

            return { deleteExpr: true };
          }

          specials.l.repeatLines[addr] = {
            expr: countExpr,
            idxVarIdentifier,
          };

          return { deleteExpr: true };
        } else if (
          expr.code === "g" &&
          (expr.identifier === "var" || expr.identifier === "hoist")
        ) {
          if (args.length !== 2) {
            issues.push({
              message: "[g#var] requires two arguments: [g#var ident [expr]]",
              addr,
            });

            return { deleteExpr: true };
          }

          const identifier = expr.args[0]!;
          const varExpr = expr.args[1]!;

          if (typeof identifier !== "string") {
            issues.push({
              message: "[g#var] 1st argument must be a text identifier",
              addr,
            });

            return { deleteExpr: true };
          }

          if (variables[addr] === undefined) {
            variables[addr] = {};
          }

          variables[addr][identifier] = {
            identifier,
            expr: varExpr,
          };

          return { deleteExpr: true };
        }

        issues.push({
          message: `unhandled special call [${expr.code}#${expr.identifier}]`,
          addr,
        });

        return { deleteExpr: true };
      },
    },
    0,
    (addr) => (addr + 1 >= parsedItems.length ? null : addr + 1),
  );

  return success({ variables, specials }, issues);
}
