/** ## Sheet Extractor
 *
 * "Sheet Extractor" is an API that implements `src/expression/extractor.ts` to
 * extract variable definitions and blocks which will then be evaluated and
 * expanded respectively in `./sheet-templater.ts`.
 */

import { Expressionish, extract, Source } from "../expression/extractor";
import {
  BasicExpression,
  BasicExpressionsWithStaticTexts,
} from "../expression/parser";
import { Sheet } from "./sheet";
import { Issue } from "../result";

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

    // check if the items on the left and right are strings, if so, combine
    // them together
    const prev = this.exprs[index - 1];
    const next = this.exprs[index];
    if (typeof prev === "string" && typeof next === "string") {
      this.exprs[index - 1] = prev + this.exprs[index];
      this.exprs.splice(index, 1);
      return;
    }
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

// @internal
export type VariableHoist = {
  identifier: string;
  expr: BasicExpression | string;
  col: number;
  row: number;
};

// @internal
export type Block = {
  identifier: string;
  code: string;
  arg: BasicExpression | string;
  indexVariableIdentifier: string;

  direction: "col" | "row";

  innerBlocks: Block[];

  start: {
    col: number;
    row: number;
  };
  end: {
    col: number;
    row: number;
  };
};

// @internal
export function extractVarsAndBlocks<SheetT>(
  sheet: Sheet<[BasicExpressionsWithStaticTexts, SheetT]>,
): {
  blocks: Block[];
  variables: VariableHoist[];
  issues: Issue[];
} {
  const { rowBound, colBound } = sheet.getBounds();

  return extractVarsAndBlocksInternal(sheet, [0, 0], ([curCol, curRow]) => {
    return curCol >= colBound
      ? curRow >= rowBound
        ? null
        : [0, curRow + 1]
      : [curCol + 1, curRow];
  });
}

function extractVarsAndBlocksInternal<SheetT>(
  sheet: Sheet<[BasicExpressionsWithStaticTexts, SheetT]>,
  from: SheetAddr,
  advance: (addr: SheetAddr) => SheetAddr | null,
  beforeVisitExpression?: Parameters<
    typeof extract<SheetAddr, BasicExpressionsWrapper<SheetT>>
  >[4],
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

      visitSpecialCall(addr, _item, expr, _index) {
        const [col, row] = addr;

        // todo: make this extensible
        const available: Record<string, Record<string, boolean>> = {
          r: { repeatRow: true },
          c: { repeatCol: true },
        };

        if (!available[expr.code]?.[expr.identifier]) {
          issues.push({
            message: `unknown special call "${expr.code}#${expr.identifier}"`,
            col,
            row,
          });

          return { deleteExpr: true };
        }

        // ignore closing special calls
        if (expr.closing) {
          issues.push({
            message: `closing special call "${expr.identifier}" encountered without an opening`,
            col,
            row,
          });

          return { deleteExpr: true };
        }

        const args = expr.args;

        if (expr.code === "r" && expr.identifier === "repeatRow") {
          if (args.length !== 2) {
            issues.push({
              message:
                "repeatRow must have at least two arguments: number of repeats, and a local index variable identifier",
              col,
              row,
            });

            return { deleteExpr: true };
          }

          // recursively spin up another extractor that searches for the
          // closing repeatRow
          let closingExpr: { col: number; row: number } | undefined = undefined;

          const next = advance([col, row]);
          if (next === null) {
            issues.push({
              message: "repeatRow reached the end of the sheet",
              col,
              row,
            });
            return { deleteExpr: true };
          }

          const {
            blocks: innerBlocks,
            variables: newVariables,
            issues: otherIssues,
          } = extractVarsAndBlocksInternal(
            sheet,
            next,
            ([cCol, cRow]) => {
              // stop once we found a closing repeatRow
              if (closingExpr !== undefined) return null;

              if (cCol + 1 > colBound) {
                if (cRow + 1 > rowBound) return null;
                return [0, cRow + 1];
              }

              return [cCol + 1, cRow];
            },
            (expr, addr) => {
              if (expr.type !== "specialCall") return;
              if (expr.code !== "r" && expr.identifier !== "repeatRow") return;
              if (!expr.closing) return;

              const [cCol, cRow] = addr;

              closingExpr = { col: cCol, row: cRow };

              // we got it!
              return { stop: true, removeExpr: true };
            },
          );

          variables.push(...newVariables);
          issues.push(...otherIssues);

          if (closingExpr === undefined) {
            issues.push({
              message: "closing repeatRow not found",
              col,
              row,
            });

            return { deleteExpr: true };
          }

          const [numRepeats, indexVariableIdent] = args;

          if (typeof indexVariableIdent !== "string") {
            issues.push({
              message: "repeatRow's second argument must be an identifier",
              col,
              row,
            });

            return { deleteExpr: true };
          }

          blocks.push({
            identifier: "repeatRow",
            code: "r",
            arg: numRepeats!,
            indexVariableIdentifier: indexVariableIdent,

            direction: "row",
            innerBlocks,

            start: { col, row },
            end: closingExpr,
          });

          return { deleteExpr: true };
        } else if (expr.code === "c" && expr.identifier === "repeatCol") {
          if (args.length !== 2) {
            issues.push({
              message:
                "repeatRow must have at least two arguments: number of repeats, and a local index variable identifier",
              col,
              row,
            });

            return { deleteExpr: true };
          }

          // recursively spin up another extractor that searches for the
          // closing repeatCol
          let closingExpr: { col: number; row: number } | undefined = undefined;

          const next: [number, number] = [col, row + 1];

          const {
            blocks: innerBlocks,
            variables: newVariables,
            issues: otherIssues,
          } = extractVarsAndBlocksInternal(
            sheet,
            next,
            ([cCol, cRow]) => {
              // stop once we found a closing repeatRow
              if (closingExpr !== undefined) return null;

              // literally just go down
              if (cRow + 1 > rowBound) return null;
              return [cCol, cRow + 1];
            },
            (expr, addr) => {
              if (expr.type !== "specialCall") return;
              if (expr.code !== "c" && expr.identifier !== "repeatCol") return;
              if (!expr.closing) return;

              const [cCol, cRow] = addr;

              closingExpr = { col: cCol, row: cRow };

              // we got it!
              return { stop: true, removeExpr: true };
            },
          );

          variables.push(...newVariables);
          issues.push(...otherIssues);

          if (closingExpr === undefined) {
            issues.push({
              message: "closing repeatCol not found",
              col,
              row,
            });

            return { deleteExpr: true };
          }

          const [numRepeats, indexVariableIdent] = args;

          if (typeof indexVariableIdent !== "string") {
            issues.push({
              message: "repeatCol's second argument must be an identifier",
              col,
              row,
            });

            return { deleteExpr: true };
          }

          blocks.push({
            identifier: "repeatCol",
            code: "c",
            arg: numRepeats!,
            indexVariableIdentifier: indexVariableIdent,

            direction: "col",
            innerBlocks,

            start: { col, row },
            end: closingExpr,
          });

          return { deleteExpr: true };
        }

        return { deleteExpr: true };
      },
    },
    from,
    advance,
    beforeVisitExpression,
  );

  return { blocks, variables, issues };
}
