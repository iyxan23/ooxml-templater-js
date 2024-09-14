import type { ExpressionCell, Expression } from "./parser";

// one thing to keep in mind: in a single cell, there cannot be multiple
// startBlock expressions yet, it's a limitation of the current implementation
// and i don't find myself needing that. so i'm going to leave it as is for now

export type Block = {
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
  sheetBounds: { rowBound: number; colBound: number },
  getCell: (col: number, row: number) => ExpressionCell | null,
  setCell: (col: number, row: number, data: ExpressionCell) => void,
): {
  variableHoists: {
    expr: Extract<Expression, { type: "variableHoist" }>;
    col: number;
    row: number;
  }[];
  blocks: Block[];
} {
  const variableHoists: {
    expr: Extract<Expression, { type: "variableHoist" }>;
    col: number;
    row: number;
  }[] = [];

  const blocks: Block[] = [];

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
        const cell = getCell(col, row);
        if (cell === null) {
          col++;
          continue;
        }

        const {
          cell: result,
          blocks,
          endBlocks,
          jumpTo,
        } = parseCell(
          cell,
          col,
          row,
          (block) => block.identifier === "repeatRow",
        );

        setCell(col, row, result);
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
        const cell = getCell(col, row);
        if (cell === null) {
          row++;
          continue;
        }

        const {
          cell: result,
          blocks,
          endBlocks,
          jumpTo,
        } = parseCell(
          cell,
          col,
          row,
          (block) => block.identifier === "repeatCol",
        );
        setCell(col, row, result);
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
    removeEndBlock?: (
      endBlock: Extract<Expression, { type: "blockEnd" }>,
    ) => boolean,
  ): {
    cell: ExpressionCell;
    blocks: Block[];
    endBlocks: {
      identifier: string;
      index: number;
    }[];
    jumpTo?: { col: number; row: number };
  } {
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
        variableHoists.push({ expr: item, col, row });
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
        const removeIt = removeEndBlock?.(item) ?? false;

        if (removeIt) endBlocks.push({ identifier: item.identifier, index });
        else {
          resultingContent.push(item);
          continue;
        }
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

    return { cell: resultingContent, blocks, endBlocks, jumpTo };
  }

  while (row <= sheetBounds.rowBound) {
    while (col <= sheetBounds.colBound) {
      const cell = getCell(col, row);
      if (cell === null) {
        col++;
        continue;
      }

      const {
        cell: result,
        blocks: newBlocks,
        jumpTo,
      } = parseCell(cell, col, row, () => false);
      setCell(col, row, result);
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
