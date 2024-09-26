import {
  BasicExpression,
  BasicExpressionsWithStaticTexts,
  parseBasicExpressions,
} from "../expression/parser";
import { BodyElement } from "./doc-elements";
import { Issue, Result, success } from "../result";
import { Expressionish, extract, Source } from "../expression/extractor";

// @internal
export function performTemplating(
  items: BodyElement[],
  input: any,
): Result<BodyElement[]> {
  const parsedItems = parseBodyElements(items);
  const result = extractVarsAndSpecials(parsedItems);

  if (result.status === "failed") return result;
  const { variables, specials } = result.result;

  console.log(JSON.stringify(input, null, 2));
  console.log(JSON.stringify(variables, null, 2));
  console.log(JSON.stringify(specials, null, 2));

  return success(items);
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

function extractVarsAndSpecials(parsedItems: ElementPair[]): Result<{
  variables: Record<number, Record<string, Variable>>;
  specials: {
    l: {
      repeatLines: Record<number, RepeatLine>;
    };
  };
}> {
  const variables: Record<number, Record<string, Variable>> = {};
  const specials: { l: { repeatLines: Record<string, RepeatLine> } } = {
    l: { repeatLines: {} },
  };

  const issues: Issue[] = [];

  extract<number, ElementPair>(
    new DocumentSource(parsedItems),
    {
      visitSpecialCall(addr, _item, expr, _index) {
        const args = expr.args;
        if (expr.code === "l" && expr.identifier === "repeatLine") {
          if (args.length !== 2) {
            // issues.push({
            //   message: "[l#repeatLine] requires two arguments: [l#repeatLine [expr] ..ident..]"
            // })
            // todo: make issue generic
            throw new Error(
              "[l#repeatLine] requires two arguments: [l#repeatLine [expr] ..ident..]",
            );
          }

          const countExpr = expr.args[0]!;
          const idxVarIdentifier = expr.args[1]!;

          if (typeof idxVarIdentifier !== "string") {
            // todo: make issue generic
            throw new Error(
              "[l#repeatLine] 2nd argument must be a text identifier",
            );
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
            // issues.push({
            //   message: "[g#var] requires two arguments: [g#var ident [expr]]"
            // })
            // todo: make issue generic
            throw new Error(
              "[g#var] requires two arguments: [g#var ident [expr]]",
            );
          }

          const identifier = expr.args[0]!;
          const varExpr = expr.args[1]!;

          if (typeof identifier !== "string") {
            // todo: make issue generic
            throw new Error("[g#var] 1st argument must be a text identifier");
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

        // todo: make issue generic
        console.warn(
          "unhandled special call",
          `[${expr.code}#${expr.identifier}]`,
        );
        return { deleteExpr: true };
      },
    },
    0,
    (addr) => (addr + 1 >= parsedItems.length ? null : addr + 1),
  );

  return success({ variables, specials }, issues);
}
