// extractor provides an API that can be used to implement custom extraction
// logic from any form of way of storing expressions.

import type {
  BasicExpressionsWithStaticTexts,
  BasicExpression,
} from "./parser";

export interface Expressionish {
  getExpression(): BasicExpressionsWithStaticTexts;
  removeExpression(index: number): void;
  replaceExpression(expr: BasicExpression, index: number): void;
}

export interface Source<Addr, Item extends Expressionish> {
  getItem(addr: Addr): Item | null;
  setItem(addr: Addr, item: Item): void;
}

type VisitorAction<Item extends Expressionish> =
  | { replaceItem: Item }
  | { replaceExpr: BasicExpression; replaceExprIndex: number }
  | { deleteExpr: true };

export interface Visitor<Addr, Item extends Expressionish> {
  visitSpecialCall?(
    addr: Addr,
    item: Item,
    expr: Extract<BasicExpression, { type: "specialCall" }>,
    index: number,
  ): VisitorAction<Item> | void;

  visitCall?(
    addr: Addr,
    item: Item,
    expr: Extract<BasicExpression, { type: "call" }>,
    index: number,
  ): VisitorAction<Item> | void;

  visitVariableAccess?(
    addr: Addr,
    item: Item,
    expr: Extract<BasicExpression, { type: "variableAccess" }>,
    index: number,
  ): VisitorAction<Item> | void;
}

export function extract<Addr, Item extends Expressionish>(
  source: Source<Addr, Item>,
  visitor: Visitor<Addr, Item>,
  start: Addr,
  advance: (curAddr: Addr) => Addr | null,
  beforeVisitExpression?: (
    expr: BasicExpression,
    addr: Addr,
  ) => void | { stop: true; removeExpr: boolean },
) {
  let curAddr: Addr | null = start;

  outer: while (curAddr !== null) {
    const item = source.getItem(curAddr);

    if (item) {
      for (let index = 0; index < item.getExpression().length; index++) {
        const expr = item.getExpression()[index]!;
        if (typeof expr !== "object") continue;

        const { stop, removeExpr } = beforeVisitExpression?.(expr, curAddr) ?? {
          stop: false,
          removeExpr: false,
        };

        if (stop) {
          if (removeExpr) item.removeExpression(index);
          break outer;
        }

        let result: VisitorAction<Item> | void = undefined;

        switch (expr.type) {
          case "call":
            result = visitor.visitCall?.(curAddr, item, expr, index);
            break;
          case "variableAccess":
            result = visitor.visitVariableAccess?.(curAddr, item, expr, index);
            break;
          case "specialCall":
            result = visitor.visitSpecialCall?.(curAddr, item, expr, index);
            break;
        }

        if (!result) continue;

        if ("replaceItem" in result) {
          source.setItem(curAddr, result.replaceItem);
          break;
        } else if ("replaceExpr" in result) {
          item.replaceExpression(result.replaceExpr, result.replaceExprIndex);
        } else if ("deleteExpr" in result) {
          item.removeExpression(index);
        }
      }
    }

    curAddr = advance(curAddr);
  }
}
