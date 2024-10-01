import { Issue, Result, success } from "../../result";
import { BodyElement } from ".";
import { DocAddr } from "../doc-templater";
import { startVisiting } from "../../visitor-editor";
import {
  BasicExpressionsWithStaticTexts,
  parseBasicExpressions,
} from "../../expression/parser";
import {
  evaluateExpression,
  TemplaterFunction,
} from "../../expression/evaluate";
import { isNumeric } from "../../utils";

const W_TBL_PR = "w:tblPr";
const W_TBL_GRID = "w:tblGrid";

const W_TR = "w:tr";

// @internal
export class TableElement implements BodyElement {
  private tblPr: any[] | null = null;
  private tblGrid: GridCols | null = null;
  private rows: TableRow[] = [];
  private other: any[] = [];

  constructor(private obj: any) {
    const tableNodes = Array.isArray(this.obj) ? this.obj : [this.obj];

    for (const node of tableNodes) {
      const keys = Object.keys(node);
      if (keys.includes(W_TBL_PR)) {
        this.tblPr = node[W_TBL_PR];
      } else if (keys.includes(W_TBL_GRID)) {
        this.tblGrid = new GridCols(node[W_TBL_GRID]);
      } else if (keys.includes(W_TR)) {
        this.rows.push(new TableRow(node[W_TR]));
      } else {
        this.other.push(node);
      }
    }
  }

  expand(
    context: {
      addr: DocAddr;
      callTree: string[];
    },
    getVariable: (name: string) => any,
    getFunction: (name: string) => TemplaterFunction<any, DocAddr> | undefined,
  ): Result<void, DocAddr> {
    const issues: Issue<DocAddr>[] = [];
    const repeatedRows: Record<
      number,
      { count: number; ident: string; start: number; end: number }[]
    > = {};

    for (let rowIdx = 0; rowIdx < this.rows.length; rowIdx++) {
      const row = this.rows[rowIdx]!;
      let currentRepeatRow: {
        col: number;
        count: number;
        ident: string;
      } | null = null;

      cell: for (let col = 0; col < row.cells.length; col++) {
        const cell = row.cells[col]!;

        expr: for (let i = 0; i < cell.parsedExpr.length; i++) {
          const item = cell.parsedExpr[i];
          if (typeof item !== "object" || item.type !== "specialCall")
            continue expr;

          if (item.code !== "r" || item.identifier !== "repeatRow") {
            issues.push({
              message: `Unknown special call [${item.code}#${item.identifier}]`,
              addr: context.addr,
            });

            continue expr;
          }

          if (item.closing) {
            if (!currentRepeatRow) {
              issues.push({
                message: `closing [/r#repeatRow] with no opening`,
                addr: context.addr,
              });

              continue expr;
            }

            // complete, opening closed
            if (repeatedRows[rowIdx] == undefined) repeatedRows[rowIdx] = [];

            repeatedRows[rowIdx]!.push({
              count: currentRepeatRow.count,
              ident: currentRepeatRow.ident,
              start: currentRepeatRow.col,
              end: col,
            });

            currentRepeatRow = null;

            continue expr;
          } else {
            if (!!currentRepeatRow) {
              // opening with already opened
              issues.push({
                message: `r#repeatRow cannot be used more than once on the same row at row ${rowIdx}`,
                addr: context.addr,
              });

              continue expr;
            }
          }

          const repeatLineCountArg = item.args[0];
          const repeatLineIdxArg = item.args[1];

          let repeatLineCount;
          if (typeof repeatLineCountArg !== "string") {
            const evalResult = evaluateExpression<DocAddr>(
              item,
              context,
              getFunction,
              getVariable,
            );

            if (evalResult.status === "failed") return evalResult;
            issues.push(...evalResult.issues);

            repeatLineCount = evalResult.result;
          }

          if (
            typeof repeatLineCount === "string" &&
            isNumeric(repeatLineCount)
          ) {
            repeatLineCount = Number(repeatLineCount);
          } else {
            issues.push({
              message: `invalid first argument of l#repeatLine: ${repeatLineCountArg} (must be a number, or evaluate to a number)`,
              addr: context.addr,
            });

            continue expr;
          }

          if (typeof repeatLineIdxArg !== "string") {
            issues.push({
              message: `invalid second argument of l#repeatLine: ${repeatLineIdxArg} (must be a text for identifier)`,
              addr: context.addr,
            });

            continue expr;
          }

          currentRepeatRow = {
            col,
            count: repeatLineCount,
            ident: repeatLineIdxArg,
          };
        }
      }
    }

    // todo: expand from repeatRows

    return success(undefined, issues);
  }

  evaluate(): Result<void, DocAddr> {
    return success(undefined);
  }

  rebuild(): any[] {
    return [
      this.tblPr ? { [W_TBL_PR]: this.tblPr } : {},
      this.tblGrid ? { [W_TBL_GRID]: this.tblGrid.rebuild() } : {},
      ...this.rows,
      ...this.other,
    ];
  }
}

class TableRow {
  public cells: TableCell[] = [];
  private other: any[] = [];

  constructor(rawTr: any[]) {
    for (const node of rawTr) {
      const keys = Object.keys(node);
      if (keys.includes("w:tc")) {
        this.cells.push(node["w:tc"]);
      } else {
        this.other.push(node);
      }
    }
  }

  rebuild(): any[] {
    return [...this.cells.map((c) => ({ "w:tc": c.rebuild() })), ...this.other];
  }
}

class TableCell {
  public w: number;
  private textPath: string[] | null;
  public parsedExpr: BasicExpressionsWithStaticTexts;

  constructor(private raw: any) {
    let w;
    for (const node of raw) {
      const nodeKeys = Object.keys(node);

      if (nodeKeys.includes("w:tcPr")) {
        const tcPr = node["w:tcPr"];
        for (const tcPrItem of tcPr) {
          const tcPrItemKeys = Object.keys(tcPrItem);
          if (tcPrItemKeys.includes("w:tcW")) {
            w = parseInt(tcPrItem["w:tcW"][":@"]["@_w:w"]);
          }
        }
      }
    }

    if (!w) throw new Error("unable to find width of cell");

    this.w = w;

    // find text
    let textPath: string[] | null = null;

    startVisiting(raw, {
      before: {
        "w:t": [
          (_node, path) => {
            textPath = path;
            return {};
          },
        ],
      },
      after: {},
    });

    this.textPath = textPath ?? null;
    this.parsedExpr = parseBasicExpressions(
      textPath ? raw[textPath[0]]["#text"] : null,
    );
  }

  evaluateAndSet(
    context: {
      addr: DocAddr;
      callTree: string[];
    },
    getVariable: (name: string) => any,
    getFunction: (name: string) => TemplaterFunction<any, DocAddr> | undefined,
  ): Result<void, DocAddr> {
    let result = "";
    const issues: Issue<DocAddr>[] = [];

    for (const item of this.parsedExpr) {
      if (typeof item === "string") {
        result += item;
        continue;
      }

      const evalResult = evaluateExpression<DocAddr>(
        item,
        context,
        getFunction,
        getVariable,
      );

      if (evalResult.status === "failed") return evalResult;
      issues.push(...evalResult.issues);

      result += evalResult.result;
    }

    this.text = result;

    return success(undefined, issues);
  }

  get text(): string | null {
    if (!this.textPath) return null;

    let cur = this.raw;
    for (const p of this.textPath) cur = cur[p];

    const textNode = cur.find((c: any) => Object.keys(c).includes("#text"));
    return textNode["#text"];
  }

  set text(newText: string) {
    if (!this.textPath) return;

    let cur = this.raw;
    for (const p of this.textPath) cur = cur[p];

    const textNode = cur.find((c: any) => Object.keys(c).includes("#text"));
    textNode["#text"] = newText;
  }

  rebuild(): any[] {
    return this.raw;
  }
}

class GridCols {
  private cols: GridCol[] = [];
  private other: any[] = [];

  constructor(rawTblGrid: any[]) {
    for (const node of rawTblGrid) {
      const keys = Object.keys(node);
      if (keys.includes("w:gridCol")) {
        this.cols.push(new GridCol(node["w:gridCol"]));
      } else {
        this.other.push(node);
      }
    }
  }

  get sum() {
    return this.cols.reduce((a, b) => a + b.w, 0);
  }

  // if `index` is undefined, this will add to the end
  insertCol(col: GridCol, index?: number) {
    const sum = this.sum;
    const count = this.cols.length;
    const othersSum = sum - (sum / count + 1);

    for (const col of this.cols) {
      const ratio = col.w / sum / count;
      col.w = ratio * othersSum;
    }

    this.cols.splice(index ?? this.cols.length, 0, col);
  }

  rebuild(): any[] {
    return [...this.cols.map((c) => c.rebuild()), ...this.other];
  }
}

class GridCol {
  public w: number;

  constructor(private rawGridCol: any) {
    this.w = parseInt(rawGridCol[":@"]["@_w:w"]);
  }

  rebuild(): any {
    const cloned = structuredClone(this.rawGridCol);
    cloned[":w"]["@_w:w"] = this.w.toString();

    return cloned;
  }
}
