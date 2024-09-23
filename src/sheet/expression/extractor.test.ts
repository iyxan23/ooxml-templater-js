import { describe, it, expect } from "vitest";
import { extractHoistsAndBlocks } from "./extractor";
import { parseBasicExpressions, type BasicExpressionsWithStaticTexts } from "./parser";
import { Sheet } from "../sheet";

function sheetAdapter(
  sheet: Sheet<BasicExpressionsWithStaticTexts>,
): Parameters<typeof extractHoistsAndBlocks> {
  return [
    sheet.getBounds(),
    (col, row) => sheet.getCell(col, row),
    (col, row, data) => sheet.setCell(col, row, data),
  ];
}

describe("extractHoistsAndBlocks", () => {
  it("should collect a variable hoist", () => {
    const sheet = new Sheet<BasicExpressionsWithStaticTexts>([
      [
        parseBasicExpressions(" hello worldd!"),
        parseBasicExpressions(
          "freeform [hoist hello [string hello world]] text horayy",
        ),
        parseBasicExpressions("hii hellooo"),
      ],
    ]);

    const collected = extractHoistsAndBlocks(...sheetAdapter(sheet));

    expect(collected).toEqual({
      variableHoists: [
        {
          expr: {
            identifier: "hello",
            type: "variableHoist",
            expression: {
              type: "call",
              identifier: "string",
              args: ["hello", "world"],
            },
          },
          col: 1,
          row: 0,
        },
      ],
      blocks: [],
    });

    expect(sheet.getWholeRow({ row: 0 })).toEqual([
      [" hello worldd!"],
      ["freeform  text horayy"],
      ["hii hellooo"],
    ]);
  });

  it("should label a simple repeatRow block", () => {
    const sheet = new Sheet<BasicExpressionsWithStaticTexts>([
      [
        parseBasicExpressions("[#repeatRow [hello] ident]"),
        parseBasicExpressions("i should be repeating by now"),
        parseBasicExpressions("[/#repeatRow]"),
      ],
    ]);

    const collected = extractHoistsAndBlocks(...sheetAdapter(sheet));

    expect(collected).toEqual({
      variableHoists: [],
      blocks: [
        {
          identifier: "repeatRow",
          arg: { type: "call", identifier: "hello", args: [] },
          indexVariableIdentifier: "ident",
          direction: "row",
          innerBlocks: [],
          end: { col: 2, row: 0, endsAt: 0 },
          start: { col: 0, row: 0, startsAt: 0 },
        },
      ],
    });

    // assert that the blocks are removed
    expect(sheet.getWholeRow({ row: 0 })).toEqual([
      [],
      ["i should be repeating by now"],
      [],
    ]);
  });

  it("should label a simple repeatRow block with a lastCellAfterBlockEnd", () => {
    const sheet = new Sheet<BasicExpressionsWithStaticTexts>([
      [
        parseBasicExpressions(" hello worldd!"),
        parseBasicExpressions("[#repeatRow [hello] ident]"),
        parseBasicExpressions("i should be repeating by now"),
        parseBasicExpressions("[hello world]"),
        parseBasicExpressions("[/#repeatRow] woah [:cool alright] test"),
      ],
      [
        parseBasicExpressions("don't mind me"),
        null,
        null,
        parseBasicExpressions("not supposed to be included"),
      ],
    ]);

    const collected = extractHoistsAndBlocks(...sheetAdapter(sheet));

    expect(collected).toEqual({
      variableHoists: [],
      blocks: [
        {
          identifier: "repeatRow",
          arg: { type: "call", identifier: "hello", args: [] },
          indexVariableIdentifier: "ident",
          innerBlocks: [],
          direction: "row",
          end: { col: 4, row: 0, endsAt: 0 },
          start: { col: 1, row: 0, startsAt: 0 },
        },
      ],
    });

    // assert that the blocks are removed
    expect(sheet.getWholeRow({ row: 0 })).toEqual([
      [" hello worldd!"],
      [],
      ["i should be repeating by now"],
      [
        {
          type: "call",
          identifier: "hello",
          args: ["world"],
        },
      ],
      [
        " woah ",
        {
          type: "variableAccess",
          identifier: "cool",
          args: ["alright"],
        },
        " test",
      ],
    ]);
  });

  it("should error when repeatRow is not closed", () => {
    expect(() =>
      extractHoistsAndBlocks(
        ...sheetAdapter(
          new Sheet<BasicExpressionsWithStaticTexts>([
            [
              parseBasicExpressions("[#repeatRow [hello] ident]"),
              parseBasicExpressions("i should be repeating by now"),
            ],
          ]),
        ),
      ),
    ).toThrowError(
      "block with identifier `repeatRow` at col 0, row 0 is not closed",
    );
  });

  it("should error when repeatRow is not closed 2", () => {
    expect(() =>
      extractHoistsAndBlocks(
        ...sheetAdapter(
          new Sheet<BasicExpressionsWithStaticTexts>([
            [parseBasicExpressions("hmm")],
            [
              parseBasicExpressions("hello world"),
              parseBasicExpressions("i should be repeating by now"),
              parseBasicExpressions("[#repeatRow [hello] ident]"),
              parseBasicExpressions("what"),
            ],
            [
              parseBasicExpressions("hello world"),
              parseBasicExpressions("testt"),
              parseBasicExpressions("i should be repeating by now"),
              parseBasicExpressions("what"),
            ],
          ]),
        ),
      ),
    ).toThrowError(
      "block with identifier `repeatRow` at col 2, row 1 is not closed",
    );
  });

  it("should label a repeatCol", () => {
    const sheet = new Sheet<BasicExpressionsWithStaticTexts>([
      [
        ["hello world"],
        ["2nd col"],
        parseBasicExpressions("[#repeatCol [:hello] world]"),
        ["shouldn't be included"],
      ],
      [
        ["this shouldn't"],
        ["this shouldn't"],
        ["this should be repeating"],
        ["this shouldn't"],
      ],
      [
        ["not this"],
        ["not this"],
        parseBasicExpressions("[/#repeatCol]"),
        ["not this"],
      ],
    ]);

    const collected = extractHoistsAndBlocks(...sheetAdapter(sheet));

    expect(collected).toEqual({
      variableHoists: [],
      blocks: [
        {
          identifier: "repeatCol",
          arg: { type: "variableAccess", identifier: "hello", args: [] },
          indexVariableIdentifier: "world",
          direction: "col",
          innerBlocks: [],
          end: { col: 2, row: 2, endsAt: 0 },
          start: { col: 2, row: 0, startsAt: 0 },
        },
      ],
    });

    expect(sheet.getWholeCol({ col: 2 })).toEqual([
      [],
      ["this should be repeating"],
      [],
    ]);
  });

  it("should label a repeatCol 2", () => {
    const sheet = new Sheet<BasicExpressionsWithStaticTexts>([
      [
        ["hello world"],
        parseBasicExpressions("[nope]"),
        ["shouldn't be included"],
        ["not this"],
      ],
      [
        ["hello world"],
        parseBasicExpressions(
          "[just before block] is [#repeatCol [:hello] world]",
        ),
        ["shouldn't be included"],
        ["not this"],
        ["not this"],
      ],
      [
        ["this shouldn't"],
        parseBasicExpressions("[here is a call [:hello] world]"),
        ["this shouldn't"],
        ["not this"],
      ],
      [
        ["this shouldn't"],
        parseBasicExpressions("hmm cool [test hello world] wow"),
        ["this shouldn't"],
        ["not this"],
      ],
      [
        ["not this"],
        parseBasicExpressions("[/#repeatCol] after block [is this]"),
        ["not this"],
        ["not this"],
      ],
    ]);

    const collected = extractHoistsAndBlocks(...sheetAdapter(sheet));

    expect(collected).toEqual({
      variableHoists: [],
      blocks: [
        {
          identifier: "repeatCol",
          arg: { type: "variableAccess", identifier: "hello", args: [] },
          indexVariableIdentifier: "world",
          innerBlocks: [],
          direction: "col",
          end: { col: 1, row: 4, endsAt: 0 },
          start: { col: 1, row: 1, startsAt: 2 },
        },
      ],
    });

    expect(sheet.getWholeCol({ col: 1 })).toEqual([
      [
        {
          type: "call",
          identifier: "nope",
          args: [],
        },
      ],
      [
        {
          type: "call",
          identifier: "just",
          args: ["before", "block"],
        },
        " is ",
      ],
      [
        {
          type: "call",
          identifier: "here",
          args: [
            "is",
            "a",
            "call",
            {
              type: "variableAccess",
              identifier: "hello",
              args: [],
            },
            "world",
          ],
        },
      ],
      [
        "hmm cool ",
        {
          type: "call",
          identifier: "test",
          args: ["hello", "world"],
        },
        " wow",
      ],
      [
        " after block ",
        {
          type: "call",
          identifier: "is",
          args: ["this"],
        },
      ],
    ]);
  });

  it("should error when repeatCol is not closed", () => {
    expect(() =>
      extractHoistsAndBlocks(
        ...sheetAdapter(
          new Sheet<BasicExpressionsWithStaticTexts>([
            [
              parseBasicExpressions("hmm"),
              parseBasicExpressions("hello world"),
              parseBasicExpressions("[#repeatCol [hello] ident]"),
              parseBasicExpressions("what"),
            ],
            [
              parseBasicExpressions("hello world"),
              parseBasicExpressions("testt"),
              parseBasicExpressions("i should be repeating by now"),
              parseBasicExpressions("what"),
            ],
          ]),
        ),
      ),
    ).toThrowError(
      "block with identifier `repeatCol` at col 2, row 0 is not closed",
    );
  });

  it("should error when repeatCol is not closed 2", () => {
    expect(() =>
      extractHoistsAndBlocks(
        ...sheetAdapter(
          new Sheet<BasicExpressionsWithStaticTexts>([
            [],
            [
              parseBasicExpressions("hmm"),
              parseBasicExpressions("hello world"),
              parseBasicExpressions("what"),
              parseBasicExpressions("[#repeatCol [hello] ident]"),
            ],
            [
              parseBasicExpressions("hello world"),
              parseBasicExpressions("testt"),
              parseBasicExpressions("i should be repeating by now"),
            ],
            [],
            [],
          ]),
        ),
      ),
    ).toThrowError(
      "block with identifier `repeatCol` at col 3, row 1 is not closed",
    );
  });

  it("should label intersecting repeatCol and repeatRow blocks", () => {
    /* | > | v | # | <
     * | . | # | . | .
     * | . | ^ | . | .
     */
    const sheet = new Sheet<BasicExpressionsWithStaticTexts>([
      [
        parseBasicExpressions("[#repeatRow [helloRow] row]"),
        parseBasicExpressions("[#repeatCol [helloCol] col]"),
        parseBasicExpressions("this shouldn't be included"),
        parseBasicExpressions("[/#repeatRow]"),
      ],
      [
        parseBasicExpressions("this shouldn't be included"),
        parseBasicExpressions("i should be repeating by now"),
      ],
      [
        parseBasicExpressions("this shouldn't be included"),
        parseBasicExpressions("[/#repeatCol]"),
      ],
    ]);

    const collected = extractHoistsAndBlocks(...sheetAdapter(sheet));

    expect(sheet.getWholeRow({ row: 0 })).toEqual([
      [],
      [],
      ["this shouldn't be included"],
      [],
    ]);

    expect(sheet.getWholeCol({ col: 1 })).toEqual([
      [],
      ["i should be repeating by now"],
      [],
    ]);

    expect(collected).toEqual({
      variableHoists: [],
      blocks: [
        {
          identifier: "repeatRow",
          innerBlocks: [
            {
              identifier: "repeatCol",
              innerBlocks: [],
              arg: {
                type: "call",
                identifier: "helloCol",
                args: [],
              },
              indexVariableIdentifier: "col",
              direction: "col",
              start: {
                col: 1,
                row: 0,
                startsAt: 0,
              },
              end: {
                col: 1,
                row: 2,
                endsAt: 0,
              },
            },
          ],
          arg: {
            type: "call",
            identifier: "helloRow",
            args: [],
          },
          indexVariableIdentifier: "row",
          direction: "row",
          start: {
            col: 0,
            row: 0,
            startsAt: 0,
          },
          end: {
            col: 3,
            row: 0,
            endsAt: 0,
          },
        },
      ],
    });
  });

  it("should be able to label overlapping repeatRow and repeatCol blocks", () => {
    const sheet = new Sheet<BasicExpressionsWithStaticTexts>([
      [
        parseBasicExpressions("a"),
        parseBasicExpressions("b"),
        parseBasicExpressions("[#repeatCol [:stuff length] col]"),
      ],
      [
        parseBasicExpressions("[#repeatRow [:stuff length] row]"),
        parseBasicExpressions("repeating row"),
        parseBasicExpressions(
          "intersection [:row] [:col] [/#repeatRow][/#repeatCol]",
        ),
      ],
    ]);

    const collected = extractHoistsAndBlocks(...sheetAdapter(sheet));

    expect(collected).toEqual({
      variableHoists: [],
      blocks: [
        {
          identifier: "repeatCol",
          innerBlocks: [],
          arg: {
            type: "variableAccess",
            identifier: "stuff",
            args: ["length"],
          },
          indexVariableIdentifier: "col",
          direction: "col",
          start: {
            col: 2,
            row: 0,
            startsAt: 0,
          },
          end: {
            col: 2,
            row: 1,
            endsAt: 6,
          },
        },
        {
          identifier: "repeatRow",
          innerBlocks: [],
          arg: {
            type: "variableAccess",
            identifier: "stuff",
            args: ['length']
          },
          indexVariableIdentifier: "row",
          direction: 'row',
          start: {
            col: 0,
            row: 1,
            startsAt: 0,
          },
          end: {
            col: 2,
            row: 1,
            endsAt: 5,
          }
        }
      ],
    });
  });
});
