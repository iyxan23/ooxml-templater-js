// extractor provides an API that can be used to implement custom extraction
// logic from any form of way of storing expressions.

import type {
  BasicExpressionsWithStaticTexts,
  BasicExpression,
} from "./parser";

export interface Expressionish {
  getExpression(): BasicExpressionsWithStaticTexts;
  removeExpression(index: number): void;
  replaceExpression(expr: BasicExpression): void;
}

export interface Source<Addr, Item extends Expressionish> {
  getItem(addr: Addr): Item | null;
  setItem(addr: Addr, item: Item): void;
}

type VisitorAction<Item extends Expressionish> =
  | undefined
  | { replaceItem: Item }
  | { replaceExpr: BasicExpression }
  | { deleteExpr: true };

export interface Visitor<Addr, Item extends Expressionish> {
  visitSpecialCall(
    addr: Addr,
    item: Item,
    expr: Extract<BasicExpression, { type: "specialCall" }>,
    index: number,
  ): VisitorAction<Item>;

  visitCall(
    addr: Addr,
    item: Item,
    expr: Extract<BasicExpression, { type: "call" }>,
    index: number,
  ): VisitorAction<Item>;

  visitVariableAccess(
    addr: Addr,
    item: Item,
    expr: Extract<BasicExpression, { type: "variableAccess" }>,
    index: number,
  ): VisitorAction<Item>;

  visitSpread(
    addr: Addr,
    item: Item,
    expr: Extract<BasicExpression, { type: "spread" }>,
    index: number,
  ): VisitorAction<Item>;
}

export function extract<Addr, Item extends Expressionish>(
  source: Source<Addr, Item>,
  visitor: Visitor<Addr, Item>,
  start: Addr,
  advance: (curAddr: Addr) => Addr | null,
) {
  let curAddr: Addr | null = start;

  while (curAddr !== null) {
    const item = source.getItem(curAddr);
    if (!item) break;

    if (item.getExpression().length === 0) break;

    for (let index = 0; index < item.getExpression().length; index++) {
      const expr = item.getExpression()[index]!;
      if (typeof expr !== "object") continue;

      let result: VisitorAction<Item>;

      switch (expr.type) {
        case "call":
          result = visitor.visitCall(curAddr, item, expr, index);
          break;
        case "variableAccess":
          result = visitor.visitVariableAccess(curAddr, item, expr, index);
          break;
        case "spread":
          result = visitor.visitSpread(curAddr, item, expr, index);
          break;
        case "specialCall":
          result = visitor.visitSpecialCall(curAddr, item, expr, index);
          break;
      }

      if (result === undefined) continue;

      if ("replaceItem" in result) {
        source.setItem(curAddr, result.replaceItem);
        break;
      } else if ("replaceExpr" in result) {
        item.replaceExpression(result.replaceExpr);
        break;
      } else if ("deleteExpr" in result) {
        item.removeExpression(index);
      }
    }

    curAddr = advance(curAddr);
  }
}
