import { Result, success } from "../../result";
import { BodyElement } from ".";
import { DocAddr } from "../doc-templater";
import { startVisiting } from "src/visitor-editor";

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

  expand(): Result<void, DocAddr> {
    return success(undefined);
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
