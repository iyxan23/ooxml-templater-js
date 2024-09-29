import { TemplaterFunction } from "../../expression/evaluate";
import { DocAddr } from "../doc-templater";
import { ParagraphElement } from "./paragraph";

export interface BodyElement {
  expand(
    context: { addr: DocAddr, callTree: string[] },
    getVariable: (name: string) => any,
    getFunction: (name: string) => TemplaterFunction<any, DocAddr> | undefined,
  ): void;

  evaluate(
    context: { addr: DocAddr, callTree: string[] },
    getVariable: (name: string) => any,
    getFunction: (name: string) => TemplaterFunction<any, DocAddr> | undefined,
  ): void;

  rebuild(): any[];
}

class OtherElement implements BodyElement {
  constructor(private obj: any) {}

  expand(): void {}
  evaluate(): void {}

  rebuild(): any[] {
    return [this.obj];
  }
}

const elements: Record<string, { parse: (obj: any) => BodyElement }> = {
  "w:p": {
    parse: (obj) => new ParagraphElement(obj),
  },
};

export function parseElements(document: any[]): BodyElement[] {
  const result: BodyElement[] = [];

  for (const item of document) {
    const [elementName] = Object.keys(item);

    if (elementName) {
      const compatibleElement = elements[elementName];

      if (compatibleElement) {
        result.push(compatibleElement.parse(item[elementName]));
        continue;
      }
    }

    result.push(new OtherElement(item));
  }

  return result;
}
