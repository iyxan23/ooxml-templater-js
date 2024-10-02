import { failure, Issue, Result, success } from "../../result";
import { BodyElement } from ".";
import { DocAddr } from "../doc-templater";
import { startVisiting } from "../../visitor-editor";
import {
  BasicExpression,
  BasicExpressionsWithStaticTexts,
  parseBasicExpressions,
} from "../../expression/parser";
import {
  evaluateExpression,
  TemplaterFunction,
} from "../../expression/evaluate";
import { isNumeric } from "../../utils";
import { Expressionish, extract, Source } from "../../expression/extractor";

const W_TBL_PR = "w:tblPr";
const W_TBL_GRID = "w:tblGrid";

const W_TR = "w:tr";

type RepeatRow = {
  row: number;
  startCol: number;
  endCol: number;

  innerRepeats: RepeatRow[];

  count: BasicExpression | string;
  idxIdent: string;
};

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

  private extractSpecialCalls(
    source: TableRowsSource,
    context: { addr: TableAddr },
  ): Result<RepeatRow[], TableAddr> {
    const issues: Issue<TableAddr>[] = [];
    const repeatRows: RepeatRow[] = [];

    function handleRepeatRow(
      starting: TableAddr,
      expr: Extract<BasicExpression, { type: "specialCall" }>,
    ): RepeatRow | null {
      if (expr.args.length !== 2) {
        issues.push({
          message: `r#repeatRow takes two arguments: [r#repeatRow [count] idx]`,
          addr: context.addr,
        });
      }

      const repeatRowCountArg = expr.args[0]!;
      const repeatRowIdxArg = expr.args[1]!;

      if (typeof repeatRowIdxArg !== "string") {
        issues.push({
          message: `invalid second argument of r#repeatRow: ${repeatRowIdxArg} (must be a text for identifier)`,
          addr: context.addr,
        });

        return null;
      }

      let closing: TableAddr | null = null;
      const innerRepeatRows: RepeatRow[] = [];

      extract<TableAddr, TableCell>(
        source,
        {
          visitSpecialCall(addr, _item, expr) {
            if (expr.code !== "r" || expr.identifier !== "repeatRow") {
              issues.push({
                message: `Unknown special call [${expr.code}#${expr.identifier}]`,
                addr: context.addr,
              });

              return { deleteExpr: true };
            }

            if (!expr.closing) {
              const result = handleRepeatRow(
                { col: addr.col + 1, row: addr.row },
                expr,
              );

              // todo: do something
              if (!result) return { deleteExpr: true };

              innerRepeatRows.push(result);
            } else {
              closing = { col: addr.col, row: addr.row };
            }

            return { deleteExpr: true };
          },
        },
        starting,
        ({ col: prevCol, row: prevRow }) => {
          if (prevCol + 1 >= source.getMaxColumns()) return null;
          return {
            col: prevCol + 1,
            row: prevRow,
          };
        },
      );

      if (closing == null) {
        issues.push({
          message: `r#repeatRow at col ${starting.col + 1}, row ${starting.row + 1} is not closed`,
          addr: context.addr,
        });

        return null;
      }

      return {
        row: starting.row,
        startCol: starting.col,
        // @ts-expect-error false positive, closing is not `never`
        endCol: closing.col,
        innerRepeats: innerRepeatRows,
        count: repeatRowCountArg,
        idxIdent: repeatRowIdxArg,
      };
    }

    extract<TableAddr, TableCell>(
      source,
      {
        visitSpecialCall(addr, _item, expr) {
          if (expr.code !== "r" || expr.identifier !== "repeatRow") {
            issues.push({
              message: `Unknown special call [${expr.code}#${expr.identifier}]`,
              addr: context.addr,
            });

            return { deleteExpr: true };
          }

          const repeatRow = handleRepeatRow(
            { col: addr.col + 1, row: addr.row },
            expr,
          );

          if (repeatRow != null) repeatRows.push(repeatRow);

          return { deleteExpr: true };
        },
      },
      { col: 0, row: 0 },
      ({ col: prevCol, row: prevRow }) => {
        if (prevCol + 1 >= source.getMaxColumns())
          return {
            col: 0,
            row: prevRow + 1,
          };
        return {
          col: prevCol + 1,
          row: prevRow,
        };
      },
    );

    return success(repeatRows, issues);
  }

  expand(
    context: {
      addr: DocAddr;
      callTree: string[];
    },
    getVariable: (name: string) => any,
    getFunction: (name: string) => TemplaterFunction<any, DocAddr> | undefined,
  ): Result<void, DocAddr> {
    console.log("EXPANDING TABLE");
    const issues: Issue<DocAddr>[] = [];
    const source = new TableRowsSource(this.rows);

    const extractionResult = this.extractSpecialCalls(source, {
      addr: { col: 0, row: 0 },
    });

    if (extractionResult.status === "failed") {
      return failure(
        { ...extractionResult.error, addr: context.addr },
        extractionResult.issues.map((ei) => ({ ...ei, addr: context.addr })),
      );
    }

    issues.push(
      ...extractionResult.issues.map((ei) => ({ ...ei, addr: context.addr })),
    );

    const repeatRows = extractionResult.result;

    for (const repeatRow of repeatRows) {
      const repeatRowCountArg = repeatRow.count;
      const repeatRowIdxArg = repeatRow.idxIdent;

      let repeatRowCount;
      if (typeof repeatRowCountArg !== "string") {
        const evalResult = evaluateExpression<DocAddr>(
          repeatRowCountArg,
          context,
          getFunction,
          getVariable,
        );

        if (evalResult.status === "failed") return evalResult;
        issues.push(...evalResult.issues);

        repeatRowCount = evalResult.result;
      }

      if (typeof repeatRowCount === "string" && isNumeric(repeatRowCount)) {
        repeatRowCount = Number(repeatRowCount);
      } else {
        issues.push({
          message: `invalid first argument of r#repeatRow: ${repeatRowCountArg} (must be a number, or evaluate to a number), at table col ${repeatRow.startCol + 1} row ${repeatRow.row + 1}`,
          addr: context.addr,
        });

        continue;
      }

      if (typeof repeatRowIdxArg !== "string") {
        issues.push({
          message: `invalid second argument of r#repeatRow: ${repeatRowIdxArg} (must be a string), at table col ${repeatRow.startCol + 1} row ${repeatRow.row + 1}`,
          addr: context.addr,
        });

        continue;
      }

      // todo: repeat this row `repeatRowCount` times
    }

    return success(undefined, issues);
  }

  evaluate(
    context: { addr: DocAddr; callTree: string[] },
    getVariable: (name: string) => any,
    getFunction: (name: string) => TemplaterFunction<any, DocAddr> | undefined,
  ): Result<void, DocAddr> {
    const issues: Issue<DocAddr>[] = [];

    for (const row of this.rows) {
      for (const cell of row.cells) {
        const evalResult = cell.evaluateAndSet(
          context,
          getFunction,
          getVariable,
        );

        if (evalResult.status === "failed") return evalResult;
        issues.push(...evalResult.issues);
      }
    }

    return success(undefined, issues);
  }

  rebuild(): any[] {
    return [
      {
        "w:tbl": [
          this.tblPr ? { [W_TBL_PR]: this.tblPr } : {},
          this.tblGrid ? { [W_TBL_GRID]: this.tblGrid.rebuild() } : {},
          ...this.rows.map((r) => ({ [W_TR]: r.rebuild() })),
          ...this.other,
        ],
      },
    ];
  }
}

type TableAddr = { col: number; row: number };

class TableRowsSource implements Source<TableAddr, TableCell> {
  constructor(private rows: TableRow[]) { }

  getItem(addr: TableAddr): TableCell | null {
    const { col, row } = addr;
    return this.rows[row]?.cells[col] ?? null;
  }

  setItem(addr: TableAddr, item: TableCell): void {
    const { col, row } = addr;
    if (!this.rows[row]) {
      console.warn("[TableRowsSource] trying to setItem when no row at", row);
      return;
    }

    this.rows[row].cells[col] = item;
  }

  getMaxColumns(): number {
    return this.rows[0]?.cells.length ?? 0;
  }
}

class TableRow {
  public cells: TableCell[] = [];
  private other: any[] = [];

  constructor(rawTr: any[]) {
    for (const node of rawTr) {
      const keys = Object.keys(node);
      if (keys.includes("w:tc")) {
        this.cells.push(new TableCell(node["w:tc"]));
      } else {
        this.other.push(node);
      }
    }
  }

  rebuild(): any {
    return [...this.cells.map((c) => ({ "w:tc": c.rebuild() })), ...this.other];
  }
}

class TableCell implements Expressionish {
  public w: number;
  private textPath: string[] | null;
  public parsedExpr: BasicExpressionsWithStaticTexts | null;

  constructor(private raw: any) {
    let w;
    for (const node of raw) {
      const nodeKeys = Object.keys(node);

      if (nodeKeys.includes("w:tcPr")) {
        const tcPr = node["w:tcPr"];
        for (const tcPrItem of tcPr) {
          const tcPrItemKeys = Object.keys(tcPrItem);
          if (tcPrItemKeys.includes("w:tcW")) {
            w = parseInt(tcPrItem[":@"]["@_w:w"]);
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
    this.parsedExpr = this.text ? parseBasicExpressions(this.text) : null;
  }

  evaluateAndSet(
    context: {
      addr: DocAddr;
      callTree: string[];
    },
    getVariable: (name: string) => any,
    getFunction: (name: string) => TemplaterFunction<any, DocAddr> | undefined,
  ): Result<void, DocAddr> {
    if (!this.parsedExpr) return success(undefined);

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

  rebuild(): any {
    return this.raw;
  }

  // -- implements Expressionish

  getExpression(): BasicExpressionsWithStaticTexts {
    return this.parsedExpr ?? [];
  }

  removeExpression(index: number): void {
    if (!this.parsedExpr) {
      console.warn(
        "[TableCell] trying to removeExpression at",
        index,
        "when no parsedExpr",
      );

      return;
    }

    this.parsedExpr.splice(index, 1);

    // check if the items on the left and right are strings, if so, combine
    // them together
    const prev = this.parsedExpr[index - 1];
    const next = this.parsedExpr[index];
    if (typeof prev === "string" && typeof next === "string") {
      this.parsedExpr[index - 1] = prev + this.parsedExpr[index];
      this.parsedExpr.splice(index, 1);
      return;
    }
  }

  replaceExpression(expr: BasicExpression, index: number): void {
    if (!this.parsedExpr) {
      console.warn(
        "[TableCell] trying to replaceExpression at",
        index,
        "when no parsedExpr",
      );

      return;
    }

    this.parsedExpr[index] = expr;
  }
}

class GridCols {
  private cols: GridCol[] = [];
  private other: any[] = [];

  constructor(rawTblGrid: any[]) {
    for (const node of rawTblGrid) {
      const keys = Object.keys(node);
      if (keys.includes("w:gridCol")) {
        this.cols.push(new GridCol(node));
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
    cloned[":@"]["@_w:w"] = this.w.toString();

    return cloned;
  }
}
