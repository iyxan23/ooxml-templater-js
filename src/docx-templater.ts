import {
  XMLParser,
  XMLBuilder,
  X2jOptions,
  XmlBuilderOptions,
} from "fast-xml-parser";
import { BlobReader, BlobWriter, ZipReader, ZipWriter } from "@zip.js/zip.js";
import { docxClosingTags } from "./docx-closing-tags-list";
import { startVisiting, Visitors } from "./visitor-editor";

const createTemplaterVisitors: (data: any) => Visitors = (data) => ({
  after: {
    "w:t": [
      (doc) => ({
        newObj: JSON.parse(handleTemplate(JSON.stringify(doc), data)),
        childCtx: undefined,
      }),
    ],
  },
  before: {},
});

export async function docxReplaceTemplate(
  docx: ReadableStream,
  output: WritableStream,
  input: any,
) {
  const zipWriter = new ZipWriter(output);
  const zipReader = new ZipReader(docx);

  const entries = await zipReader.getEntries();
  console.log(entries);

  for (const entry of entries) {
    console.log(entry.filename);

    if (entry.filename === "word/document.xml") {
      console.log("found a word/document.xml");

      console.log("gettin data");
      const data = await entry
        .getData?.(new BlobWriter())
        .then((b) => b.text());

      if (!data) {
        continue;
      }

      console.log(data);

      const options: X2jOptions & XmlBuilderOptions = {
        preserveOrder: true,
        ignoreAttributes: false,
        parseTagValue: false,
        trimValues: true,
        unpairedTags: docxClosingTags,
        suppressUnpairedNode: false,
        suppressEmptyNode: true,
      };

      const parser = new XMLParser(options);
      const doc = parser.parse(data);

      const filledDoc = await startVisiting(
        doc,
        createTemplaterVisitors(input),
      );

      const builder = new XMLBuilder(options);
      const newDoc: string = builder.build(filledDoc);

      await zipWriter.add(
        entry.filename,
        new BlobReader(new Blob([newDoc], { type: "text/xml" })),
      );

      continue;
    }

    const contentStream = new TransformStream();
    entry.getData?.(contentStream.writable);

    await zipWriter.add(entry.filename, contentStream.readable);
  }

  zipWriter.close();
}

const re = /\${([^}]+)}/g;

function handleTemplate(haystack: string, data: any): string {
  let match;
  let result = haystack;

  console.log("  handling template");
  while ((match = re.exec(haystack)) != null) {
    console.log("  match");
    console.log("  " + match[1]);

    const val = data[match[1]!] ?? "";
    result = result.replace(match[0], val);
    console.log("  replaced with " + val);
  }

  return result;
}
