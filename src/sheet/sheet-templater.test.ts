import { z } from "zod";
import { Sheet } from "./sheet";
import {
  callLambda,
  createTemplaterFunction,
  createTemplaterNoArgsFunction,
  SheetTemplater,
  TemplatableCell,
} from "./sheet-templater";
import { success } from "./expression/result";

class SimpleCell implements TemplatableCell {
  text: string;

  constructor(text: string) {
    this.text = text;
  }

  getTextContent(): string {
    return this.text;
  }

  editTextContent(content: string): SimpleCell {
    this.text = content;
    return this;
  }

  cloneWithTextContent(content: string): SimpleCell {
    return new SimpleCell(content);
  }
}

function cell(text: string) {
  return new SimpleCell(text);
}

describe("SheetTemplater", () => {
  it("does literally nothing", () => {
    const sheet = new Sheet<TemplatableCell>([
      [cell("hello"), cell("world")],
      [cell("hello 2"), cell("world 2")],
    ]);

    const templater = new SheetTemplater(sheet, {});
    const result = templater.interpret({});

    if (result.status === "failed") {
      throw result.error;
    }

    expect(result.issues).toHaveLength(0);
    expect(result.result.getSheet()).toEqual([
      [cell("hello"), cell("world")],
      [cell("hello 2"), cell("world 2")],
    ]);
  });

  it("templates a simple variable", () => {
    const sheet = new Sheet<TemplatableCell>([
      [cell("hello"), cell("before [:hello] after")],
      [cell("hello 2"), cell("world 2")],
    ]);

    const templater = new SheetTemplater(sheet, {});
    const result = templater.interpret({ hello: "world" });

    if (result.status === "failed") {
      throw result.error;
    }

    expect(result.issues).toHaveLength(0);
    expect(result.result.getSheet()).toEqual([
      [cell("hello"), cell("before world after")],
      [cell("hello 2"), cell("world 2")],
    ]);
  });

  it("templates a simple function call", () => {
    const sheet = new Sheet<TemplatableCell>([
      [cell("hello"), cell("world")],
      [cell("hello 2 [callMe] what"), cell("world 2")],
      [cell("sup"), cell("'ts going on?")],
    ]);

    const templater = new SheetTemplater(sheet, {
      functions: {
        callMe: createTemplaterNoArgsFunction(() => "please call me"),
      },
    });
    const result = templater.interpret({});

    if (result.status === "failed") {
      throw result.error;
    }

    expect(result.issues).toHaveLength(0);
    expect(result.result.getSheet()).toEqual([
      [cell("hello"), cell("world")],
      [cell("hello 2 please call me what"), cell("world 2")],
      [cell("sup"), cell("'ts going on?")],
    ]);
  });

  it("templates a function calls and variables", () => {
    const sheet = new Sheet<TemplatableCell>([
      [cell("[:person name]"), cell("[:person occupation]")],
      [cell("length of name: [length [:person name]]"), cell("")],
      [
        cell("hello, i am [:me name], nice to meet you [:person name]"),
        cell("you are [sub [:person age] [:me age]] years older than me :)"),
      ],
    ]);

    const templater = new SheetTemplater(sheet, {
      functions: {
        length: createTemplaterFunction(z.tuple([z.string()]), (str) =>
          success(str.length),
        ),
        sub: createTemplaterFunction(
          z.tuple([z.number(), z.number()]),
          (a, b) => success(a - b),
        ),
      },
    });
    const result = templater.interpret({
      person: {
        name: "iyxan",
        occupation: "software engineer",
        age: 100,
      },
      me: {
        name: "naxyi",
        age: 56,
      },
    });

    if (result.status === "failed") {
      throw result.error;
    }

    expect(result.issues).toHaveLength(0);
    expect(result.result.getSheet()).toEqual([
      [cell("iyxan"), cell("software engineer")],
      [cell("length of name: 5"), cell("")],
      [
        cell("hello, i am naxyi, nice to meet you iyxan"),
        cell("you are 44 years older than me :)"),
      ],
    ]);
  });

  it("can perform a complex task", () => {
    const sheet = new Sheet<TemplatableCell>([
      [
        cell(
          "[stringify [reduce [:twoDArray] a aAcc { [add [:aAcc] [reduce [:a] b bAcc { [add [:b] [:bAcc]] } 0]] } 0]]",
        ),
      ],
    ]);

    const templater = new SheetTemplater(sheet, {
      functions: {
        stringify: createTemplaterFunction(z.tuple([z.coerce.number()]), (a) =>
          success(a),
        ),
        reduce: createTemplaterFunction(
          z.tuple([
            z.array(z.any()),
            z.string(),
            z.string(),
            z.function(),
            z.any().optional(),
          ]),
          (arr, itemName, accName, fn, init) => {
            let result = init;
            const issues = [];
            const callFn = callLambda(fn);

            for (const item of arr) {
              const callResult = callFn({
                variables: {
                  [itemName]: item,
                  [accName]: result,
                },
              });

              if (callResult.status === "failed") return callResult;
              issues.push(...callResult.issues);

              result = callResult.result;
            }

            return success(result, issues);
          },
        ),
        add: createTemplaterFunction(
          z.tuple([z.coerce.number(), z.coerce.number()]),
          (a, b) => success(a + b),
        ),
      },
    });
    const result = templater.interpret({
      twoDArray: [
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
        [21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      ],
    });

    if (result.status === "failed") {
      throw result.error;
    }

    expect(result.issues).toHaveLength(0);
    expect(result.result.getSheet()).toEqual([[cell("465")]]);
  });
});
