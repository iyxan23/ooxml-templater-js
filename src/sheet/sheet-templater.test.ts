import { describe, it, expect } from "vitest";
import {
  parseExpressionCell,
  ExpressionCell,
  collectHoistsAndLabelBlocks,
} from "./sheet-templater";
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

describe("collectHoistsAndLabelBlocks", () => {
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

    const collected = collectHoistsAndLabelBlocks(sheet);

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

  it("should label a simple repeatRow block", () => {
    const sheet = new Sheet<ExpressionCell>([
      [
        parseExpressionCell(" hello worldd!"),
        parseExpressionCell("[#repeatRow [hello] ident]"),
        parseExpressionCell("i should be repeating by now"),
        parseExpressionCell("[/#repeatRow]"),
      ],
    ]);

    const collected = collectHoistsAndLabelBlocks(sheet);

    expect(collected).toEqual({
      variableHoists: [],
      blocks: [
        {
          identifier: "repeatRow",
          arg: { type: "call", identifier: "hello", args: [] },
          blockContent: [["i should be repeating by now"]],
          direction: "row",
          lastCellAfterBlockEnd: [],
          end: { col: 3, row: 0 },
          start: { col: 1, row: 0 },
        },
      ],
    });
  });
});
