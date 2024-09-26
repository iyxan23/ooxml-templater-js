import {
  XMLParser,
  XMLBuilder,
  X2jOptions,
  XmlBuilderOptions,
} from "fast-xml-parser";
import { BlobReader, BlobWriter, ZipReader, ZipWriter } from "@zip.js/zip.js";
import { docxClosingTags } from "./docx-closing-tags-list";
import { startVisiting } from "./visitor-editor";

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

type BodyElement =
  | {
    type: "paragraph";
    obj: any;
    text: { path: string[]; text: string } | undefined;
  }
  | { type: "table"; obj: any }
  | { type: "other"; obj: any };

function rebuildBodyElements(items: BodyElement[]): any[] {
  // rebuild the elements
  const newBodyItems = items.map((item) => {
    if (item.type === "paragraph") {
      const { text } = item;
      if (!text) return item.obj;

      const { path, text: textValue } = text;

      const t = path.reduce((acc, p) => acc[p], item.obj);

      t["#text"] = textValue;

      return item.obj;
    } else if (item.type === "table") {
      return item.obj;
    } else {
      return item.obj;
    }
  });

  return newBodyItems;
}

async function collectBodyElements(body: any): Promise<BodyElement[]> {
  // collect all the elements inside this body
  const bodyChildren = Array.isArray(body) ? body : [body];
  const items: BodyElement[] = [];

  for (const item of bodyChildren) {
    if (item["w:p"]) {
      // this is a paragraph
      let curItemText: { path: string[]; text: string } | undefined;

      await startVisiting(item, {
        before: {
          "w:t": [
            (children, path) => {
              if (!Array.isArray(children)) return;
              const textIdx = children.findIndex((a) => !!a["#text"]);
              if (textIdx === -1) return;

              const text = children[textIdx]["#text"];
              if (typeof text !== "string") return;

              console.log("PATHHHHH");
              console.log(path);

              curItemText = { text, path: [...path, String(textIdx)] };
            },
          ],
        },
        after: {},
      });

      items.push({
        type: "paragraph",
        obj: item,
        text: curItemText,
      });
    } else if (item["w:tbl"]) {
      // this is a table
      items.push({ type: "table", obj: item });
    } else {
      items.push({ type: "other", obj: item });
    }
  }

  return items;
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

async function templateDocument(xml: any, input: any): Promise<any> {
  const body = await getBody(xml);
  if (!body) return xml;

  const items = await collectBodyElements(body);
  const newBodyItems = rebuildBodyElements(items);

  return await startVisiting(xml, {
    before: {},
    after: {
      "w:body": [() => ({ newObj: newBodyItems })],
    },
  });
}
