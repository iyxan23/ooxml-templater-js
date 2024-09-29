import {
  BasicExpressionsWithStaticTexts,
  parseBasicExpressions,
} from "../../expression/parser";
import { startVisiting } from "../../visitor-editor";
import { BodyElement } from ".";
import { evaluateExpression, TemplaterFunction } from "../../expression/evaluate";
import { DocAddr } from "../doc-templater";

// @internal
export class ParagraphElement implements BodyElement {
  private textData?:
    | {
        status: "raw";
        text: string;
        textPath: string[];
        expr: BasicExpressionsWithStaticTexts;
      }
    | {
        status: "evaluated";
        textPath: string[];
        resultText: string;
      };

  constructor(private obj: any) {
    let curItemText: { path: string[]; text: string } | undefined;

    startVisiting(obj, {
      before: {
        "w:t": [
          (children, path) => {
            if (!Array.isArray(children)) return;
            const textIdx = children.findIndex((a) => !!a["#text"]);
            if (textIdx === -1) return;

            const text = children[textIdx]["#text"];
            if (typeof text !== "string") return;

            curItemText = { text, path: [...path, String(textIdx)] };
          },
        ],
      },
      after: {},
    });

    if (curItemText) {
      this.textData = {
        status: "raw",
        text: curItemText.text,
        textPath: curItemText.path,
        expr: parseBasicExpressions(curItemText.text),
      };
    }
  }

  expand() {}

  evaluate(
    context: { addr: DocAddr; callTree: string[] },
    getVariable: (name: string) => any,
    getFunction: (name: string) => TemplaterFunction<any, DocAddr> | undefined,
  ) {
    if (this.textData?.status === "raw") {
      let result = "";
      for (const item of this.textData.expr) {
        if (typeof item === "string") {
          result += item;
          continue;
        }

        evaluateExpression<DocAddr>(
          item,
          { ...context, callTree: [...context.callTree, "paragraph"] },
          getFunction,
          getVariable,
        );
      }

      this.textData = {
        status: "evaluated",
        textPath: this.textData.textPath,
        resultText: result,
      };
    }
  }

  rebuild(): any[] {
    if (this.textData) {
      let theObj = this.obj;
      for (const p of this.textData.textPath) theObj = theObj[p];

      theObj["#text"] =
        this.textData.status === "evaluated"
          ? this.textData.resultText
          : this.textData.text;
    }

    return [this.obj];
  }
}
