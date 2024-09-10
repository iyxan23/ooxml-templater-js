import { describe, it, expect } from "vitest";
import {
  parseExpressionCell,
  ExpressionCell,
  extractHoistsAndBlocks,
} from "./expression";
import { Sheet } from "./sheet";

describe("parseExpressionCell", () => {
  it("should parse a very simple call", () => {
    const input = "okeoke freeform [huh] text yay";
    const expected: ExpressionCell = [
      "okeoke freeform ",
      {
        type: "call",
        identifier: "huh",
        args: [],
      },
      " text yay",
    ];

    expect(parseExpressionCell(input)).toEqual(expected);
  });

  it("should parse a simple call", () => {
    const input = "freeform [hello world] text yay";
    const expected: ExpressionCell = [
      "freeform ",
      {
        type: "call",
        identifier: "hello",
        args: ["world"],
      },
      " text yay",
    ];

    expect(parseExpressionCell(input)).toEqual(expected);
  });

  it("should parse a simple nested expression", () => {
    const input = "text [calling you [hello world] yay] oke";
    const expected: ExpressionCell = [
      "text ",
      {
        type: "call",
        identifier: "calling",
        args: [
          "you",
          {
            type: "call",
            identifier: "hello",
            args: ["world"],
          },
          "yay",
        ],
      },
      " oke",
    ];

    expect(parseExpressionCell(input)).toEqual(expected);
  });

  it("should be able to parse a simple variable access expression", () => {
    const input = "hello [:var] world";
    const expected: ExpressionCell = [
      "hello ",
      {
        type: "variableAccess",
        identifier: "var",
        args: [],
      },
      " world",
    ];

    expect(parseExpressionCell(input)).toEqual(expected);
  });

  it("should be able to parse a variable access expression with args", () => {
    const input = "hello [:var arg arg arg] world";
    const expected: ExpressionCell = [
      "hello ",
      {
        type: "variableAccess",
        identifier: "var",
        args: ["arg", "arg", "arg"],
      },
      " world",
    ];

    expect(parseExpressionCell(input)).toEqual(expected);
  });

  it("should parse a rather complex expression", () => {
    const input =
      "[#repeatRow [:transactions length] y] [:transactions [:y] student fullName]";
    const expected: ExpressionCell = [
      {
        type: "blockStart",
        identifier: "repeatRow",
        args: [
          {
            type: "variableAccess",
            identifier: "transactions",
            args: ["length"],
          },
          "y",
        ],
      },
      " ",
      {
        type: "variableAccess",
        identifier: "transactions",
        args: [
          {
            type: "variableAccess",
            identifier: "y",
            args: [],
          },
          "student",
          "fullName",
        ],
      },
    ];
    expect(parseExpressionCell(input)).toEqual(expected);
  });

  it("should parse a nested expression", () => {
    const input = "[formatIDR [:transactions [:y] payment amount]]";
    const expected: ExpressionCell = [
      {
        type: "call",
        identifier: "formatIDR",
        args: [
          {
            type: "variableAccess",
            identifier: "transactions",
            args: [
              {
                type: "variableAccess",
                identifier: "y",
                args: [],
              },
              "payment",
              "amount",
            ],
          },
        ],
      },
    ];
    expect(parseExpressionCell(input)).toEqual(expected);
  });

  it("should parse a nested lambda expression", () => {
    const input = "hello [lambda { [hello world] }] world";
    const expected: ExpressionCell = [
      "hello ",
      {
        type: "call",
        identifier: "lambda",
        args: [
          {
            type: "lambda",
            expression: {
              type: "call",
              identifier: "hello",
              args: ["world"],
            },
          },
        ],
      },
      " world",
    ];
    expect(parseExpressionCell(input)).toEqual(expected);
  });

  it("should parse a hoist expression", () => {
    const input =
      "[hoist columns [unique [reduce [:transactions] item acc { [merge [:acc] [:item payment columnName]] } ]]]";
    const expected: ExpressionCell = [
      {
        type: "variableHoist",
        identifier: "columns",
        expression: {
          type: "call",
          identifier: "unique",
          args: [
            {
              type: "call",
              identifier: "reduce",
              args: [
                {
                  type: "variableAccess",
                  identifier: "transactions",
                  args: [],
                },
                "item",
                "acc",
                {
                  type: "lambda",
                  expression: {
                    type: "call",
                    identifier: "merge",
                    args: [
                      {
                        type: "variableAccess",
                        identifier: "acc",
                        args: [],
                      },
                      {
                        type: "variableAccess",
                        identifier: "item",
                        args: ["payment", "columnName"],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    ];
    expect(parseExpressionCell(input)).toEqual(expected);
  });

  it("should parse a block end expression", () => {
    const input = "[/#repeatRow]";
    const expected: ExpressionCell = [
      {
        type: "blockEnd",
        identifier: "repeatRow",
      },
    ];
    expect(parseExpressionCell(input)).toEqual(expected);
  });

  it("should parse freeform text with an expression", () => {
    const input =
      "freeform text [stringify [reduce [:anArray] item acc { [merge [:acc] [:item array]] }]] hello world";
    const expected: ExpressionCell = [
      "freeform text ",
      {
        type: "call",
        identifier: "stringify",
        args: [
          {
            type: "call",
            identifier: "reduce",
            args: [
              {
                type: "variableAccess",
                identifier: "anArray",
                args: [],
              },
              "item",
              "acc",
              {
                type: "lambda",
                expression: {
                  type: "call",
                  identifier: "merge",
                  args: [
                    {
                      type: "variableAccess",
                      identifier: "acc",
                      args: [],
                    },
                    {
                      type: "variableAccess",
                      identifier: "item",
                      args: ["array"],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      " hello world",
    ];
    expect(parseExpressionCell(input)).toEqual(expected);
  });
});

describe("extractHoistsAndBlocks", () => {
  it("should collect a variable hoist", () => {
    const sheet = new Sheet<ExpressionCell>([
      [
        parseExpressionCell(" hello worldd!"),
        parseExpressionCell(
          "freeform [hoist hello [string hello world]] text horayy",
        ),
        parseExpressionCell("hii hellooo"),
      ],
    ]);

    const collected = extractHoistsAndBlocks(sheet);

    expect(collected).toEqual({
      variableHoists: [
        {
          identifier: "hello",
          type: "variableHoist",
          expression: {
            type: "call",
            identifier: "string",
            args: ["hello", "world"],
          },
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

  it.skip("should label a simple repeatRow block", () => {
    const sheet = new Sheet<ExpressionCell>([
      [
        parseExpressionCell("[#repeatRow [hello] ident]"),
        parseExpressionCell("i should be repeating by now"),
        parseExpressionCell("[/#repeatRow]"),
      ],
    ]);

    const collected = extractHoistsAndBlocks(sheet);

    expect(collected).toEqual({
      variableHoists: [],
      blocks: [
        {
          identifier: "repeatRow",
          arg: { type: "call", identifier: "hello", args: [] },
          indexVariableIdentifier: "ident",
          blockContent: [["i should be repeating by now"]],
          direction: "row",
          lastCellAfterBlockEnd: [],
          end: { col: 2, row: 0 },
          start: { col: 0, row: 0 },
        },
      ],
    });
  });

  it.skip("should label a simple repeatRow block with a lastCellAfterBlockEnd", () => {
    const sheet = new Sheet<ExpressionCell>([
      [
        parseExpressionCell(" hello worldd!"),
        parseExpressionCell("[#repeatRow [hello] ident]"),
        parseExpressionCell("i should be repeating by now"),
        parseExpressionCell("[hello world]"),
        parseExpressionCell("[/#repeatRow] woah [:cool alright] test"),
      ],
      [
        parseExpressionCell("don't mind me"),
        null,
        null,
        parseExpressionCell("not supposed to be included"),
      ],
    ]);

    const collected = extractHoistsAndBlocks(sheet);

    expect(collected).toEqual({
      variableHoists: [],
      blocks: [
        {
          identifier: "repeatRow",
          arg: { type: "call", identifier: "hello", args: [] },
          indexVariableIdentifier: "ident",
          blockContent: [
            ["i should be repeating by now"],
            [
              {
                type: "call",
                identifier: "hello",
                args: ["world"],
              },
            ],
          ],
          direction: "row",
          lastCellAfterBlockEnd: [
            " woah ",
            {
              type: "variableAccess",
              identifier: "cool",
              args: ["alright"],
            },
            " test",
          ],
          end: { col: 4, row: 0 },
          start: { col: 1, row: 0 },
        },
      ],
    });
  });

  it.skip("should error when repeatRow is not closed", () => {
    expect(() =>
      extractHoistsAndBlocks(
        new Sheet<ExpressionCell>([
          [
            parseExpressionCell("[#repeatRow [hello] ident]"),
            parseExpressionCell("i should be repeating by now"),
          ],
        ]),
      ),
    ).toThrowError(
      "block with identifier `repeatRow` at col 0, row 0 is not closed",
    );
  });

  it.skip("should error when repeatRow is not closed 2", () => {
    expect(() =>
      extractHoistsAndBlocks(
        new Sheet<ExpressionCell>([
          [parseExpressionCell("hmm")],
          [
            parseExpressionCell("hello world"),
            parseExpressionCell("i should be repeating by now"),
            parseExpressionCell("[#repeatRow [hello] ident]"),
            parseExpressionCell("what"),
          ],
          [
            parseExpressionCell("hello world"),
            parseExpressionCell("testt"),
            parseExpressionCell("i should be repeating by now"),
            parseExpressionCell("what"),
          ],
        ]),
      ),
    ).toThrowError(
      "block with identifier `repeatRow` at col 2, row 1 is not closed",
    );
  });

  it.skip("should label a repeatCol", () => {
    const sheet = new Sheet<ExpressionCell>([
      [
        ["hello world"],
        ["2nd col"],
        parseExpressionCell("[#repeatCol [:hello] world]"),
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
        parseExpressionCell("[/#repeatCol]"),
        ["not this"],
      ],
    ]);

    const collected = extractHoistsAndBlocks(sheet);

    expect(collected).toEqual({
      variableHoists: [],
      blocks: [
        {
          identifier: "repeatCol",
          arg: { type: "variableAccess", identifier: "hello", args: [] },
          indexVariableIdentifier: "world",
          blockContent: [["this should be repeating"]],
          direction: "col",
          lastCellAfterBlockEnd: [],
          end: { col: 2, row: 2 },
          start: { col: 2, row: 0 },
        },
      ],
    });
  });

  it.skip("should label a repeatCol 2", () => {
    const sheet = new Sheet<ExpressionCell>([
      [
        ["hello world"],
        parseExpressionCell("[nope]"),
        ["shouldn't be included"],
        ["not this"],
      ],
      [
        ["hello world"],
        parseExpressionCell(
          "[just before block] is [#repeatCol [:hello] world]",
        ),
        ["shouldn't be included"],
        ["not this"],
        ["not this"],
      ],
      [
        ["this shouldn't"],
        parseExpressionCell("[here is a call [:hello] world]"),
        ["this shouldn't"],
        ["not this"],
      ],
      [
        ["this shouldn't"],
        parseExpressionCell("hmm cool [test hello world] wow"),
        ["this shouldn't"],
        ["not this"],
      ],
      [
        ["not this"],
        parseExpressionCell("[/#repeatCol] after block [is this]"),
        ["not this"],
        ["not this"],
      ],
    ]);

    const collected = extractHoistsAndBlocks(sheet);

    expect(collected).toEqual({
      variableHoists: [],
      blocks: [
        {
          identifier: "repeatCol",
          arg: { type: "variableAccess", identifier: "hello", args: [] },
          indexVariableIdentifier: "world",
          blockContent: [
            [
              {
                type: "call",
                identifier: "here",
                args: [
                  "is",
                  "a",
                  "call",
                  { type: "variableAccess", identifier: "hello", args: [] },
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
          ],
          direction: "col",
          lastCellAfterBlockEnd: [
            " after block ",
            {
              identifier: "is",
              args: ["this"],
              type: "call",
            },
          ],
          end: { col: 1, row: 4 },
          start: { col: 1, row: 1 },
        },
      ],
    });
  });

  it.skip("should error when repeatCol is not closed", () => {
    expect(() =>
      extractHoistsAndBlocks(
        new Sheet<ExpressionCell>([
          [
            parseExpressionCell("hmm"),
            parseExpressionCell("hello world"),
            parseExpressionCell("[#repeatCol [hello] ident]"),
            parseExpressionCell("what"),
          ],
          [
            parseExpressionCell("hello world"),
            parseExpressionCell("testt"),
            parseExpressionCell("i should be repeating by now"),
            parseExpressionCell("what"),
          ],
        ]),
      ),
    ).toThrowError(
      "block with identifier `repeatCol` at col 2, row 0 is not closed",
    );
  });

  it.skip("should error when repeatCol is not closed 2", () => {
    expect(() =>
      extractHoistsAndBlocks(
        new Sheet<ExpressionCell>([
          [],
          [
            parseExpressionCell("hmm"),
            parseExpressionCell("hello world"),
            parseExpressionCell("what"),
            parseExpressionCell("[#repeatCol [hello] ident]"),
          ],
          [
            parseExpressionCell("hello world"),
            parseExpressionCell("testt"),
            parseExpressionCell("i should be repeating by now"),
          ],
          [],
          [],
        ]),
      ),
    ).toThrowError(
      "block with identifier `repeatCol` at col 3, row 1 is not closed",
    );
  });

  it.skip("should label intersecting repeatCol and repeatRow blocks", () => {
    /* | > | v | # | <
     * | . | # | . | .
     * | . | ^ | . | .
     */
    const sheet = new Sheet<ExpressionCell>([
      [
        parseExpressionCell("[#repeatRow [helloRow] row]"),
        parseExpressionCell("[#repeatCol [helloCol] col]"),
        parseExpressionCell("this shouldn't be included"),
        parseExpressionCell("[/#repeatRow]"),
      ],
      [
        parseExpressionCell("this shouldn't be included"),
        parseExpressionCell("i should be repeating by now"),
      ],
      [
        parseExpressionCell("this shouldn't be included"),
        parseExpressionCell("[/#repeatCol]"),
      ],
    ]);

    const collected = extractHoistsAndBlocks(sheet);

    console.log(JSON.stringify(sheet.getSheet(), null, 2));

    expect(collected).toEqual({
      variableHoists: [],
      blocks: [
        {
          identifier: "repeatCol",
          arg: {
            type: "call",
            identifier: "helloCol",
            args: [],
          },
          indexVariableIdentifier: "col",
          direction: "col",
          blockContent: [
            ["i should be repeating by now"],
          ],
          lastCellAfterBlockEnd: [],
          start: {
            col: 1,
            row: 0,
          },
          end: {
            col: 1,
            row: 2,
          },
        },
        {
          identifier: "repeatRow",
          arg: {
            type: "call",
            identifier: "helloRow",
            args: [],
          },
          indexVariableIdentifier: "row",
          direction: "row",
          blockContent: [[]],
          lastCellAfterBlockEnd: [],
          start: {
            col: 0,
            row: 0,
          },
          end: {
            col: 3,
            row: 0,
          },
        },
      ],
    });
  });
});
