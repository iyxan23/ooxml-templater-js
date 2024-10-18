import { describe, expect, it } from "vitest";
import { Sheet } from "./sheet";

describe("sheet tests", () => {
  it("handles empty initialization", () => {
    const sheet = new Sheet<number>();

    expect(sheet.getCell(0, 0)).toBe(null);
    expect(sheet.getSheet()).toEqual([]);
  });

  it("retrieves cell data normally", () => {
    const data = [
      [1, 2, 3, 4, 5, 6, 7, 8, 9, null],
      [1, 2, 3, null, 5, 6, 7, 8, 9, 10],
      [1, 2, 3, 4, 5, null, 7, 8, 9, 10],
    ];

    const sheet = new Sheet<number>(data);

    expect(sheet.getCell(0, 0)).toBe(1);
    expect(sheet.getCell(3, 1)).toBe(null);
    expect(sheet.getCell(9, 2)).toBe(10);
    expect(sheet.getCell(10, 5)).toBe(null);

    // full test
    let r = 0;
    let c = 0;
    for (const row of data) {
      c = 0;
      for (const col of row) {
        expect(sheet.getCell(c, r)).toBe(col);
        c++;
      }
      r++;
    }
  });

  it("can set cells normally", () => {
    const data = [
      [1, 2, 3, 4, 5, 6, 7, 8, 9, null],
      [1, 2, 3, null, 5, 6, 7, 8, 9, 10],
      [1, 2, 3, 4, 5, null, 7, 8, 9, 10],
    ];

    const sheet = new Sheet<number>(data);

    sheet.setCell(2, 1, 100);
    sheet.setCell(9, 2, 418);
    sheet.setCell(5, 1, 876);
    sheet.setCell(2, 0, 723);

    expect(sheet.getCell(2, 1)).toBe(100);
    expect(sheet.getCell(9, 2)).toBe(418);
    expect(sheet.getCell(5, 1)).toBe(876);
    expect(sheet.getCell(2, 0)).toBe(723);

    const resultingData = sheet.getSheet();

    expect(resultingData[1]?.[2]).toBe(100);
    expect(resultingData[2]?.[9]).toBe(418);
    expect(resultingData[1]?.[5]).toBe(876);
    expect(resultingData[0]?.[2]).toBe(723);
  });

  it("can empty cells normally", () => {
    const data = [
      [1, 2, 3, 4, 5, 6, 7, 8, 9, null],
      [1, 2, 3, null, 5, 6, 7, 8, 9, 10],
      [1, 2, 3, 4, 5, null, 7, 8, 9, 10],
    ];

    const sheet = new Sheet<number>(data);

    sheet.emptyCell(8, 2);
    sheet.emptyCell(3, 1);
    sheet.emptyCell(7, 0);
    sheet.emptyCell(5, 0);

    expect(sheet.getCell(8, 2)).toBe(null);
    expect(sheet.getCell(3, 1)).toBe(null);
    expect(sheet.getCell(7, 0)).toBe(null);
    expect(sheet.getCell(5, 0)).toBe(null);
  });

  it("expands the sheet when setting a cell beyond initial bounds", () => {
    const sheet = new Sheet<number>();

    sheet.setCell(5, 5, 999);
    expect(sheet.getCell(5, 5)).toBe(999);
    expect(sheet.getCell(0, 0)).toBe(null);
    expect(sheet.getSheet().length).toBe(6); // 6 rows (0 to 5)
    expect(sheet.getSheet()[5]?.length).toBe(6); // 6 columns (0 to 5 in the last row)
  });

  it("calculates bounds of non-null values", () => {
    const data = [
      [null, null, null],
      [null, 5, null],
      [null, null, null],
    ];

    const sheet = new Sheet<number>(data);
    const bounds = sheet.getBounds();

    expect(bounds.rowBound).toBe(1); // The farthest non-null cell is in column 1
    expect(bounds.colBound).toBe(1); // The farthest non-null cell is in row 1
  });

  it("should calculate rowBound and colBound as -1 for an empty sheet", () => {
    const sheet = new Sheet<number>();

    const bounds = sheet.getBounds();

    expect(bounds.rowBound).toBe(-1);
    expect(bounds.colBound).toBe(-1);
  });

  it("should calculate the correct bounds for a sheet with no null values", () => {
    const data = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];

    const sheet = new Sheet<number>(data);

    const bounds = sheet.getBounds();

    expect(bounds.rowBound).toBe(2); // Last row is index 2
    expect(bounds.colBound).toBe(2); // Last column is index 2
  });

  it("should calculate correct bounds for a sheet with trailing null values", () => {
    const data = [
      [1, 2, null, null],
      [4, null, null, null],
      [7, 8, 9, null],
    ];

    const sheet = new Sheet<number>(data);

    const bounds = sheet.getBounds();

    expect(bounds.rowBound).toBe(2); // Last row index (2)
    expect(bounds.colBound).toBe(2); // Last column index (2) because of the 9 in the last row
  });

  it("should calculate correct bounds when rows are full of null values", () => {
    const data = [
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ];

    const sheet = new Sheet<number>(data);

    const bounds = sheet.getBounds();

    expect(bounds.rowBound).toBe(-1); // No non-null cells, should return -1
    expect(bounds.colBound).toBe(-1); // No non-null rows, should return -1
  });

  it("should calculate the correct bounds when a row is full of nulls", () => {
    const data = [
      [1, 2, 3],
      [null, null, null],
      [4, 5, 6],
    ];

    const sheet = new Sheet<number>(data);

    const bounds = sheet.getBounds();

    expect(bounds.rowBound).toBe(2);
    expect(bounds.colBound).toBe(2);
  });

  it("should calculate the correct bounds when a row and column is full of nulls", () => {
    const data = [
      [1, null, 3],
      [null, null, null],
      [4, null, 6],
    ];

    const sheet = new Sheet<number>(data);

    const bounds = sheet.getBounds();

    expect(bounds.rowBound).toBe(2);
    expect(bounds.colBound).toBe(2);
  });

  it("should calculate the correct bounds on an asymmetric sheet", () => {
    const data = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
    ];

    const sheet = new Sheet<number>(data);

    const bounds = sheet.getBounds();

    expect(bounds.rowBound).toBe(3);
    expect(bounds.colBound).toBe(2);
  });

  it("does not error out when a row is empty", () => {
    const data = [[1, 2, 3]];

    const sheet = new Sheet<number>(data);

    // set data below the 1st row
    sheet.setCell(0, 2, 4);
    sheet.setCell(1, 2, 5);
    sheet.setCell(2, 2, 6);

    // [1] is empty

    expect(sheet.getBounds()).toStrictEqual({ rowBound: 2, colBound: 2 });
    expect(sheet.getWholeRow({ row: 1 })).toStrictEqual([]);
  });

  it("slices off columns and rows", () => {
    const data = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];

    const sheet = new Sheet<number>(data);

    // Slice off columns beyond index 1 (should retain columns 0 and 1)
    sheet.sliceOffColumns(1);
    expect(sheet.getSheet()[0]).toEqual([1, 2]);

    // Slice off rows beyond index 1 (should retain rows 0 and 1)
    sheet.sliceOffRows(1);
    expect(sheet.getSheet().length).toBe(2);
  });

  it("optimizes the sheet by removing empty rows and columns", () => {
    const data = [
      [1, 2, null],
      [4, null, null],
      [null, null, null],
    ];

    const sheet = new Sheet<number>(data);
    sheet.optimizeSheet();

    const optimizedSheet = sheet.getSheet();

    expect(optimizedSheet.length).toBe(2); // Only 2 rows remain
    expect(optimizedSheet[0]?.length).toBe(2); // Only 2 columns remain

    expect(optimizedSheet[0]?.[0]).toBe(1);
    expect(optimizedSheet[1]?.[0]).toBe(4);
  });

  it("moves a block of cells", () => {
    const data = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];

    const sheet = new Sheet<number>(data);

    // Move block from (0, 0) to (1, 1) to position (1, 1)
    sheet.moveBlock(
      { colStart: 0, rowStart: 0, colEnd: 1, rowEnd: 1 },
      { col: 1, row: 1 },
    );

    expect(sheet.getCell(0, 0)).toBe(null);
    expect(sheet.getCell(0, 1)).toBe(null);
    expect(sheet.getCell(1, 0)).toBe(null);
    expect(sheet.getCell(1, 1)).toBe(1);
    expect(sheet.getCell(2, 2)).toBe(5);
  });

  it("moves a row of data", () => {
    const data = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];

    const sheet = new Sheet<number>(data);

    // Move block from the 1st row (4, 5, 6) to be below
    sheet.moveBlock({ colStart: 0, rowStart: 1, rowEnd: 1 }, { row: 2 });

    expect(sheet.getCell(0, 1)).toBe(null);
    expect(sheet.getCell(1, 1)).toBe(null);
    expect(sheet.getCell(2, 1)).toBe(null);

    expect(sheet.getCell(0, 2)).toBe(4);
    expect(sheet.getCell(1, 2)).toBe(5);
    expect(sheet.getCell(2, 2)).toBe(6);
  });

  it("moves rows of data", () => {
    const data = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
    ];

    const sheet = new Sheet<number>(data);

    // Move block from the 1st row (4, 5, 6) to be below
    sheet.moveBlock({ colStart: 0, rowStart: 1, rowEnd: 2 }, { row: 2 });

    expect(sheet.getCell(0, 1)).toBe(null);
    expect(sheet.getCell(1, 1)).toBe(null);
    expect(sheet.getCell(2, 1)).toBe(null);

    expect(sheet.getWholeRow({ row: 1 })).toEqual([null, null, null]);
    expect(sheet.getWholeRow({ row: 2 })).toEqual([4, 5, 6]);
    expect(sheet.getWholeRow({ row: 3 })).toEqual([7, 8, 9]);
  });

  it("moves a column of data", () => {
    const data = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];

    const sheet = new Sheet<number>(data);

    sheet.moveBlock({ colStart: 1, rowStart: 0, colEnd: 1 }, { col: 2 });

    expect(sheet.getWholeCol({ col: 2 })).toEqual([2, 5, 8]);
  });

  it("moves columns of data", () => {
    const data = [
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
    ];

    const sheet = new Sheet<number>(data);

    sheet.moveBlock({ colStart: 1, rowStart: 0, colEnd: 2 }, { col: 3 });

    expect(sheet.getWholeCol({ col: 1 })).toEqual([null, null, null, null]);
    expect(sheet.getWholeCol({ col: 2 })).toEqual([null, null, null, null]);
    expect(sheet.getWholeCol({ col: 3 })).toEqual([2, 7, 2, 7]);
    expect(sheet.getWholeCol({ col: 4 })).toEqual([3, 8, 3, 8]);
  });

  it("retrieves the whole row correctly", () => {
    const data = [
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [11, 12, 13, 14, 15],
    ];

    const sheet = new Sheet<number>(data);

    expect(sheet.getWholeRow({ row: 0 })).toEqual([1, 2, 3, 4, 5]);
    expect(sheet.getWholeRow({ row: 1 })).toEqual([6, 7, 8, 9, 10]);
    expect(sheet.getWholeRow({ row: 2 })).toEqual([11, 12, 13, 14, 15]);
  });

  it("retrieves a sliced portion of the row correctly", () => {
    const data = [
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [11, 12, 13, 14, 15],
    ];

    const sheet = new Sheet<number>(data);

    expect(sheet.getWholeRow({ row: 1, colStart: 1, colEnd: 4 })).toEqual([
      7, 8, 9,
    ]);
    expect(sheet.getWholeRow({ row: 0, colStart: 2 })).toEqual([3, 4, 5]);
    expect(sheet.getWholeRow({ row: 2, colEnd: 3 })).toEqual([11, 12, 13]);
  });

  it("returns empty array when row is out of bounds", () => {
    const data = [[1, 2, 3]];

    const sheet = new Sheet<number>(data);

    expect(sheet.getWholeRow({ row: 5 })).toEqual([]);
  });

  it("retrieves the whole column correctly", () => {
    const data = [
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [11, 12, 13, 14, 15],
    ];

    const sheet = new Sheet<number>(data);

    expect(sheet.getWholeCol({ col: 0 })).toEqual([1, 6, 11]);
    expect(sheet.getWholeCol({ col: 1 })).toEqual([2, 7, 12]);
    expect(sheet.getWholeCol({ col: 4 })).toEqual([5, 10, 15]);
  });

  it("retrieves a sliced portion of the column correctly", () => {
    const data = [
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [11, 12, 13, 14, 15],
    ];

    const sheet = new Sheet<number>(data);

    expect(sheet.getWholeCol({ col: 1, rowStart: 0, rowEnd: 2 })).toEqual([
      2, 7,
    ]);
    expect(sheet.getWholeCol({ col: 3, rowStart: 1 })).toEqual([9, 14]);
    expect(sheet.getWholeCol({ col: 2, rowEnd: 2 })).toEqual([3, 8]);
  });

  it("returns empty array when column is out of bounds", () => {
    const data = [[1, 2, 3]];

    const sheet = new Sheet<number>(data);

    expect(sheet.getWholeCol({ col: 5 }).filter((i) => i !== null)).toEqual([]);
  });

  it("inserts mapped data below a row, taking relativeCol", () => {
    const sheet = new Sheet<number>([[1, 2, 3]]);

    sheet.insertMapBelowRow(0, ({ relativeCol }) => relativeCol * 10);

    expect(sheet.getCell(0, 1)).toBe(0);
    expect(sheet.getCell(1, 1)).toBe(10);
    expect(sheet.getCell(2, 1)).toBe(20);
  });

  it("inserts mapped data below a row, taking previousData", () => {
    const sheet = new Sheet<number>([[5, 8, 2]]);

    sheet.insertMapBelowRow(0, ({ previousData }) => previousData! * 10);

    expect(sheet.getCell(0, 1)).toBe(50);
    expect(sheet.getCell(1, 1)).toBe(80);
    expect(sheet.getCell(2, 1)).toBe(20);

    expect(sheet.getWholeRow({ row: 0 })).toEqual([5, 8, 2]);
  });

  it("inserts mapped data below a row and other rows to be pushed below", () => {
    const sheet = new Sheet<number>([
      [1, 2, 3],
      [9, 9, 9],
      [8, 8, 8],
    ]);

    sheet.insertMapBelowRow(0, ({ previousData }) => previousData! * 10);

    expect(sheet.getCell(0, 1)).toBe(10);
    expect(sheet.getCell(1, 1)).toBe(20);
    expect(sheet.getCell(2, 1)).toBe(30);

    expect(sheet.getWholeRow({ row: 0 })).toEqual([1, 2, 3]);
    expect(sheet.getWholeRow({ row: 2 })).toEqual([9, 9, 9]);
    expect(sheet.getWholeRow({ row: 3 })).toEqual([8, 8, 8]);
  });

  it("inserts mapped data after a column", () => {
    const sheet = new Sheet<number>([
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
    ]);

    sheet.insertMapAfterCol(1, ({ previousData }) => previousData! * 10);

    expect(sheet.getWholeCol({ col: 2 })).toEqual(Array(5).fill(20));
  });

  it("clones a row and modifies it using map", () => {
    const sheet = new Sheet<number>([[1, 2, 3]]);

    sheet.cloneMapRow({
      row: 0,
      count: 2,
      map: ({ previousData, relativeRow }) =>
        previousData! + 10 * (relativeRow + 1),
    });

    expect(sheet.getWholeRow({ row: 1 })).toEqual([11, 12, 13]);
    expect(sheet.getWholeRow({ row: 2 })).toEqual([21, 22, 23]);
  });

  it("pushes other columns when inserting mapped data after a column", () => {
    const sheet = new Sheet<number>([
      [1, 2, 3, 7],
      [1, 2, 3, 9],
      [1, 2, 3, 4],
      [1, 2, 3, 1],
      [1, 2, 3, 2],
    ]);

    sheet.insertMapAfterCol(1, ({ previousData }) => previousData! * 10);

    expect(sheet.getWholeCol({ col: 0 })).toEqual(Array(5).fill(1));
    expect(sheet.getWholeCol({ col: 1 })).toEqual(Array(5).fill(2));
    expect(sheet.getWholeCol({ col: 3 })).toEqual(Array(5).fill(3));
    expect(sheet.getWholeCol({ col: 4 })).toEqual([7, 9, 4, 1, 2]);
  });

  it("clones a row multiple times and modifies it using map", () => {
    const sheet = new Sheet<number>([
      [1, 2, 3, 8, 6],
      [4, 5, 6, null, 2],
      [7, null, 9, 2, null],
      [10, 11, 12],
    ]);

    sheet.cloneMapCol({
      col: 1,
      count: 2,
      map: ({ previousData, relativeCol }) =>
        previousData! + 10 * (relativeCol + 1),
    });
  });

  it("clones a col and modifies it using map", () => {
    const sheet = new Sheet<number>([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
      [13, 14, 15],
    ]);

    sheet.cloneMapCol({
      col: 1,
      count: 2,
      map: ({ previousData, relativeCol }) =>
        previousData! + 10 * (relativeCol + 1),
    });

    expect(sheet.getWholeCol({ col: 0 })).toEqual([1, 4, 7, 10, 13]);
    expect(sheet.getWholeCol({ col: 1 })).toEqual([2, 5, 8, 11, 14]);
    expect(sheet.getWholeCol({ col: 2 })).toEqual([
      2 + 10 * 1,
      5 + 10 * 1,
      8 + 10 * 1,
      11 + 10 * 1,
      14 + 10 * 1,
    ]);
    expect(sheet.getWholeCol({ col: 3 })).toEqual([
      2 + 10 * 2,
      5 + 10 * 2,
      8 + 10 * 2,
      11 + 10 * 2,
      14 + 10 * 2,
    ]);
  });

  it("clones a row and modifies it using map", () => {
    const sheet = new Sheet<string>([
      ["hello", "world", "a", "1", "2"],
      ["bc", "de", null, null, "f"],
      ["g", null, "h", "i", "test"],
      ["80", "world", "hello", null],
    ]);

    sheet.cloneMapRow({
      row: 1,
      count: 2,
      map: ({ previousData, relativeRow, relativeCol }) =>
        previousData
          ? previousData + "|" + relativeRow + "|" + relativeCol
          : null,
    });

    expect(sheet.getWholeRow({ row: 0 })).toEqual([
      "hello",
      "world",
      "a",
      "1",
      "2",
    ]);
    expect(sheet.getWholeRow({ row: 1 })).toEqual([
      "bc",
      "de",
      null,
      null,
      "f",
    ]);
    expect(sheet.getWholeRow({ row: 2 })).toEqual([
      "bc|0|0",
      "de|0|1",
      null,
      null,
      "f|0|4",
    ]);
    expect(sheet.getWholeRow({ row: 3 })).toEqual([
      "bc|1|0",
      "de|1|1",
      null,
      null,
      "f|1|4",
    ]);
  });

  it("deletes a row", () => {
    const sheet = new Sheet<number>([
      [1, 2, 3],
      [4, 5, null],
      [7, null, 9],
      [10, 11, 12],
      [null, 14, 15],
    ]);

    sheet.deleteRow(2);

    expect(sheet.getWholeRow({ row: 1 })).toEqual([4, 5, null]);
    expect(sheet.getWholeRow({ row: 2 })).toEqual([10, 11, 12]);
  });

  it("deletes a column", () => {
    const sheet = new Sheet<number>([
      [1, 2, 3, 8],
      [4, 5, null, null],
      [7, null, 9, 10],
      [10, 11, 12, 3],
      [null, 14, 15, 2],
    ]);

    sheet.deleteCol(1);

    expect(sheet.getWholeCol({ col: 1 })).toEqual([3, null, 9, 12, 15]);
    expect(sheet.getWholeCol({ col: 2 })).toEqual([8, null, 10, 3, 2]);

    expect(sheet.getWholeRow({ row: 3 })).toEqual([10, 12, 3, null]);
  });

  it("deletes a block and fill from col", () => {
    const sheet = new Sheet<number>([
      [1, 2, 3, 8],
      [4, 5, null, null],
      [7, null, 9, 10],
      [10, 11, 12, 3],
      [null, 14, 15, 2],
    ]);

    sheet.deleteBlock({
      start: { row: 1, col: 1 },
      end: { row: 2, col: 2 },
      fillFrom: "col",
    });

    expect(sheet.getWholeRow({ row: 1 })).toEqual([4, null, null, null]);
    expect(sheet.getWholeRow({ row: 2 })).toEqual([7, 10, null, null]);
  });

  it("deletes a block and fill from row", () => {
    const sheet = new Sheet<number>([
      [1, 2, 3, 8],
      [4, 5, null, null],
      [7, null, 9, 10],
      [10, 11, 12, 3],
      [null, 14, 15, 2],
    ]);

    sheet.deleteBlock({
      start: { row: 1, col: 1 },
      end: { row: 2, col: 2 },
      fillFrom: "row",
    });

    expect(sheet.getWholeRow({ row: 1 })).toEqual([4, 11, 12, null]);
    expect(sheet.getWholeRow({ row: 2 })).toEqual([7, 14, 15, 10]);
  });

  it("deletes a block without filling", () => {
    const sheet = new Sheet<number>([
      [1, 2, 3, 8],
      [4, 5, null, null],
      [7, null, 9, 10],
      [10, 11, 12, 3],
      [null, 14, 15, 2],
    ]);

    sheet.deleteBlock({
      start: { row: 1, col: 1 },
      end: { row: 2, col: 2 },
      fillFrom: null,
    });

    expect(sheet.getWholeRow({ row: 1 })).toEqual([4, null, null, null]);
    expect(sheet.getWholeRow({ row: 2 })).toEqual([7, null, null, 10]);
  });
});
