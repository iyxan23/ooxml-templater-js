export class Sheet<T> {
  // list of rows
  private sheet: (T | null)[][] = [];

  constructor(initialData?: (T | null)[][]) {
    if (initialData) this.sheet = initialData;
  }

  getSheet(): (T | null)[][] {
    return this.sheet;
  }

  getCell(col: number, row: number): T | null {
    return (this.sheet[row] ?? [])[col] ?? null;
  }

  setCell(col: number, row: number, data: T | null) {
    if (this.sheet[row] === undefined) this.sheet[row] = Array(row).fill(null);

    while (this.sheet[row].length < col) {
      this.sheet[row].push(null);
    }

    this.sheet[row][col] = data;
  }

  emptyCell(col: number, row: number) {
    this.setCell(col, row, null);
  }

  // get the maximum bounds of the sheet that isn't null
  getBounds() {
    let maxCol = 0;
    let maxRow = 0;

    for (let row = 0; row < this.sheet.length; row++) {
      const currentRow = this.sheet[row]!;
      let curMaxRow = currentRow.length;

      // flag to check if the row is full of nulls
      let rowHasNonNull = false;

      // scan from the back to find the first non-null cell
      while (curMaxRow > 0) {
        if (currentRow[curMaxRow - 1] !== null) {
          rowHasNonNull = true;
          break;
        }
        curMaxRow--;
      }

      // update rowBound to track the maximum column with non-null value
      maxCol = Math.max(maxCol, curMaxRow);

      // update colBound to track the last non-null row
      if (rowHasNonNull) {
        maxRow = row + 1; // `+1` because row index is 0-based
      }
    }

    return { rowBound: maxRow - 1, colBound: maxCol - 1 };
  }

  // removes columns from - to (if undefined, will remove everything after)
  sliceOffColumns(fromCol: number) {
    if (this.sheet.length > 0) {
      for (let row = 0; row < this.sheet.length; row++) {
        this.sheet[row] = this.sheet[row]!.slice(0, fromCol + 1);
      }
    }
  }

  // removes columns from - to (if undefined, will remove everything after)
  sliceOffRows(fromRow: number) {
    this.sheet = this.sheet.slice(0, fromRow + 1);
  }

  optimizeSheet(
    bounds: { rowBound: number; colBound: number } = this.getBounds(),
  ) {
    if (this.sheet.length !== bounds.rowBound) {
      this.sliceOffRows(bounds.rowBound);
    }

    if (this.sheet[0] !== undefined) {
      if (this.sheet[0].length !== bounds.colBound) {
        this.sliceOffColumns(bounds.colBound);
      }
    }
  }

  getWholeRow({
    row,
    colStart,
    colEnd,
  }: {
    row: number;
    colStart?: number;
    colEnd?: number;
  }): (T | null)[] {
    if (this.sheet[row] === undefined) return [];
    return this.sheet[row].slice(colStart, colEnd);
  }

  getWholeCol({
    col,
    rowStart,
    rowEnd,
  }: {
    col: number;
    rowStart?: number;
    rowEnd?: number;
  }): (T | null)[] {
    if (this.sheet[0] === undefined) return [];
    if (this.sheet[0][col] === undefined) return [];

    return this.sheet.slice(rowStart, rowEnd).map((row) => row[col] ?? null);
  }

  moveBlock(
    block: {
      colStart: number;
      rowStart: number;
      colEnd?: number; // will default to max if not specified, inclusive
      rowEnd?: number; // will default to max if not specified, inclusive
    },
    destination: { col?: number; row?: number },
  ) {
    if (destination.col === undefined && destination.row === undefined) {
      throw new Error(
        "destination col and row must either be specified or both",
      );
    }

    const bounds = this.getBounds();
    this.optimizeSheet(bounds); // so we won't have to call this.getBounds again

    const colEnd = block.colEnd ?? bounds.colBound;
    const rowEnd = block.rowEnd ?? bounds.rowBound;

    const destinationCol = destination.col ?? 0;
    const destinationRow = destination.row ?? 0;

    const cells: (T | null)[][] = [];

    for (let row = block.rowStart; row <= rowEnd; row++) {
      let rowContent = [];
      for (let col = block.colStart; col <= colEnd; col++) {
        const cell = this.getCell(col, row);
        rowContent.push(cell);
        this.emptyCell(col, row);
      }
      cells.push(rowContent);
    }

    for (let row = 0; row <= rowEnd - block.rowStart; row++) {
      for (let col = 0; col <= colEnd - block.colStart; col++) {
        const cell = cells[row]![col]!;
        this.setCell(destinationCol + col, destinationRow + row, cell);
      }
    }
  }

  insertMapBelowRow(
    row: number,
    map: ({
      relativeCol,
      col,
      row,
    }: {
      relativeCol: number;
      col: number;
      row: number;
      previousData: T | null;
    }) => T | null,
    colStart?: number,
    colEnd?: number,
  ) {
    const realColStart = colStart ?? 0;
    const theRow = this.getWholeRow({ row, colStart: realColStart, colEnd });

    // move the other rows below
    this.moveBlock({ rowStart: row + 1, colStart: 0 }, { row: row + 2 });

    // set the new data from the back so that `this.setCell` won't continously
    // pushing new items to the array
    for (let col = theRow.length - 1; col >= realColStart; col--) {
      this.setCell(
        col,
        row + 1,
        map({
          col,
          row,
          relativeCol: col - realColStart,
          previousData: theRow[col]!,
        }),
      );
    }
  }

  insertMapAfterCol(
    col: number,
    map: ({
      relativeRow,
      col,
      row,
    }: {
      relativeRow: number;
      col: number;
      row: number;
      previousData: T | null;
    }) => T | null,
    rowStart?: number,
    rowEnd?: number,
  ) {
    const realRowStart = rowStart ?? 0;
    const theCol = this.getWholeCol({ col, rowStart: realRowStart, rowEnd });

    // move the other cols to the right
    this.moveBlock({ colStart: col + 1, rowStart: 0 }, { col: col + 2 });

    for (let row = theCol.length - 1; row >= realRowStart; row--) {
      this.setCell(
        col + 1,
        row,
        map({
          col,
          row,
          relativeRow: row - realRowStart,
          previousData: theCol[row]!,
        }),
      );
    }
  }

  deleteRow(row: number) {
    this.moveBlock({ rowStart: row + 1, colStart: 0 }, { row: row });
  }

  deleteCol(col: number) {
    this.moveBlock({ colStart: col + 1, rowStart: 0 }, { col: col });
  }

  // todo: faster method by moving a big block at the start, then actually
  // clone them one-by-one without insertMapAfterCol
  cloneMapCol({
    col,
    count,
    map,
    rowStart,
    rowEnd,
  }: {
    col: number;
    count: number;
    map: ({
      relativeRow,
      relativeCol,
      count,
      previousData,
    }: {
      relativeRow: number;
      relativeCol: number;
      col: number;
      row: number;
      count: number;
      previousData: T | null;
    }) => T | null;
    rowStart?: number;
    rowEnd?: number;
  }) {
    // clones the row `row` `count` times, calls insertMapAfterCol multiple times
    const theCol = this.getWholeCol({ col, rowStart, rowEnd });

    for (let i = 0; i < count; i++) {
      this.insertMapAfterCol(
        col + i,
        ({ relativeRow, ...args }) =>
          map({
            ...args,
            relativeCol: i,
            relativeRow,
            count: i,
            previousData: theCol[relativeRow]!,
          }),
        rowStart,
        rowEnd,
      );
    }
  }

  // todo: faster method by moving a big block at the start, then actually
  // clone them one-by-one without insertMapBelowRow
  cloneMapRow({
    row,
    count,
    map,
    colStart,
    colEnd,
  }: {
    row: number;
    count: number;
    map: ({
      relativeCol,
      relativeRow,
      count,
      previousData,
    }: {
      relativeCol: number;
      relativeRow: number;
      col: number;
      row: number;
      count: number;
      previousData: T | null;
    }) => T | null;
    colStart?: number;
    colEnd?: number;
  }) {
    // clones the row `row` `count` times, calls insertMapBelowRow multiple times
    const theRow = this.getWholeRow({ row, colStart, colEnd });

    for (let i = 0; i < count; i++) {
      this.insertMapBelowRow(
        row + i,
        ({ relativeCol, ...args }) =>
          map({
            ...args,
            relativeRow: i,
            relativeCol,
            count: i,
            previousData: theRow[relativeCol]!,
          }),
        colStart,
        colEnd,
      );
    }
  }
}
