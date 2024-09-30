import { Result, success } from "../../result";
import { BodyElement } from ".";
import { DocAddr } from "../doc-templater";

const W_TBL_PR = "w:tblPr";
const W_TBL_GRID = "w:tblGrid";

const W_TR = "w:tr";

// @internal
export class TableElement implements BodyElement {
  private tblPr: any[] | null = null;
  private tblGrid: any[] | null = null;
  private rows: any[] = [];
  private other: any[] = [];

  constructor(private obj: any) {
    const tableNodes = Array.isArray(this.obj) ? this.obj : [this.obj];

    for (const node of tableNodes) {
      const keys = Object.keys(node);
      if (keys.includes(W_TBL_PR)) {
        this.tblPr = node[W_TBL_PR];
      } else if (keys.includes(W_TBL_GRID)) {
        this.tblGrid = node[W_TBL_GRID];
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
      this.tblGrid ? { [W_TBL_GRID]: this.tblGrid } : {},
      ...this.rows,
      ...this.other,
    ];
  }
}
