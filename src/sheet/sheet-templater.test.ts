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
    expect(result.result.sheet.getSheet()).toEqual([
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
    expect(result.result.sheet.getSheet()).toEqual([
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
    expect(result.result.sheet.getSheet()).toEqual([
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
    expect(result.result.sheet.getSheet()).toEqual([
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
    expect(result.result.sheet.getSheet()).toEqual([[cell("465")]]);
  });

  it("can hoist variables and use them", () => {
    const sheet = new Sheet<TemplatableCell>([
      [cell("[:personOne]"), cell("[greet [:personOne]]")],
      [cell("[:personTwo]"), cell("[greet [:personTwo]]")],
      [cell('[hoist personTwo [concat [:personOne] " version two :)"]]')],
    ]);

    const templater = new SheetTemplater(sheet, {
      functions: {
        greet: createTemplaterFunction(z.tuple([z.any()]), (name) =>
          success(`hello, ${name}`),
        ),
        concat: createTemplaterFunction(
          z.tuple([z.string(), z.string()]),
          (a, b) => success(`${a}${b}`),
        ),
      },
    });

    const result = templater.interpret({ personOne: "iyxan" });

    if (result.status === "failed") {
      throw result.error;
    }

    expect(result.issues).toHaveLength(0);
    expect(result.result.sheet.getSheet()).toEqual([
      [cell("iyxan"), cell("hello, iyxan")],
      [cell("iyxan version two :)"), cell("hello, iyxan version two :)")],
      [cell(""), null],
    ]);
  });

  it("does a repeatRow", () => {
    const sheet = new Sheet<TemplatableCell>([
      [cell("No."), cell("Full Name"), cell("Age"), cell("GPA")],
      [
        cell("[#repeatRow [length [:students]] idx][add [:idx] 1]."),
        cell("[:students [:idx] fullName]"),
        cell("[:students [:idx] age]"),
        cell("[:students [:idx] gpa][/#repeatRow]"),
      ],
    ]);

    const templater = new SheetTemplater(sheet, {
      functions: {
        add: createTemplaterFunction(
          z.tuple([z.any(), z.coerce.number()]),
          (a, b) => success(a + b),
        ),
        length: createTemplaterFunction(z.tuple([z.array(z.any())]), (a) =>
          success(a.length),
        ),
      },
    });

    const result = templater.interpret({
      students: [
        {
          fullName: "John",
          age: 57,
          gpa: 21,
        },
        {
          fullName: "Mark",
          age: 93,
          gpa: 100,
        },
        {
          fullName: "Elon",
          age: 102,
          gpa: 83,
        },
        {
          fullName: "Gates",
          age: 83,
          gpa: 73,
        },
      ],
    });

    if (result.status === "failed") {
      throw result.error;
    }

    expect(result.issues).toHaveLength(0);
    expect(result.result.sheet.getSheet()).toEqual([
      [cell("No."), cell("Full Name"), cell("Age"), cell("GPA")],
      [cell("1."), cell("John"), cell("57"), cell("21")],
      [cell("2."), cell("Mark"), cell("93"), cell("100")],
      [cell("3."), cell("Elon"), cell("102"), cell("83")],
      [cell("4."), cell("Gates"), cell("83"), cell("73")],
    ]);
  });

  it("does a repeatCol", () => {
    const sheet = new Sheet<TemplatableCell>([
      [cell("[#repeatCol [length [:students]] idx][add [:idx] 1].")],
      [cell("[:students [:idx] fullName]")],
      [cell("[:students [:idx] age]")],
      [cell("[:students [:idx] gpa][/#repeatCol]")],
    ]);

    const templater = new SheetTemplater(sheet, {
      functions: {
        add: createTemplaterFunction(
          z.tuple([z.any(), z.coerce.number()]),
          (a, b) => success(a + b),
        ),
        length: createTemplaterFunction(z.tuple([z.array(z.any())]), (a) =>
          success(a.length),
        ),
      },
    });

    const result = templater.interpret({
      students: [
        {
          fullName: "John",
          age: 57,
          gpa: 21,
        },
        {
          fullName: "Mark",
          age: 93,
          gpa: 100,
        },
        {
          fullName: "Elon",
          age: 102,
          gpa: 83,
        },
        {
          fullName: "Gates",
          age: 83,
          gpa: 73,
        },
        {
          fullName: "Andrew",
          age: 39,
          gpa: 64,
        },
      ],
    });

    if (result.status === "failed") {
      throw result.error;
    }

    expect(result.issues).toHaveLength(0);
    expect(result.result.sheet.getSheet()).toEqual([
      [cell("1."), cell("2."), cell("3."), cell("4."), cell("5.")],
      [cell("John"), cell("Mark"), cell("Elon"), cell("Gates"), cell("Andrew")],
      [cell("57"), cell("93"), cell("102"), cell("83"), cell("39")],
      [cell("21"), cell("100"), cell("83"), cell("73"), cell("64")],
    ]);
  });

  it("does a complex multiple blocks", () => {
    const sheet = new Sheet<TemplatableCell>([
      [
        cell(
          "[hoist grades [unique [flatten [map [:students] student { [keys [:students [:student] grades]] }]]]]",
        ),
      ],
      [
        cell("No"),
        cell("Full Name"),
        cell("Class"),
        cell("[#repeatCol [:grades length] gradeIdx][:grades [:gradeIdx]]"),
      ],
      [
        cell(
          "[#repeatRow [:students length] studentIdx][add [:studentIdx] 1].",
        ),
        cell("[:students [:studentIdx] fullName]"),
        cell("[:students [:studentIdx] class]"),
        cell(
          '[ifUndefined [:students [:studentIdx] grades [:grades [:gradeIdx]]] "N/A"][/#repeatCol][/#repeatRow]',
        ),
      ],
    ]);

    const templater = new SheetTemplater(sheet, {
      functions: {
        add: createTemplaterFunction(
          z.tuple([z.coerce.number(), z.coerce.number()]),
          (a, b) => success(a + b),
        ),
        unique: createTemplaterFunction(z.tuple([z.array(z.any())]), (a) =>
          success([...new Set(a)]),
        ),
        keys: createTemplaterFunction(z.tuple([z.any()]), (obj) =>
          success(Object.keys(obj)),
        ),
        flatten: createTemplaterFunction(
          z.tuple([z.array(z.array(z.any()))]),
          (arr) => success(arr.flat()),
        ),
        ifUndefined: createTemplaterFunction(
          z.tuple([z.any(), z.string()]),
          (a, b) => (a === undefined ? success(b) : success(a)),
        ),
        map: createTemplaterFunction(
          z.tuple([z.array(z.any()), z.string(), z.function()]),
          (arr, idxName, fn) => {
            const resultArr = [];
            const issues = [];
            const callFn = callLambda(fn);

            for (let i = 0; i < arr.length; i++) {
              const result = callFn({
                variables: {
                  [idxName]: i,
                },
              });

              if (result.status === "failed") return result;

              issues.push(...result.issues);
              resultArr.push(result.result);
            }

            return success(resultArr, issues);
          },
        ),
      },
    });

    const result = templater.interpret({
      students: [
        {
          fullName: "John",
          class: "5A",
          grades: {
            math: 89,
            english: 90,
            programming: 110,
            science: 93,
          },
        },
        {
          fullName: "Mark",
          class: "5C",
          grades: {
            math: 89,
            english: 90,
            programming: 110,
            science: 93,
          },
        },
        {
          fullName: "Elon",
          class: "5B",
          grades: {
            math: 74,
            spanish: 83,
            social: 94,
            science: 99,
          },
        },
        {
          fullName: "Gates",
          class: "4B",
          grades: {
            math: 74,
            german: 90,
            programming: 70,
            sport: 89,
          },
        },
        {
          fullName: "Andrew",
          class: "4A",
          grades: {
            sport: 64,
            english: 90,
            german: 84,
            social: 100,
          },
        },
      ],
    });

    if (result.status === "failed") {
      throw result.error;
    }

    expect(result.issues).toHaveLength(0);
    expect(result.result.sheet.getSheet()).toEqual([
      [cell("")],
      [
        cell("No"),
        cell("Full Name"),
        cell("Class"),
        cell("math"),
        cell("english"),
        cell("programming"),
        cell("science"),
        cell("spanish"),
        cell("social"),
        cell("german"),
        cell("sport"),
      ],
      [
        cell("1."),
        cell("John"),
        cell("5A"),
        cell("89"),
        cell("90"),
        cell("110"),
        cell("93"),
        cell("N/A"),
        cell("N/A"),
        cell("N/A"),
        cell("N/A"),
      ],
      [
        cell("2."),
        cell("Mark"),
        cell("5C"),
        cell("89"),
        cell("90"),
        cell("110"),
        cell("93"),
        cell("N/A"),
        cell("N/A"),
        cell("N/A"),
        cell("N/A"),
      ],
      [
        cell("3."),
        cell("Elon"),
        cell("5B"),
        cell("74"),
        cell("N/A"),
        cell("N/A"),
        cell("99"),
        cell("83"),
        cell("94"),
        cell("N/A"),
        cell("N/A"),
      ],
      [
        cell("4."),
        cell("Gates"),
        cell("4B"),
        cell("74"),
        cell("N/A"),
        cell("70"),
        cell("N/A"),
        cell("N/A"),
        cell("N/A"),
        cell("90"),
        cell("89"),
      ],
      [
        cell("5."),
        cell("Andrew"),
        cell("4A"),
        cell("N/A"),
        cell("90"),
        cell("N/A"),
        cell("N/A"),
        cell("N/A"),
        cell("100"),
        cell("84"),
        cell("64"),
      ],
    ]);
  });
});
