import { Sheet } from "./sheet";

// one thing to keep in mind: in a single cell, there cannot be multiple
// startBlock expressions yet, it's a limitation of the current implementation
// and i don't find myself needing that. so i'm going to leave it as is for now

type Block = {
  identifier: string;
  arg: Expression;
  indexVariableIdentifier: string;

  direction: "col" | "row";

  innerBlocks: Block[];

  start: {
    col: number;
    row: number;

    // inclusive index of an item in an ExpressionCell where this block starts
    // e.g. ['hello', { blockStart }, 'world'] will have a `block.start.startsAt = 1`
    // because blockStart will be removed, the part that will be repeated will be
    // ['hello', 'world'] <- 'world' will be repeated
    startsAt: number;
  };
  end: {
    col: number;
    row: number;

    // inclusive index of an item in an ExpressionCell where this block ends
    // e.g. ['hello', { blockEnd }, 'world'] will have a `block.start.endsAt = 1`
    // because blockEnd will be removed, the part that will be repeated will be
    // ['hello', 'world'] <- 'hello' will be repeated
    endsAt: number;
  };
};

type NestedOmit<
  Schema,
  Path extends string,
> = Path extends `${infer Head}.${infer Tail}`
  ? Head extends keyof Schema
    ? {
        [K in keyof Schema]: K extends Head
          ? NestedOmit<Schema[K], Tail>
          : Schema[K];
      }
    : Schema
  : Omit<Schema, Path>;

// This is stage 1 of the expression interpreter
//
// What this function does is that it:
//
//  1. extracts `[hoist .. ..]` expressions off of the given sheet (removes it
//     by mutating the given sheet), and
//
//  2. extracts `[#block .. ..]` and `[/#block]` expressions off of the given
//     sheet (removing by mutating it)
//
// then returns both the hoists and the blocks that exists in this sheet
export function extractHoistsAndBlocks(
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

  function parseBlock(
    blockStart: Extract<Expression, { type: "blockStart" }>,
    col: number,
    row: number,
  ): {
    // startsAt
    block: NestedOmit<Block, "start.startsAt">;
    jumpTo: { col: number; row: number };
  } {
    console.log(
      `parseBlock started at col ${col} row ${row}: ${blockStart.identifier}\n`,
    );
    const previous = { col, row };
    const innerBlocks: Block[] = [];

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

        const {
          cell: result,
          blocks,
          endBlocks,
          jumpTo,
        } = parseCell(cell, col, row);
        expressionSheet.setCell(col, row, result);
        innerBlocks.push(...blocks);

        if (jumpTo) {
          // jumpTo is here to prevent us from reading the same cells twice
          col = jumpTo.col;
          row = jumpTo.row;
        }

        if (!result) {
          col++;
          continue;
        }

        const endBlock = endBlocks.find(
          (b) => b.identifier === blockStart.identifier,
        );

        if (!endBlock) {
          col++;
          continue;
        }

        console.log(`block ${blockStart.identifier} ended`);

        return {
          block: {
            identifier: blockStart.identifier,
            innerBlocks,
            arg: repeatCountExpr,
            indexVariableIdentifier,
            direction: "row",
            start: { ...previous },
            end: { col, row, endsAt: endBlock.index },
          },
          jumpTo: { col, row },
        };
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
          row++;
          continue;
        }

        const {
          cell: result,
          blocks,
          endBlocks,
          jumpTo,
        } = parseCell(cell, col, row);
        expressionSheet.setCell(col, row, result);
        innerBlocks.push(...blocks);

        if (jumpTo) {
          // jumpTo is here to prevent us from reading the same cells twice
          col = jumpTo.col;
          row = jumpTo.row;
        }

        if (!result) {
          row++;
          continue;
        }

        const endBlock = endBlocks.find(
          (b) => b.identifier === blockStart.identifier,
        );

        if (!endBlock) {
          row++;
          continue;
        }

        console.log(`block ${blockStart.identifier} ended`);

        return {
          block: {
            identifier: blockStart.identifier,
            innerBlocks,
            arg: repeatCountExpr,
            indexVariableIdentifier,
            direction: "col",
            start: { ...previous },
            end: { col, row, endsAt: endBlock.index },
          },
          jumpTo: previous,
        };
      }
    }

    throw new Error(
      `block with identifier \`${blockStart.identifier}\` at col ${previous.col}, row ${previous.row} is not closed`,
    );
  }

  function parseCell(
    parsedExpression: ExpressionCell,
    col: number,
    row: number,
  ): {
    cell: ExpressionCell;
    blocks: Block[];
    endBlocks: {
      identifier: string;
      index: number;
    }[];
    jumpTo?: { col: number; row: number };
  } {
    console.log(
      `parseCell with cell ${JSON.stringify(parsedExpression)} at col ${col} row ${row}`,
    );
    const blocks: Block[] = [];
    const endBlocks: {
      identifier: string;
      index: number;
    }[] = [];
    const resultingContent: ExpressionCell = [];
    let jumpTo: { col: number; row: number } | undefined;
    let parsedABlock = false;

    for (let index = 0; index < parsedExpression.length; index++) {
      const item = parsedExpression[index]!;

      if (typeof item !== "object") {
        resultingContent.push(item);
        continue;
      }

      if (item.type === "variableHoist") {
        variableHoists.push(item);
      } else if (item.type === "blockStart") {
        if (parsedABlock)
          throw new Error(
            "cannot have two startBlock expressions in the same cell, this" +
              " is a limitation of the current implementation.",
          );

        const { block, jumpTo: blockJumpTo } = parseBlock(item, col, row);

        jumpTo = blockJumpTo;
        blocks.push({ ...block, start: { ...block.start, startsAt: index } });
        parsedABlock = true;
      } else if (item.type === "blockEnd") {
        endBlocks.push({ identifier: item.identifier, index });
      } else {
        resultingContent.push(item);
        continue;
      }

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
    }

    console.log(
      `parseCell ended with ${JSON.stringify(resultingContent)}, blocks: ${blocks.map((b) => b.identifier).join(",")}, endBlocks: ${endBlocks.map((e) => e.identifier).join(",")}`,
    );

    return { cell: resultingContent, blocks, endBlocks, jumpTo };
  }

  while (row <= sheetBounds.rowBound) {
    while (col <= sheetBounds.colBound) {
      const cell = expressionSheet.getCell(col, row);
      if (cell === null) {
        col++;
        continue;
      }

      const {
        cell: result,
        blocks: newBlocks,
        jumpTo,
      } = parseCell(cell, col, row);
      expressionSheet.setCell(col, row, result);
      if (jumpTo) {
        // jumpTo is here to prevent us from reading the same cells twice
        col = jumpTo.col;
        row = jumpTo.col;
      }

      blocks.push(...newBlocks);

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
