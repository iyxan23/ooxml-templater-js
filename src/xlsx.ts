import { ZipWriter, ZipReader, BlobWriter, BlobReader } from "@zip.js/zip.js";
import {
  X2jOptions,
  XMLBuilder,
  XmlBuilderOptions,
  XMLParser,
} from "fast-xml-parser";
import { startVisiting } from "./visitor-editor";
import { Sheet } from "./sheet/sheet";
import { SheetTemplater, TemplatableCell } from "./sheet/sheet-templater";

const SHARED_STRINGS_ENTRY = "xl/sharedStrings.xml";

export async function xlsxFillTemplate(
  xlsx: ReadableStream,
  output: WritableStream,
  input: any,
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

    await zipWriter.add(entry.filename, new BlobReader(new Blob([result])));
  }

  zipWriter.close();
}

class XlsxCell implements TemplatableCell {
  cell: any;
  text: string;

  constructor(cell: any) {
    // make sure it has the `v` inside of the cell
    const cellV = cell["v"];

    if (cellV === undefined)
      throw new Error("Invalid cell, does not contain 'v'");

    this.cell = cell;
    this.text = String(cellV);

    delete this.cell["v"];
  }

  buildCell(reference: `${string}${number}`): any {
    this.cell["@_r"] = reference;
    this.cell["v"] = this.text;

    if (isNumeric(this.text)) {
      this.cell["@_t"] = "n";
    } else {
      this.cell["@_t"] = "str";
    }

    return this.cell;
  }

  getTextContent(): string {
    return this.text;
  }

  editTextContent(content: string): XlsxCell {
    this.text = content;
    return this;
  }

  cloneWithTextContent(content: string): XlsxCell {
    const clone: XlsxCell = Object.assign({}, this);
    clone.text = content;
    return clone;
  }
}

class XlsxTemplater {
  // a list of raw XML, make sure to pass it as-is. tends to be <t> tags
  private sharedStrings: any[] = [];

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

    this.sharedStrings = parsed["sst"]["si"].map(
      (i: { t: { "#text": string } }) => i.t["#text"],
    );
  }

  constructor(sharedStringsXml?: string) {
    if (sharedStringsXml) this.parseSharedStrings(sharedStringsXml);
    console.log(this.sharedStrings);
  }

  async template(templateContent: string, data: any): Promise<string> {
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

    // pass the sheet into SheetTemplater for it to do the actual templating
    const templater = new SheetTemplater(extractedData.sheet, {
      rowInfo: extractedData.rowInfo,
      colInfo: { ...extractedData.colInfo },
    });

    const templateResult = templater.interpret(data);
    if (templateResult.status === "failed") {
      throw new Error(templateResult.error.message);
    }

    const templatedSheet = templateResult.result;

    // "inject" is a bit misleading, we're essentially injecting the cells that
    // have been templated into the original sheet, without changing anything
    // else other than the fields that do contain the cols, rows and cells.
    const injectedSheet = this.inject(
      templatedSheet.sheet,
      sheetFilled,
      templatedSheet.rowInfo ?? {},
      templatedSheet.colInfo ?? {},
    );

    console.log("injected");
    console.log(JSON.stringify(injectedSheet, null, 2));

    const builder = new XMLBuilder(options);
    const result: string = builder.build(injectedSheet);

    return result;
  }

  async inject(
    sheetData: Sheet<XlsxCell>,
    xlsxData: any,
    rowInfo: Record<number, any>,
    colInfo: Record<number, any>,
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

    const visited = await startVisiting(xlsxData, {
      before: {},
      after: {
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
                row: rows,
              },
            };
          },
        ],
      },
    });

    return visited;
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
          (obj, _ctx) => {
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
          (obj, _ctx) => {
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
                min: col["@_min"],
                max: col["@_max"],
              });
            }
          },
        ],
        row: [
          (obj, _ctx) => {
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
          (obj, _ctx) => {
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
          (obj, ctx) => {
            if (obj["v"]) {
              // a single node
              return {
                childCtx: ctx,
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

            if (!Array.isArray(obj)) return { childCtx: ctx };

            return {
              childCtx: ctx,
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

function isNumeric(value: string): boolean {
  return /^-?\d+$/.test(value);
}
