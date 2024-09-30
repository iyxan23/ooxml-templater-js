import {
  BasicExpressionsWithStaticTexts,
  parseBasicExpressions,
} from "../../expression/parser";
import { startVisiting } from "../../visitor-editor";
import { BodyElement } from ".";
import {
  evaluateExpression,
  TemplaterFunction,
} from "../../expression/evaluate";
import { DocAddr } from "../doc-templater";
import { Issue, Result, success } from "../../result";
import { isNumeric } from "../../utils";

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
  private clones: {
    paragraphs: ParagraphElement[];
    indexIdent: string;
  } | null = null;

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

  expand(
    context: { addr: DocAddr; callTree: string[] },
    getVariable: (name: string) => any,
    getFunction: (name: string) => TemplaterFunction<any, DocAddr> | undefined,
  ): Result<void, DocAddr> {
    const issues: Issue<DocAddr>[] = [];

    if (this.textData?.status !== "raw") return success(undefined, []);
    const expr = this.textData.expr;
    const result: BasicExpressionsWithStaticTexts = [];
    let clone: null | { count: number; idxIdent: string } = null;

    // search for [l#repeatLine]
    for (let i = 0; i < expr.length; i++) {
      const item = expr[i]!;

      // ignore non-expression and non-specialCall
      if (typeof item !== "object" || item.type !== "specialCall") {
        result.push(item);
        continue;
      }

      if (item.code !== "l" || item.identifier !== "repeatLine") {
        issues.push({
          message: `Unknown special call [${item.code}#${item.identifier}]`,
          addr: context.addr,
        });

        continue;
      }

      if (clone) {
        issues.push({
          message: `[l#repeatLine] can only be used once`,
          addr: context.addr,
        });

        continue;
      }

      const repeatLineCountArg = item.args[0];
      const repeatLineIdxArg = item.args[1];

      if (!repeatLineCountArg || !repeatLineCountArg) {
        issues.push({
          message: `[l#repeatLine] requires two arguments: [l#repeatLine [count] idx]`,
          addr: context.addr,
        });

        // don't add this
        continue;
      }

      let repeatLineCountResult =
        typeof repeatLineCountArg !== "string"
          ? evaluateExpression(
            repeatLineCountArg,
            {
              ...context,
              callTree: [...context.callTree, "paragraph expansion"],
            },
            getFunction,
            getVariable,
          )
          : success<string, DocAddr>(repeatLineCountArg);

      if (repeatLineCountResult.status === "failed")
        return repeatLineCountResult;
      issues.push(...repeatLineCountResult.issues);

      const repeatLineCountResultValue = repeatLineCountResult.result;

      let repeatLineCount: number;

      if (typeof repeatLineCountResultValue !== "number") {
        if (
          typeof repeatLineCountResultValue === "string" &&
          isNumeric(repeatLineCountResultValue)
        ) {
          repeatLineCount = parseInt(repeatLineCountResultValue);
        } else {
          // not a string, not a numeric, not a number
          issues.push({
            message: "First argument of [l#repeatLine] must be a number",
            addr: context.addr,
          });

          continue;
        }
      } else {
        repeatLineCount = repeatLineCountResultValue;
      }

      if (typeof repeatLineIdxArg !== "string") {
        issues.push({
          message:
            "Second argument of [l#repeatLine] must be a string as an identifier",
          addr: context.addr,
        });

        continue;
      }

      const repeatLineIdx = repeatLineIdxArg;

      clone = {
        count: repeatLineCount,
        idxIdent: repeatLineIdx,
      };
    }

    if (clone) {
      const thisParagraphObj = this.rebuild()[0];

      this.clones = {
        paragraphs: Array(clone.count).map(
          () => new ParagraphElement(structuredClone(thisParagraphObj)),
        ),
        indexIdent: clone.idxIdent,
      };
    }

    return success(undefined, [...issues]);
  }

  evaluate(
    context: { addr: DocAddr; callTree: string[] },
    getVariable: (name: string) => any,
    getFunction: (name: string) => TemplaterFunction<any, DocAddr> | undefined,
  ): Result<void, DocAddr> {
    const issues: Issue<DocAddr>[] = [];

    if (this.textData?.status === "raw") {
      let result = "";
      for (const item of this.textData.expr) {
        if (typeof item === "string") {
          result += item;
          continue;
        }

        const evalResult = evaluateExpression<DocAddr>(
          item,
          { ...context, callTree: [...context.callTree, "paragraph"] },
          getFunction,
          getVariable,
        );

        if (evalResult.status === "failed") return evalResult;
        issues.push(...evalResult.issues);

        result += evalResult.result;
      }

      this.textData = {
        status: "evaluated",
        textPath: this.textData.textPath,
        resultText: result,
      };
    }

    return success(undefined, issues);
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

    return [this.obj, ...(this.clones?.paragraphs ?? [])];
  }
}
