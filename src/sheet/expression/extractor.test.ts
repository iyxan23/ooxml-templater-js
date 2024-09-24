import { describe, it, expect } from "vitest";
import { Expressionish, extract, Source, Visitor } from "./extractor";
import {
  BasicExpression,
  BasicExpressionsWithStaticTexts,
  parseBasicExpressions,
} from "./parser";
import { Sheet } from "../sheet";

class ItemAdapter implements Expressionish {
  constructor(private item: BasicExpressionsWithStaticTexts) {}

  getExpression(): BasicExpressionsWithStaticTexts {
    return this.item;
  }

  removeExpression(index: number): void {
    this.item.splice(index, 1);
  }

  replaceExpression(expr: BasicExpression): void {
    this.item[0] = expr;
  }
}

function item(item: string): ItemAdapter {
  return new ItemAdapter(parseBasicExpressions(item));
}

type SheetSourceAdapterAddr = [number, number];

class SheetSourceAdapter
  implements Source<SheetSourceAdapterAddr, ItemAdapter>
{
  constructor(private sheet: Sheet<ItemAdapter>) {}

  getItem(addr: SheetSourceAdapterAddr): ItemAdapter | null {
    const [col, row] = addr;
    return this.sheet.getCell(col, row);
  }

  setItem(addr: SheetSourceAdapterAddr, item: ItemAdapter): void {
    const [col, row] = addr;
    this.sheet.setCell(col, row, item);
  }
}

describe("extractor", () => {
  it("should extract a simple variable access", () => {
    const sheet = new Sheet<ItemAdapter>([
      [item("hello"), item("[:variable]"), item("abc")],
    ]);

    const sheetRowLength = sheet.getBounds().colBound;

    const visitVariableAccess = vi
      .fn()
      .mockImplementation(
        (() => undefined) as NonNullable<
          Visitor<SheetSourceAdapterAddr, ItemAdapter>["visitVariableAccess"]
        >,
      );

    extract<[number, number], ItemAdapter>(
      new SheetSourceAdapter(sheet),
      {
        visitVariableAccess,
      },
      [0, 0],
      ([x, y]) => (x >= sheetRowLength ? null : [x + 1, y]),
    );

    expect(visitVariableAccess).toBeCalledTimes(1);
    expect(visitVariableAccess).toHaveBeenCalledWith(
      [1, 0],
      sheet.getCell(1, 0)!,
      parseBasicExpressions("[:variable]")[0],
      0,
    );
  });

  it("should extract a simple call", () => {
    const sheet = new Sheet<ItemAdapter>([
      [item("hello"), item("world"), item("abc")],
      [item("hi"), item("test [call ...[:var]]"), item("def")],
    ]);

    const { rowBound, colBound } = sheet.getBounds();

    const visitCall = vi
      .fn()
      .mockImplementation(
        (() => undefined) as NonNullable<
          Visitor<SheetSourceAdapterAddr, ItemAdapter>["visitCall"]
        >,
      );

    extract<[number, number], ItemAdapter>(
      new SheetSourceAdapter(sheet),
      {
        visitCall,
      },
      [0, 0],
      ([x, y]) =>
        x >= colBound ? (y >= rowBound ? null : [0, y + 1]) : [x + 1, y],
    );

    expect(visitCall).toBeCalledTimes(1);
    expect(visitCall).toHaveBeenCalledWith(
      [1, 1],
      sheet.getCell(1, 1)!,
      parseBasicExpressions("[call ...[:var]]")[0],
      1,
    );
  });

  it("should extract a simple call with multiple arguments", () => {
    const sheet = new Sheet<ItemAdapter>([
      [item("hello"), item("world"), item("abc")],
      [item("hi"), item("test [call ...[:var] [:var]]"), item("def")],
    ]);

    const { rowBound, colBound } = sheet.getBounds();

    const visitCall = vi
      .fn()
      .mockImplementation(
        (() => undefined) as NonNullable<
          Visitor<SheetSourceAdapterAddr, ItemAdapter>["visitCall"]
        >,
      );

    extract<[number, number], ItemAdapter>(
      new SheetSourceAdapter(sheet),
      {
        visitCall,
      },
      [0, 0],
      ([x, y]) =>
        x >= colBound ? (y >= rowBound ? null : [0, y + 1]) : [x + 1, y],
    );

    expect(visitCall).toBeCalledTimes(1);
    expect(visitCall).toHaveBeenCalledWith(
      [1, 1],
      sheet.getCell(1, 1)!,
      parseBasicExpressions("[call ...[:var] [:var]]")[0],
      1,
    );
  });

  it("should extract multiple simple calls with multiple arguments and static text", () => {
    const sheet = new Sheet<ItemAdapter>([
      [item("hello"), item("world"), item("[test hello] hmm")],
      [
        item("hi"),
        item("test [call ...[:var]] hello [anotherCall [:var]]"),
        item("def"),
      ],
    ]);

    const { rowBound, colBound } = sheet.getBounds();

    const visitCall = vi
      .fn()
      .mockImplementation(
        (() => undefined) as NonNullable<
          Visitor<SheetSourceAdapterAddr, ItemAdapter>["visitCall"]
        >,
      );

    extract<[number, number], ItemAdapter>(
      new SheetSourceAdapter(sheet),
      {
        visitCall,
      },
      [0, 0],
      ([x, y]) =>
        x >= colBound ? (y >= rowBound ? null : [0, y + 1]) : [x + 1, y],
    );

    expect(visitCall).toBeCalledTimes(3);
    expect(visitCall).toHaveBeenCalledWith(
      [2, 0],
      sheet.getCell(2, 0)!,
      parseBasicExpressions("[test hello]")[0],
      0,
    );
    expect(visitCall).toHaveBeenCalledWith(
      [1, 1],
      sheet.getCell(1, 1)!,
      parseBasicExpressions("[call ...[:var]]")[0],
      1,
    );
    expect(visitCall).toHaveBeenCalledWith(
      [1, 1],
      sheet.getCell(1, 1)!,
      parseBasicExpressions("[anotherCall [:var]]")[0],
      3,
    );
  });
});
