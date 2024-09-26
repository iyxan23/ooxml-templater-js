import { startVisiting } from "../visitor-editor";

// @internal
export type BodyElement =
  | {
    type: "paragraph";
    obj: any;
    text: { path: string[]; text: string } | undefined;
  }
  | { type: "table"; obj: any }
  | { type: "other"; obj: any };

// @internal
export function rebuildBodyElements(items: BodyElement[]): any[] {
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

// @internal
export async function collectBodyElements(body: any): Promise<BodyElement[]> {
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
