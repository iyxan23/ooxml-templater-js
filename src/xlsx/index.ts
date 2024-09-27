import { ZipWriter, ZipReader, BlobWriter, BlobReader } from "@zip.js/zip.js";
import {
  X2jOptions,
  XMLBuilder,
  XmlBuilderOptions,
  XMLParser,
} from "fast-xml-parser";
import { startVisiting } from "../visitor-editor";
import { Sheet } from "../sheet/sheet";
import {
  SheetAddr,
  SheetTemplater,
  TemplatableCell,
} from "../sheet/sheet-templater";
import { TemplaterFunction } from "../expression/evaluate";
import { Issue } from "../result";
import { isNumeric } from "../utils";

const SHARED_STRINGS_ENTRY = "xl/sharedStrings.xml";

export type SheetFinishStatus =
  | { status: "success"; issues: Issue<SheetAddr>[] }
  | { status: "failed"; issues: Issue<SheetAddr>[]; error: Issue<SheetAddr> };

export async function xlsxFillTemplate(
  xlsx: ReadableStream,
  output: WritableStream,
  input: any,
  opts?: {
    functions?: Record<string, TemplaterFunction<any, SheetAddr>>;
    onSheetFinished: (sheetPath: string, status: SheetFinishStatus) => void;
  },
) {
  const zipWriter = new ZipWriter(output);
  const zipReader = new ZipReader(xlsx);

  const entries = await zipReader.getEntries();

  // find a sharedString entry
  const sharedStrings = entries.find(
    (e) => e.filename === SHARED_STRINGS_ENTRY,
  );

  console.log(sharedStrings);

  const sharedStringsData = sharedStrings
    ?.getData?.(new BlobWriter())
    .then((b) => b.text());

  const templater = new XlsxTemplater(
    sharedStringsData ? await sharedStringsData : undefined,
  );

  for (const entry of entries) {
    console.log(entry.filename);

    if (sharedStringsData && entry.filename === SHARED_STRINGS_ENTRY) continue;

    const contentStream = new TransformStream();

    if (!entry.getData) continue;
    entry.getData?.(contentStream.writable);

    if (!entry.filename.startsWith("xl/worksheets")) {
      await zipWriter.add(entry.filename, contentStream.readable);
      continue;
    }

    const result = await templater.template(
      await streamToText(contentStream.readable),
      input,
    );

    opts?.onSheetFinished?.(
      entry.filename,
      result.error
        ? { status: "failed", issues: result.issues, error: result.cause }
        : { status: "success", issues: result.issues },
    );

    await zipWriter.add(entry.filename, new BlobReader(new Blob([result.xml])));
  }

  zipWriter.close();
}

class XlsxCell implements TemplatableCell {
  cell: any;
  text: string | null;

  constructor(cell: any) {
    let cellV = cell["v"];
    if (cellV === undefined) cellV = null;

    this.cell = cell;
    this.text = cellV ? String(cellV) : cellV;

    delete this.cell["v"];
  }

  buildCell(reference: `${string}${number}`): any {
    this.cell["@_r"] = reference;

    if (this.text === null) return this.cell;

    this.cell["v"] = this.text;

    if (isNumeric(this.text)) {
      this.cell["@_t"] = "n";
    } else {
      this.cell["@_t"] = "str";
    }

    return this.cell;
  }

  getTextContent(): string {
    return this.text ?? "";
  }

  editTextContent(content: string): XlsxCell {
    if (this.text === null && content === "") {
      return this;
    }

    this.text = content;
    return this;
  }

  cloneWithTextContent(content: string): XlsxCell {
    console.log(`"${this.text}" -> "${content}"`);
    const clone: XlsxCell = new XlsxCell(Object.assign({}, this.cell));
    clone.text = content === "" ? null : content;
    return clone;
  }
}

class XlsxTemplater {
  // a list of raw XML, make sure to pass it as-is. tends to be <t> tags
  private sharedStrings: any[] = [];
  private functions: Record<string, TemplaterFunction<any, SheetAddr>> = {};

  private parseSharedStrings(sharedStringsXml: string) {
    const options: X2jOptions & XmlBuilderOptions = {
      ignoreAttributes: false,
      parseTagValue: false,
      trimValues: true,
      // unpairedTags: docxClosingTags,
      suppressUnpairedNode: false,
      suppressEmptyNode: true,
      suppressBooleanAttributes: false,
    };

    const parser = new XMLParser(options);
    const parsed = parser.parse(sharedStringsXml);

    const sharedStrings = parsed["sst"]?.["si"];

    this.sharedStrings =
      sharedStrings?.map((i: { t: { "#text": string } }) => i.t["#text"]) ?? [];
  }

  constructor(
    sharedStringsXml?: string,
    functions?: Record<string, TemplaterFunction<any, SheetAddr>>,
  ) {
    if (sharedStringsXml) this.parseSharedStrings(sharedStringsXml);
    if (functions) this.functions = functions;

    console.log(this.sharedStrings);
  }

  async template(
    templateContent: string,
    data: any,
  ): Promise<
    { xml: string; issues: Issue<SheetAddr>[] } & (
      | { error: true; cause: Issue<SheetAddr> }
      | { error: false }
    )
  > {
    const options: X2jOptions & XmlBuilderOptions = {
      ignoreAttributes: false,
      parseTagValue: false,
      trimValues: true,
      // unpairedTags: docxClosingTags,
      suppressUnpairedNode: false,
      suppressEmptyNode: true,
      suppressBooleanAttributes: false,
    };

    const parser = new XMLParser(options);
    const parsed = parser.parse(templateContent);

    console.log(JSON.stringify(parsed));
    const sheetFilled = await this.fillSheetWithSharedStrings(parsed);
    console.log(JSON.stringify(sheetFilled));

    // then we turn this sheet into a Sheet object so we can work with it easier
    const extractedData = await this.extract(sheetFilled);

    const rowInfo = extractedData.rowInfo;
    const colInfo = extractedData.colInfo;
    const mergeInfo = extractedData.mergeInfo;

    // pass the sheet into SheetTemplater for it to do the actual templating
    const templater = new SheetTemplater(extractedData.sheet, {
      functions: this.functions,
    });

    const templateResult = templater.interpret(data, {
      onShift: (shift) => {
        if (shift.direction === "row") {
          if (!rowInfo) return;

          for (const [key, val] of Object.entries(rowInfo)) {
            const keyNum = parseInt(key);
            // shift infos that are over the current row, but duplicate the ones that
            // is on the same row
            if (keyNum === shift.row) {
              for (let i = 0; i < shift.amount; i++) {
                rowInfo[keyNum + shift.amount] = val;
              }
            } else if (keyNum > shift.row) {
              rowInfo[keyNum + shift.amount] = val;
              delete rowInfo[keyNum];
            }
          }
        } else if (shift.direction === "col") {
          if (!colInfo) return;

          // colInfo is different, rather than using indexes,
          // it stores min & max in "@_min" and "@_max" respectively.
          for (const col of colInfo) {
            const min = parseInt(col["@_min"]);
            const max = parseInt(col["@_max"]);

            if (min >= shift.col) col["@_min"] = String(min + shift.amount);
            if (max >= shift.col) col["@_max"] = String(max + shift.amount);
          }
        }

        // after shifting the colInfo / rowInfo, we then change the mergeInfos
        for (const { start, end } of mergeInfo) {
          if (shift.direction === "col") {
            if (start.col >= shift.col) start.col += shift.amount;
            if (end.col >= shift.col) end.col += shift.amount;
          } else if (shift.direction === "row") {
            if (start.row >= shift.row) start.row += shift.amount;
            if (end.row >= shift.row) end.row += shift.amount;
          }
        }
      },
    });

    let templatedSheet;
    if (templateResult.status === "success") {
      templatedSheet = templateResult.result.sheet;
    } else if (templateResult.status === "failed") {
      templatedSheet = new Sheet([
        [
          new XlsxCell({
            v:
              `failed to template: ${templateResult.error.message} at ` +
              `column ${templateResult.error.addr.col + 1}` +
              ` row ${templateResult.error.addr.row + 1} or ${createAddressNumber(
                templateResult.error.addr.col,
                templateResult.error.addr.row,
              )}`,
          }),
        ],
      ]);
    } else {
      throw "unreachable";
    }

    // insert issues into the sheet
    const bounds = templatedSheet.getBounds();
    let lastRow = bounds.rowBound;
    for (const issue of templateResult.issues) {
      templatedSheet.insertMapBelowRow(lastRow, ({ col }) => {
        if (col > 0) return null;

        return new XlsxCell({
          v: `[ISSUE] ${issue.message} at column ${issue.addr.col} row ${issue.addr.row}`,
        });
      });
      lastRow++;
    }

    // "inject" is a bit misleading, we're essentially injecting the cells that
    // have been templated into the original sheet, without changing anything
    // else other than the fields that do contain the cols, rows and cells.
    this.inject(templatedSheet, sheetFilled, rowInfo, colInfo, mergeInfo);

    console.log("sheetFilled");
    console.log(JSON.stringify(sheetFilled, null, 2));

    const builder = new XMLBuilder(options);
    const result: string = builder.build(sheetFilled);

    const error =
      templateResult.status === "failed"
        ? { error: true as const, cause: templateResult.error }
        : { error: false as const };

    return {
      xml: result,
      issues: templateResult.issues,
      ...error,
    };
  }

  async inject(
    sheetData: Sheet<XlsxCell>,
    xlsxData: any,
    rowInfo: Record<number, any>,
    colInfo: Record<number, any>,
    mergeInfo: {
      start: { col: number; row: number };
      end: { col: number; row: number };
    }[],
  ): Promise<any> {
    const rows: Record<number, { c: any[] | any } & any> = {};

    const { rowBound, colBound } = sheetData.getBounds();
    sheetData.optimizeSheet({ rowBound, colBound });

    for (let r = 0; r <= rowBound; r++) {
      const row: any[] = [];

      for (let c = 0; c <= colBound; c++) {
        const cell = sheetData.getCell(c, r);
        if (cell === null) continue;

        row.push(cell.buildCell(createAddressNumber(c, r)));
      }

      rows[r] = { ...rowInfo[r], c: row.length === 1 ? row[0] : row };
    }

    await startVisiting(xlsxData, {
      before: {},
      after: {
        dimension: [
          () => {
            const bounds = sheetData.getBounds();
            const dimension = createAddressNumber(
              bounds.colBound,
              bounds.rowBound,
            );

            return {
              newObj: {
                "@_ref": `A1:${dimension}`,
              },
            };
          },
        ],
        col: [
          () => {
            return {
              newObj: Object.keys(colInfo)
                .toSorted((a, b) => parseInt(a) - parseInt(b))
                .map((i) => colInfo[parseInt(i)]),
            };
          },
        ],
        sheetData: [
          () => {
            return {
              newObj: {
                row: Object.keys(rows)
                  .toSorted((a, b) => parseInt(a) - parseInt(b))
                  .map((i) => rows[parseInt(i)]),
              },
            };
          },
        ],
        mergeCells: [
          () => {
            const mergeCell = [];

            for (const info of mergeInfo) {
              const start = createAddressNumber(info.start.col, info.start.row);
              const end = createAddressNumber(info.end.col, info.end.row);
              mergeCell.push(`${start}:${end}`);
            }

            return {
              newObj: {
                mergeCell: mergeCell.map((m) => ({ "@_ref": m })),
                "@_count": mergeCell.length,
              },
            };
          },
        ],
      },
    });

    return xlsxData;
  }

  async extract(parsedSheet: any): Promise<{
    sheet: Sheet<XlsxCell>;
    rowInfo: Record<number, any>;
    colInfo: (any & { min: number; max: number })[];
    mergeInfo: {
      start: { col: number; row: number };
      end: { col: number; row: number };
    }[];
  }> {
    const sheet = new Sheet<XlsxCell>();
    const rowInfo: Record<number, any> = {};
    const colInfo: (any & { min: number; max: number })[] = [];
    const mergeInfo: {
      start: { col: number; row: number };
      end: { col: number; row: number };
    }[] = [];

    await startVisiting(parsedSheet, {
      before: {
        mergeCell: [
          (obj) => {
            console.log(obj);
            mergeInfo.push(
              ...(Array.isArray(obj) ? obj : [obj]).map((o) => {
                const [startNotation, endNotation] = o["@_ref"].split(":");
                const start = parseAddressNumber(startNotation);
                const end = parseAddressNumber(endNotation);
                return {
                  start,
                  end,
                };
              }),
            );
          },
        ],
        col: [
          (obj) => {
            const cols = Array.isArray(obj) ? obj : [obj];

            for (const col of cols) {
              colInfo.push({
                ...Object.keys(col)
                  .filter((k) => k.startsWith("@_"))
                  .reduce(
                    (acc, k) => {
                      acc[k] = col[k];
                      return acc;
                    },
                    {} as Record<string, any>,
                  ),
              });
            }
          },
        ],
        row: [
          (obj) => {
            const rows = Array.isArray(obj) ? obj : [obj];

            for (const row of rows) {
              rowInfo[row["@_r"]] = {
                ...Object.keys(row)
                  .filter((k) => k.startsWith("@_"))
                  .reduce(
                    (acc, k) => {
                      acc[k] = row[k];
                      return acc;
                    },
                    {} as Record<string, any>,
                  ),
              };
            }
          },
        ],
        c: [
          (obj) => {
            const cells = Array.isArray(obj) ? obj : [obj];

            for (const cell of cells) {
              const { col, row } = parseAddressNumber(cell["@_r"]);
              delete cell["@_r"];

              sheet.setCell(col, row, new XlsxCell(cell));
            }
          },
        ],
      },
      after: {},
    });

    return {
      sheet,
      rowInfo,
      colInfo,
      mergeInfo,
    };
  }

  async fillSheetWithSharedStrings(parsedSheet: any): Promise<any> {
    return await startVisiting(parsedSheet, {
      before: {},
      after: {
        c: [
          (obj) => {
            if (obj["v"]) {
              // a single node
              return {
                newObj:
                  obj["@_t"] === "s" && isNumeric(obj["v"])
                    ? {
                      ...obj,
                      v: this.sharedStrings[parseInt(obj["v"])],
                      "@_t": "str",
                    }
                    : { ...obj },
              };
            }

            if (!Array.isArray(obj)) return {};

            return {
              newObj: obj.map((o) =>
                o["@_t"] === "s" && isNumeric(o["v"])
                  ? {
                    ...o,
                    v: this.sharedStrings[parseInt(o["v"])],
                    "@_t": "str",
                  }
                  : { ...o },
              ),
            };
          },
        ],
      },
    });
  }
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function parseAddressNumber(address: string): { row: number; col: number } {
  const result = /^([A-Z]+)([0-9]+)$/.exec(address);

  if (!result) throw new Error("invalid address");

  const rawCol = result[1]!;
  const rawRow = result[2]!;

  const col =
    rawCol
      .split("")
      .reduce((acc, c) => acc * 26 + (ALPHABET.indexOf(c) + 1), 0) - 1;
  const row = parseInt(rawRow) - 1;

  return { row, col };
}

function createAddressNumber(col: number, row: number): `${string}${number}` {
  if (col < 0 || row < 0) {
    throw new Error("Column and row must be non-negative.");
  }

  const oneIndexedRow = row + 1;

  let columnLetter = "";
  while (col >= 0) {
    columnLetter = String.fromCharCode(65 + (col % 26)) + columnLetter;
    col = Math.floor(col / 26) - 1;
  }

  return `${columnLetter}${oneIndexedRow}`;
}

async function streamToText(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  let result = "";
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    result += value;
  }
  return result;
}
