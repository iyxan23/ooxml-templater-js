import { describe, it, expect } from "vitest";
import {
  parseBasicExpressions,
  type BasicExpressionsWithStaticTexts,
} from "./parser";

describe("parseExpressionCell", () => {
  it("should parse a very simple call", () => {
    const input = "okeoke freeform [huh] text yay";
    const expected: BasicExpressionsWithStaticTexts = [
      "okeoke freeform ",
      {
        type: "call",
        identifier: "huh",
        args: [],
      },
      " text yay",
    ];

    expect(parseBasicExpressions(input)).toEqual(expected);
  });

  it("should parse a string with spaces", () => {
    const input =
      'freeform [huh "hello world" "  hey you can do this!!!"] text yay';
    const expected: BasicExpressionsWithStaticTexts = [
      "freeform ",
      {
        type: "call",
        identifier: "huh",
        args: ["hello world", "  hey you can do this!!!"],
      },
      " text yay",
    ];

    expect(parseBasicExpressions(input)).toEqual(expected);
  });

  it("should parse a simple call", () => {
    const input = "freeform [hello world] text yay";
    const expected: BasicExpressionsWithStaticTexts = [
      "freeform ",
      {
        type: "call",
        identifier: "hello",
        args: ["world"],
      },
      " text yay",
    ];

    expect(parseBasicExpressions(input)).toEqual(expected);
  });

  it("should parse a simple nested expression", () => {
    const input = "text [calling you [hello world] yay] oke";
    const expected: BasicExpressionsWithStaticTexts = [
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

    expect(parseBasicExpressions(input)).toEqual(expected);
  });

  it("should be able to parse a simple variable access expression", () => {
    const input = "hello [:var] world";
    const expected: BasicExpressionsWithStaticTexts = [
      "hello ",
      {
        type: "variableAccess",
        identifier: "var",
        args: [],
      },
      " world",
    ];

    expect(parseBasicExpressions(input)).toEqual(expected);
  });

  it("should be able to parse a variable access expression with args", () => {
    const input = "hello [:var arg arg arg] world";
    const expected: BasicExpressionsWithStaticTexts = [
      "hello ",
      {
        type: "variableAccess",
        identifier: "var",
        args: ["arg", "arg", "arg"],
      },
      " world",
    ];

    expect(parseBasicExpressions(input)).toEqual(expected);
  });

  it("parses a simple call expression wrapped with spread", () => {
    const input = "hello [:var ...[func]] world";
    const expected: BasicExpressionsWithStaticTexts = [
      "hello ",
      {
        type: "variableAccess",
        identifier: "var",
        args: [
          {
            type: "spread",
            expr: {
              type: "call",
              identifier: "func",
              args: [],
            },
          },
        ],
      },
      " world",
    ];

    expect(parseBasicExpressions(input)).toEqual(expected);
  });

  it("ignores spread that isnt a part of the expression", () => {
    const input =
      "hello...[:var [hello how is it going] ...[:awesome]] my name is iyxan";
    const expected: BasicExpressionsWithStaticTexts = [
      "hello...",
      {
        type: "variableAccess",
        identifier: "var",
        args: [
          {
            type: "call",
            identifier: "hello",
            args: ["how", "is", "it", "going"],
          },
          {
            type: "spread",
            expr: {
              type: "variableAccess",
              identifier: "awesome",
              args: [],
            },
          },
        ],
      },
      " my name is iyxan",
    ];

    expect(parseBasicExpressions(input)).toEqual(expected);
  });

  it("ignores spread that doesnt have three dots", () => {
    const input = "hello...[:var ..[:hello]]";
    const expected: BasicExpressionsWithStaticTexts = [
      "hello...",
      {
        type: "variableAccess",
        identifier: "var",
        args: [
          {
            type: "variableAccess",
            identifier: "..hello",
            args: [],
          },
        ],
      },
    ];

    expect(parseBasicExpressions(input)).toEqual(expected);
  });

  it("should parse a rather complex expression", () => {
    const input =
      "[r#repeatRow [:transactions length] y] [:transactions [:y] student fullName]";
    const expected: BasicExpressionsWithStaticTexts = [
      {
        type: "specialCall",
        code: "r",
        identifier: "repeatRow",
        closing: false,
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
    expect(parseBasicExpressions(input)).toEqual(expected);
  });

  it("should parse a nested expression", () => {
    const input = "[formatIDR [:transactions [:y] payment amount]]";
    const expected: BasicExpressionsWithStaticTexts = [
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
    expect(parseBasicExpressions(input)).toEqual(expected);
  });

  it("should parse a nested lambda expression", () => {
    const input = "hello [lambda { [hello world] }] world";
    const expected: BasicExpressionsWithStaticTexts = [
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
    expect(parseBasicExpressions(input)).toEqual(expected);
  });

  it("should parse a hoist expression", () => {
    const input =
      "[hoist columns [unique [reduce [:transactions] item acc { [merge [:acc] [:item payment columnName]] } ]]]";
    const expected: BasicExpressionsWithStaticTexts = [
      {
        type: "call",
        identifier: "hoist",
        args: [
          "columns",
          {
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
        ],
      },
    ];
    expect(parseBasicExpressions(input)).toEqual(expected);
  });

  it("should parse a closing special call expression", () => {
    const input = "[/r#repeatRow]";
    const expected: BasicExpressionsWithStaticTexts = [
      {
        type: "specialCall",
        code: "r",
        closing: true,
        identifier: "repeatRow",
        args: [],
      },
    ];
    expect(parseBasicExpressions(input)).toEqual(expected);
  });

  it("should parse freeform text with an expression", () => {
    const input =
      "freeform text [stringify [reduce [:anArray] item acc { [merge [:acc] [:item array]] }]] hello world";
    const expected: BasicExpressionsWithStaticTexts = [
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
    expect(parseBasicExpressions(input)).toEqual(expected);
  });
});
