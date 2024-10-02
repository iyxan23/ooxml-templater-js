import {
  XMLParser,
  XMLBuilder,
  X2jOptions,
  XmlBuilderOptions,
} from "fast-xml-parser";
import { BlobReader, BlobWriter, ZipReader, ZipWriter } from "@zip.js/zip.js";
import { docxClosingTags } from "./docx-closing-tags-list";
import { startVisiting } from "../visitor-editor";
import { DocAddr, performDocumentTemplating } from "./doc-templater";
import { Issue, Result, success } from "../result";

export type DocxFinishedStatus =
  | {
      status: "success";
      issues: Issue<DocAddr>[];
    }
  | {
      status: "failed";
      error: Issue<DocAddr>;
      issues: Issue<DocAddr>[];
    };

export async function docxFillTemplate(
  docx: ReadableStream,
  output: WritableStream,
  input: any,
  opts?: {
    onFinished?: (status: DocxFinishedStatus) => void;
  },
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

      const result = templateDocument(doc, input);

      if (result.status === "failed") {
        opts?.onFinished?.({
          status: "failed",
          error: result.error,
          issues: result.issues,
        });

        await zipWriter.add(
          entry.filename,
          new BlobReader(new Blob([data], { type: "text/xml" })),
        );

        continue;
      }

      opts?.onFinished?.({
        status: "success",
        issues: result.issues,
      });

      const builder = new XMLBuilder(options);
      const newDoc: string = builder.build(result.result);

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

function getBody(xml: any): any | undefined {
  let bodyContent;

  startVisiting(xml, {
    before: {
      "w:body": [(children) => (bodyContent = children)],
    },
    after: {},
  });

  return bodyContent;
}

function templateDocument(xml: any, input: any): Result<any, DocAddr> {
  const body = getBody(xml);
  if (!body) return xml;

  const templatedItems = performDocumentTemplating(body, input);
  if (templatedItems.status === "failed") return templatedItems;
  const newBodyItems = templatedItems.result;

  return success(
    startVisiting(xml, {
      before: {},
      after: {
        "w:body": [() => ({ newObj: newBodyItems })],
      },
    }),
    templatedItems.issues,
  );
}
