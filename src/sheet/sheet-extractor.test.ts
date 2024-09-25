import {
  BasicExpressionsWithStaticTexts,
  parseBasicExpressions,
} from "src/expression/parser";
import { Sheet } from "./sheet";
import { extractVarsAndBlocks } from "./sheet-extractor";

function cell(s: string): [BasicExpressionsWithStaticTexts, string] {
  const parsed = parseBasicExpressions(s);
  return [parsed, s];
}

describe("Sheet Extractor", () => {
  it("extracts variables", () => {
    const sheet = new Sheet<[BasicExpressionsWithStaticTexts, string]>([
      [cell("hello")],
      [cell("world")],
      [cell("[var variable [test]]")],
      [cell("[hoist another [hello]]")],
    ]);

    const { blocks, variables, issues } = extractVarsAndBlocks(sheet);

    expect(issues).toEqual([]);
    expect(blocks).toEqual([]);
    expect(variables).toEqual([
      {
        col: 0,
        row: 2,
        identifier: "variable",
        expr: {
          type: "call",
          identifier: "test",
          args: [],
        },
      },
      {
        col: 0,
        row: 3,
        identifier: "another",
        expr: {
          type: "call",
          identifier: "hello",
          args: [],
        },
      },
    ]);

    // also verify that the variable is deleted from the sheet
    expect(sheet.getCell(0, 2)?.[0]).toStrictEqual([]);
    expect(sheet.getCell(0, 3)?.[0]).toStrictEqual([]);
  });

  it("extract variables with static text", () => {
    const sheet = new Sheet<[BasicExpressionsWithStaticTexts, string]>([
      [cell("hello")],
      [cell("world")],
      [cell("yo [var hmm [testing]] what")],
    ]);

    const { blocks, variables, issues } = extractVarsAndBlocks(sheet);

    expect(issues).toEqual([]);
    expect(blocks).toEqual([]);
    expect(variables).toEqual([
      {
        col: 0,
        row: 2,
        identifier: "hmm",
        expr: {
          type: "call",
          identifier: "testing",
          args: [],
        },
      },
    ]);

    expect(sheet.getCell(0, 2)?.[0]).toStrictEqual(["yo  what"]);
  });

  it("extract a simple r#repeatRow block", () => {
    const sheet = new Sheet<[BasicExpressionsWithStaticTexts, string]>([
      [
        cell("[r#repeatRow 2 test]"),
        cell("this will be repeated"),
        cell("this will be repeated too"),
        cell("[/r#repeatRow]"),
      ],
    ]);

    const { blocks, variables, issues } = extractVarsAndBlocks(sheet);

    expect(issues).toEqual([]);
    expect(blocks).toEqual([
      {
        identifier: "repeatRow",
        arg: "2",
        indexVariableIdentifier: "test",
        code: "r",
        direction: "row",
        innerBlocks: [],
        start: { col: 0, row: 0 },
        end: { col: 3, row: 0 },
      },
    ]);
    expect(variables).toEqual([]);
  });

  it("extracts a simple c#repeatCol block", () => {
    const sheet = new Sheet<[BasicExpressionsWithStaticTexts, string]>([
      [cell("[c#repeatCol 2 test]")],
      [cell("this will be repeated")],
      [cell("this will be repeated too")],
      [cell("[/c#repeatCol]")],
    ]);

    const { blocks, variables, issues } = extractVarsAndBlocks(sheet);

    expect(issues).toEqual([]);
    expect(blocks).toEqual([
      {
        identifier: "repeatCol",
        arg: "2",
        indexVariableIdentifier: "test",
        code: "c",
        direction: "col",
        innerBlocks: [],
        start: { col: 0, row: 0 },
        end: { col: 0, row: 3 },
      },
    ]);
    expect(variables).toEqual([]);
  });

  it("extracts a nested repeatRow", () => {
    const sheet = new Sheet<[BasicExpressionsWithStaticTexts, string]>([
      [
        cell("[r#repeatRow 2 test]"), // 0
        cell("this will be repeated"), // 1
        cell("this will be repeated too"), // 2
        cell("[r#repeatRow 2 test]"), // 3
        cell("inner"), // 4
        cell("[/r#repeatRow]"), // 5
        cell("[/r#repeatRow]"), // 6
      ],
    ]);

    const { blocks, variables, issues } = extractVarsAndBlocks(sheet);

    expect(issues).toEqual([]);
    expect(blocks).toEqual([
      {
        identifier: "repeatRow",
        arg: "2",
        indexVariableIdentifier: "test",
        code: "r",
        direction: "row",
        innerBlocks: [
          {
            identifier: "repeatRow",
            arg: "2",
            indexVariableIdentifier: "test",
            code: "r",
            direction: "row",
            innerBlocks: [],
            start: { col: 3, row: 0 },
            end: { col: 5, row: 0 },
          },
        ],
        start: { col: 0, row: 0 },
        end: { col: 6, row: 0 },
      },
    ]);
    expect(variables).toEqual([]);
  });

  it("extracts multiple blocks", () => {
    const sheet = new Sheet<[BasicExpressionsWithStaticTexts, string]>([
      [cell("1"), cell("2"), cell("3"), cell("[c#repeatCol 2 test]")],
      [
        cell("[r#repeatRow 2 test]"), // 0
        cell("repeatinRow"), // 1
        cell("repeatingRow"), // 2
        cell("repeatin a lot[/c#repeatCol]"), // 3
        cell("[/r#repeatRow]"), // 4
      ],
    ]);

    const { blocks, variables, issues } = extractVarsAndBlocks(sheet);

    expect(issues).toEqual([]);
    expect(blocks).toEqual([
      {
        identifier: "repeatCol",
        arg: "2",
        indexVariableIdentifier: "test",
        code: "c",
        direction: "col",
        innerBlocks: [],
        start: { col: 3, row: 0 },
        end: { col: 3, row: 1 },
      },
      {
        identifier: "repeatRow",
        arg: "2",
        indexVariableIdentifier: "test",
        code: "r",
        direction: "row",
        innerBlocks: [],
        start: { col: 0, row: 1 },
        end: { col: 4, row: 1 },
      },
    ]);

    expect(variables).toEqual([]);
  });
});
