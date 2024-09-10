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
      collectHoistsAndLabelBlocks(parsedExpressions);

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

type Block = {
  identifier: string;
  arg: Expression;
  indexVariableIdentifier: string;

  direction: "col" | "row";

  // counted per col/row depending on the identifier
  blockContent: ExpressionCell[];
  lastCellAfterBlockEnd: ExpressionCell; // the content after block end

  start: {
    col: number;
    row: number;
  };
  end: {
    col: number;
    row: number;
  };
};
export function collectHoistsAndLabelBlocks(
  expressionSheet: Sheet<ExpressionCell>,
): {
  variableHoists: Extract<Expression, { type: "variableHoist" }>[];
  blocks: Block[];
} {
  const variableHoists: Extract<Expression, { type: "variableHoist" }>[] = [];
  const blocks: Block[] = [];

  const sheetBounds = expressionSheet.getBounds();
  let row = 0;
  let col = 0;

  function parseCell(parsedExpression: ExpressionCell): ExpressionCell {
    const resultingContent: ExpressionCell = [];

    for (let index = 0; index < parsedExpression.length; index++) {
      const item = parsedExpression[index]!;

      if (typeof item !== "object") {
        resultingContent.push(item);
        continue;
      }

      if (item.type === "variableHoist") {
        variableHoists.push(item);

        // merge the string at the front/back together
        const prevElement = resultingContent[resultingContent.length - 1];
        const nextElement = parsedExpression[index + 1];

        if (
          index > 0 &&
          typeof prevElement === "string" &&
          typeof nextElement === "string"
        ) {
          resultingContent[resultingContent.length - 1] =
            `${prevElement}${nextElement}`;
          index++; // skip the nextElement
        }

        continue;
      } else if (item.type === "blockStart") {
        const block = parseBlock(item);
        blocks.push(block);
        continue;
      } else if (item.type === "blockEnd") {
        resultingContent.push(item);
        continue;
      }

      resultingContent.push(item);
    }

    return resultingContent;
  }

  function parseBlock(
    blockStart: Extract<Expression, { type: "blockStart" }>,
  ): Block {
    const previous = { col, row };
    const blockContent = [];
    let lastCellAfterBlockEnd = [];

    if (blockStart.identifier === "repeatRow") {
      col++;
      // expect a [#repeatRow [<number>] <identifier>] ... [/#repeatRow] going in the direction of a row
      const repeatCountExpr = blockStart.args[0];
      if (typeof repeatCountExpr !== "object")
        throw new Error(`at row ${row}, column ${col}: expected an expression`);

      const indexVariableIdentifier = blockStart.args[1];
      if (typeof indexVariableIdentifier !== "string")
        throw new Error(
          `at row ${row}, column ${col}: expected an identifier to name the index variable`,
        );

      // go to cells to the right, until we encounter a blockEnd with the same identifier [/#repeatRow]
      while (col <= sheetBounds.colBound) {
        const cell = expressionSheet.getCell(col, row);
        if (cell === null) {
          col++;
          continue;
        }

        const result = parseCell(cell);
        if (result) {
          const indexOfBlockEnd = result.findIndex(
            (item) => typeof item !== "string" && item.type === "blockEnd",
          );

          if (indexOfBlockEnd === -1) {
            expressionSheet.setCell(col, row, result);
            blockContent.push(result);
            col++;
            continue;
          }

          // we have a block end!
          const blockEnd = result[indexOfBlockEnd] as unknown as Extract<
            Expression,
            { type: "blockEnd" }
          >;

          if (blockEnd.identifier !== blockStart.identifier) {
            // apparently not ours
            console.warn(
              `unexpectedly encountered a block end with different identifier. block start is ${blockStart.identifier}, block end is ${blockEnd.identifier}. skipping.`,
            );

            // continue
            expressionSheet.setCell(col, row, result);
            blockContent.push(result);
            col++;
            continue;
          }

          const contentBefore = result.slice(0, indexOfBlockEnd);
          if (contentBefore) blockContent.push();
          lastCellAfterBlockEnd = result.slice(indexOfBlockEnd + 1);

          return {
            identifier: blockStart.identifier,
            arg: repeatCountExpr,
            indexVariableIdentifier,
            direction: "row",
            blockContent,
            lastCellAfterBlockEnd,
            start: { ...previous },
            end: { col, row },
          };
        }
        col++;
      }
    } else if (blockStart.identifier === "repeatCol") {
      row++;
      // expect a [#repeatCol [<number>] <identifier>] ... [/#repeatCol] going in the direction of a column
      const repeatCountExpr = blockStart.args[0];
      if (typeof repeatCountExpr !== "object")
        throw new Error(`at row ${row}, column ${col}: expected an expression`);

      const indexVariableIdentifier = blockStart.args[1];
      if (typeof indexVariableIdentifier !== "string")
        throw new Error(
          `at row ${row}, column ${col}: expected an identifier to name the index variable`,
        );

      // go to cells to the right, until we encounter a blockEnd with the same identifier [/#repeatCol]
      while (row <= sheetBounds.rowBound) {
        const cell = expressionSheet.getCell(col, row);
        if (cell === null) {
          col++;
          continue;
        }

        const result = parseCell(cell);
        if (result) {
          const indexOfBlockEnd = result.findIndex(
            (item) => typeof item !== "string" && item.type === "blockEnd",
          );

          if (indexOfBlockEnd === undefined) {
            expressionSheet.setCell(col, row, result);
            blockContent.push(result);
            col++;
            continue;
          }

          // we have a block end!
          const blockEnd = result[indexOfBlockEnd] as unknown as Extract<
            Expression,
            { type: "blockEnd" }
          >;

          if (blockEnd.identifier !== blockStart.identifier) {
            // apparently not ours
            console.warn(
              `unexpectedly encountered a block end with different identifier. block start is ${blockStart.identifier}, block end is ${blockEnd.identifier}. skipping.`,
            );

            // continue
            expressionSheet.setCell(col, row, result);
            blockContent.push(result);
            col++;
            continue;
          }

          blockContent.push(result.slice(0, indexOfBlockEnd));
          lastCellAfterBlockEnd = result.slice(indexOfBlockEnd + 1);

          // get back to the previous col & row and + 1
          const nextRow = previous.col + 1 >= sheetBounds.colBound;
          col = nextRow ? 0 : previous.col + 1;
          row = nextRow ? previous.row + 1 : previous.row;

          return {
            identifier: blockStart.identifier,
            arg: repeatCountExpr,
            indexVariableIdentifier,
            direction: "col",
            blockContent,
            lastCellAfterBlockEnd,
            start: { ...previous },
            end: { col, row },
          };
        }

        row++;
      }
    }

    throw new Error(
      `block with identifier \`${blockStart.identifier}\` at col ${previous.col}, row ${previous.row} is not closed`,
    );
  }

  while (row <= sheetBounds.rowBound) {
    while (col <= sheetBounds.colBound) {
      const cell = expressionSheet.getCell(col, row);
      if (cell === null) {
        col++;
        continue;
      }

      const result = parseCell(cell);
      if (result) expressionSheet.setCell(col, row, result);

      col++;
    }

    col = 0;
    row++;
  }

  return { variableHoists, blocks };
}

export function parseExpressionCell(s: string): ExpressionCell {
  const result: ExpressionCell = [];
  let currentBuf = "";
  let index = 0;

  function parseExpression(): Expression {
    let type: Expression["type"] | null = null;
    let identifier: string | null = null;
    let args: (string | Expression)[] = [];

    if (s[index] === "[") {
      index++;
    } else if (s[index] === "{") {
      index++;

      while (s[index] !== "[" && index < s.length) index++;
      const content = parseExpression();
      while (s[index] !== "}" && index < s.length) index++;

      return {
        type: "lambda",
        expression: content,
      };
    }

    if (s[index] === " " || s[index] === "\t") {
      while ((s[index] === " " || s[index] === "\t") && index < s.length)
        index++;
    }

    if (s[index] === ":") {
      type = "variableAccess";
      index++;
    } else if (s[index] === "#") {
      type = "blockStart";
      index++;
    } else if (s[index] === "/" && s[index + 1] === "#") {
      type = "blockEnd";
      index++;
      index++;
    } else {
      type = "call";
    }

    let char;
    while ((char = s[index]) !== "]") {
      if (char === "[" || char === "{") {
        args.push(parseExpression());
        index++;
        continue;
      } else if (char === " " || char === "\t") {
        if (!currentBuf) {
          index++;
          continue;
        }

        if (!identifier) {
          if (currentBuf === "hoist") {
            type = "variableHoist";
          } else if (type === "variableHoist") {
            identifier = currentBuf;
          } else {
            identifier = currentBuf;
          }
        } else {
          args.push(currentBuf);
        }

        currentBuf = "";
        index++;

        continue;
      }

      if (index >= s.length) {
        console.error("[err] parser gone too far");
        break;
      }

      currentBuf += char;
      index++;
    }

    if (!identifier) {
      if (currentBuf === "hoist") {
        type = "variableHoist";
      } else if (type === "variableHoist") {
        identifier = currentBuf;
      } else {
        identifier = currentBuf;
      }
      currentBuf = "";
    } else if (currentBuf) {
      args.push(currentBuf);
      currentBuf = "";
    }

    if (!identifier) throw new Error("identifier has not been set yet");
    if (!type) throw new Error("could not determine the type");

    if (type === "blockStart" || type === "variableAccess" || type === "call") {
      return {
        type,
        identifier,
        args,
      };
    } else if (type === "blockEnd") {
      return {
        type,
        identifier,
      };
    } else if (type === "variableHoist") {
      const expression = args[0];
      if (!expression) throw new Error("expression must be set for hoist");
      if (typeof expression === "string")
        throw new Error("variable content must be an expression");

      return {
        type,
        identifier,
        expression,
      };
    }

    throw new Error("unreachable");
  }

  while (index < s.length) {
    const char = s[index];

    if (char === "[") {
      if (currentBuf) result.push(currentBuf);
      currentBuf = "";

      const expr = parseExpression();
      result.push(expr);
    } else {
      currentBuf += char;
    }

    index++;
  }

  if (currentBuf) result.push(currentBuf);

  return result;
}

export type ExpressionCell = (string | Expression)[];

export type Expression =
  | {
      type: "blockStart";
      identifier: string;
      args: (string | Expression)[];
    }
  | {
      type: "blockEnd";
      identifier: string;
    }
  | {
      type: "call";
      identifier: string;
      args: (string | Expression)[];
    }
  | {
      type: "variableAccess";
      identifier: string;
      args: (string | Expression)[];
    }
  | {
      type: "variableHoist";
      identifier: string;
      expression: Expression;
    }
  | {
      type: "lambda";
      expression: Expression;
    };
