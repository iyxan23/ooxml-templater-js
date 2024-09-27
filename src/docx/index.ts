import {
  XMLParser,
  XMLBuilder,
  X2jOptions,
  XmlBuilderOptions,
} from "fast-xml-parser";
import { BlobReader, BlobWriter, ZipReader, ZipWriter } from "@zip.js/zip.js";
import { docxClosingTags } from "./docx-closing-tags-list";
import { startVisiting } from "../visitor-editor";
import { collectBodyElements, rebuildBodyElements } from "./doc-elements";
import { DocAddr, performTemplating } from "./doc-templater";
import { Result, success } from "../result";

export async function docxFillTemplate(
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
        trimValues: false,
        unpairedTags: docxClosingTags,
        suppressUnpairedNode: false,
        suppressEmptyNode: true,
      };

      const parser = new XMLParser(options);
      const doc = parser.parse(data);

      const result = await templateDocument(doc, input);

      const builder = new XMLBuilder(options);
      const newDoc: string = builder.build(result);

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

async function getBody(xml: any): Promise<any | undefined> {
  let bodyContent;

  await startVisiting(xml, {
    before: {
      "w:body": [(children) => (bodyContent = children)],
    },
    after: {},
  });

  return bodyContent;
}

async function templateDocument(xml: any, input: any): Promise<Result<any, DocAddr>> {
  const body = await getBody(xml);
  if (!body) return xml;

  const items = await collectBodyElements(body);
  const templatedItems = performTemplating(items, input);

  if (templatedItems.status === "failed") return templatedItems;

  const newBodyItems = rebuildBodyElements(templatedItems.result);

  return success(
    await startVisiting(xml, {
      before: {},
      after: {
        "w:body": [() => ({ newObj: newBodyItems })],
      },
    }),
    templatedItems.issues
  );
}
