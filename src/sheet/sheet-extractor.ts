import { Expressionish, extract, Source } from "src/expression/extractor";
import {
  BasicExpression,
  BasicExpressionsWithStaticTexts,
} from "src/expression/parser";
import { Sheet } from "./sheet";
import { Issue } from "src/result";

export type Block = {
  identifier: string;
  arg: BasicExpression;
  indexVariableIdentifier: string;

  direction: "col" | "row";

  innerBlocks: Block[];

  start: {
    col: number;
    row: number;

    // inclusive index of an item in a BasicExpression where this block starts
    // e.g. ['hello', { blockStart }, 'world'] will have a `block.start.startsAt = 1`
    // because blockStart will be removed, the part that will be repeated will be
    // ['hello', 'world'] <- 'world' will be repeated
    startsAt: number;
  };
  end: {
    col: number;
    row: number;

    // inclusive index of an item in a BasicExpression where this block ends
    // e.g. ['hello', { blockEnd }, 'world'] will have a `block.start.endsAt = 1`
    // because blockEnd will be removed, the part that will be repeated will be
    // ['hello', 'world'] <- 'hello' will be repeated
    endsAt: number;
  };
};

class BasicExpressionsWrapper<SheetT> implements Expressionish {
  constructor(
    public exprs: BasicExpressionsWithStaticTexts,
    public extraData: SheetT,
  ) {}

  getExpression(): BasicExpressionsWithStaticTexts {
    return this.exprs;
  }

  removeExpression(index: number): void {
    this.exprs.splice(index, 1);
  }

  replaceExpression(expr: BasicExpression, index: number): void {
    this.exprs[index] = expr;
  }
}

type SheetAddr = [number, number];

class SheetAdapter<SheetT>
  implements Source<SheetAddr, BasicExpressionsWrapper<SheetT>>
{
  constructor(
    private sheet: Sheet<[BasicExpressionsWithStaticTexts, SheetT]>,
  ) {}

  getItem(addr: SheetAddr): BasicExpressionsWrapper<SheetT> | null {
    const [col, row] = addr;
    const cell = this.sheet.getCell(col, row);

    if (cell === null) return null;
    const [exprs, extraData] = cell;

    return new BasicExpressionsWrapper<SheetT>(exprs, extraData);
  }

  setItem(addr: SheetAddr, item: BasicExpressionsWrapper<SheetT>): void {
    const [col, row] = addr;
    this.sheet.setCell(col, row, [item.exprs, item.extraData]);
  }
}

export type VariableHoist = {
  identifier: string;
  expr: BasicExpression | string;
  col: number;
  row: number;
};

export function extractVarsAndBlocks<SheetT>(
  sheet: Sheet<[BasicExpressionsWithStaticTexts, SheetT]>,
): {
  blocks: Block[];
  variables: VariableHoist[];
  issues: Issue[];
} {
  const source = new SheetAdapter<SheetT>(sheet);
  const { rowBound, colBound } = sheet.getBounds();

  const blocks: Block[] = [];
  const variables: VariableHoist[] = [];
  const issues: Issue[] = [];

  extract<SheetAddr, BasicExpressionsWrapper<SheetT>>(
    source,
    {
      visitCall(addr, _item, expr, _index) {
        if (expr.identifier !== "hoist" && expr.identifier !== "var") return;

        // this is a variable hoist
        const [col, row] = addr;
        const args = expr.args;

        if (args.length !== 2) {
          issues.push({
            message: "variable declaration must have two arguments",
            col,
            row,
          });

          return { deleteExpr: true };
        }

        const [variableIdent, value] = args;

        if (typeof variableIdent !== "string") {
          issues.push({
            message:
              "variable declaration's first argument must be an identifier",
            col,
            row,
          });

          return { deleteExpr: true };
        }

        variables.push({
          identifier: variableIdent,
          expr: value!,
          col,
          row,
        });

        return { deleteExpr: true };
      },
    },
    [0, 0],
    ([curCol, curRow]) =>
      curCol >= colBound
        ? curRow >= rowBound
          ? null
          : [0, curRow + 1]
        : [curCol + 1, curRow],
  );

  return { blocks, variables, issues };
}
