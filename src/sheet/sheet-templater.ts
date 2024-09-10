import { extractHoistsAndBlocks, ExpressionCell, parseExpressionCell } from "./expression";
import { Sheet } from "./sheet";

interface TemplatableCell {
  getTextContent(): string;
  createCopyWithContent(content: string): this;
}

export class SheetTemplater<SheetT extends TemplatableCell, RowInfo, ColInfo> {
  private sheet: Sheet<SheetT>;

  // @ts-expect-error will be used later
  private rowInfo: Record<number, RowInfo> = {};
  // @ts-expect-error will be used later
  private colInfo: Record<number, ColInfo> = {};

  constructor(
    sheet: Sheet<SheetT>,

    rowInfo?: Record<number, RowInfo>,
    colInfo?: Record<number, ColInfo>,
  ) {
    this.sheet = sheet;
    this.sheet.optimizeSheet();

    if (rowInfo) this.rowInfo = rowInfo;
    if (colInfo) this.colInfo = colInfo;
  }

  interpret() {
    const parsedExpressions = this.parseExpressions();
    // @ts-expect-error will be used later
    const { variableHoists, blockHoists } =
      extractHoistsAndBlocks(parsedExpressions);

    // find hoists and collect them
    // and also match some blockStart and blockEnds
  }

  parseExpressions(): Sheet<ExpressionCell> {
    const expressionSheet = new Sheet<ExpressionCell>();
    const theSheet = this.sheet.getSheet();

    for (let r = 0; r < theSheet.length; r++) {
      for (let c = 0; c < theSheet[0]!.length; c++) {
        const cell = theSheet[r]![c];
        if (!cell) continue;

        const expressionCell = parseExpressionCell(cell.getTextContent());
        // skip if there are no expressions
        if (!expressionCell.some((c) => typeof c === "object")) continue;

        expressionSheet.setCell(c, r, expressionCell);
      }
    }

    return expressionSheet;
  }
}
