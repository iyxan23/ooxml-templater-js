import { Result, success } from "../../result";
import { BodyElement } from ".";
import { DocAddr } from "../doc-templater";

const W_TBL_PR = "w:tblPr";
const W_TBL_GRID = "w:tblGrid";

const W_TR = "w:tr";

// @internal
export class TableElement implements BodyElement {
  private tblPr: any[] | null = null;
  private tblGrid: GridCols | null = null;
  private rows: any[] = [];
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
        this.rows.push(node[W_TR]);
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

class GridCols {
  private cols: GridCol[] = [];
  private other: any[] = [];

  constructor(private rawTblGrid: any[]) {
    for (const node of this.rawTblGrid) {
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
