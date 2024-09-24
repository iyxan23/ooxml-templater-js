import { z } from "zod";
import { callLambda, createTemplaterFunction } from "./function/wrapper";
import { createTemplaterNoArgsFunction } from "./function/wrapper";
import { evaluateExpression } from "./evaluate";
import { Issue } from "src/result";
import { BasicExpression } from "./parser";
import { success } from "../result";

function mockWarn() {
  return vi.spyOn(console, "warn").mockImplementation(() => undefined);
}

describe("expression evaluation", () => {
  it("evaluates a variableAccess expression", (test) => {
    const consoleWarnMock = mockWarn();
    test.onTestFinished(() => consoleWarnMock.mockRestore());

    const expr: BasicExpression = {
      type: "variableAccess",
      identifier: "hello",
      args: [],
    };

    const result = evaluateExpression(
      expr,
      { col: 0, row: 0, callTree: ["root"] },
      (_fName) => undefined,
      (vName) => (vName === "hello" ? "world" : undefined),
    );

    if (result.status === "failed") {
      throw new Error(JSON.stringify(result));
    }

    expect(result.result).toEqual("world");
    expect(result.issues).toEqual([]);
    expect(consoleWarnMock).toBeCalledTimes(0);
  });

  it("executes a function call", (test) => {
    const consoleWarnMock = mockWarn();
    test.onTestFinished(() => consoleWarnMock.mockRestore());

    const expr: BasicExpression = {
      type: "call",
      identifier: "hello",
      args: ["world"],
    };

    const result = evaluateExpression(
      expr,
      { col: 0, row: 0, callTree: ["root"] },
      (fName) =>
        fName === "hello"
          ? (_funcName, arg) => success("hello, " + JSON.stringify(arg))
          : undefined,
      (_vName) => undefined,
    );

    if (result.status === "failed") {
      throw new Error(JSON.stringify(result));
    }

    expect(result.issues).toHaveLength(0);
    expect(result.result).toEqual('hello, "world"');

    expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  });

  it("returns an issue when encountering specialCall", (test) => {
    const consoleWarnMock = mockWarn();
    test.onTestFinished(() => consoleWarnMock.mockRestore());

    const expr: BasicExpression = {
      type: "specialCall",
      code: "a",
      closing: false,
      identifier: "hello",
      args: [],
    };

    const result = evaluateExpression(
      expr,
      { col: 0, row: 0, callTree: ["root"] },
      (_fName) => undefined,
      (_vName) => undefined,
    );

    if (result.status === "failed") {
      throw new Error(JSON.stringify(result));
    }

    expect(result.result).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        col: 0,
        row: 0,
        // message may change
      }),
    );
    expect(consoleWarnMock).toHaveBeenCalledOnce();
  });

  it("spreads arrays correctly", (test) => {
    const consoleWarnMock = mockWarn();
    test.onTestFinished(() => consoleWarnMock.mockRestore());

    // [call ...[:array]]
    const expr: BasicExpression = {
      type: "call",
      identifier: "call",
      args: [
        {
          type: "spread",
          expr: {
            type: "variableAccess",
            identifier: "array",
            args: [],
          },
        },
      ],
    };

    const result = evaluateExpression(
      expr,
      { col: 0, row: 0, callTree: ["root"] },
      (fName) =>
        fName === "call"
          ? (_funcName, ...args) => success("called: " + JSON.stringify(args))
          : undefined,
      (vName) => (vName === "array" ? ["hello", "world"] : undefined),
    );

    if (result.status === "failed") {
      throw new Error(JSON.stringify(result));
    }

    expect(result.issues).toHaveLength(0);
    expect(result.result).toEqual('called: ["hello","world"]');
    expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  });

  it("returns a function call when calling a lambda", (test) => {
    const consoleWarnMock = mockWarn();
    test.onTestFinished(() => consoleWarnMock.mockRestore());

    // { [hello [:world]] }
    const expr: BasicExpression = {
      type: "lambda",
      expression: {
        type: "call",
        identifier: "hello",
        args: [
          {
            type: "variableAccess",
            identifier: "world",
            args: [],
          },
        ],
      },
    };

    const result = evaluateExpression(
      expr,
      { col: 0, row: 0, callTree: ["root"] },
      (fName) =>
        fName === "hello"
          ? (_funcName, arg) => success("hello " + arg)
          : undefined,
      (_vName) => undefined,
    );

    if (result.status === "failed") {
      throw new Error(JSON.stringify(result));
    }

    expect(result.issues).toHaveLength(0);
    expect(result.result).toStrictEqual(expect.any(Function));

    // execute the result (which is a function that takes a lookupVariable function)
    const executionResult = result.result((vName: string) =>
      vName === "world" ? "people!" : undefined,
    );

    if (executionResult.status === "failed") {
      throw new Error(JSON.stringify(executionResult));
    }

    expect(executionResult.issues).toHaveLength(0);
    expect(executionResult.result).toEqual("hello people!");
    expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  });

  it("evaluates a function that calls a lambda", (test) => {
    const consoleWarnMock = mockWarn();
    test.onTestFinished(() => consoleWarnMock.mockRestore());

    // [call { [ret [:world]] }]
    const expr: BasicExpression = {
      type: "call",
      identifier: "call",
      args: [
        {
          type: "lambda",
          expression: {
            type: "call",
            identifier: "ret",
            args: [
              {
                type: "variableAccess",
                identifier: "world",
                args: [],
              },
            ],
          },
        },
      ],
    };

    const result = evaluateExpression(
      expr,
      { col: 0, row: 0, callTree: ["root"] },
      (fName) =>
        fName === "call"
          ? createTemplaterFunction(z.tuple([z.function()]), (s) => {
              return s((vName: string) =>
                vName === "world" ? "people!" : undefined,
              );
            })
          : fName === "ret"
            ? createTemplaterFunction(z.tuple([z.string()]), (s) => {
                return success(`ret ${s}`);
              })
            : undefined,
      (_vName) => undefined,
    );

    if (result.status === "failed") {
      throw new Error(JSON.stringify(result));
    }

    expect(result.issues).toHaveLength(0);
    expect(result.result).toEqual("ret people!");
    expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  });

  it("should be able to index objects", (test) => {
    const consoleWarnMock = mockWarn();
    test.onTestFinished(() => consoleWarnMock.mockRestore());

    // [:var hello world how is it going]
    const expr: BasicExpression = {
      type: "variableAccess",
      identifier: "var",
      args: ["hello", "world", "how", "is", "it", "going"],
    };

    const result = evaluateExpression(
      expr,
      { col: 0, row: 0, callTree: ["root"] },
      (_fName) => undefined,
      (vName) =>
        vName === "var"
          ? { hello: { world: { how: { is: { it: { going: "awesome!" } } } } } }
          : undefined,
    );

    if (result.status === "failed") {
      throw new Error(JSON.stringify(result));
    }

    expect(result.issues).toHaveLength(0);
    expect(result.result).toEqual("awesome!");

    expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  });

  it("should be able to index objects", (test) => {
    const consoleWarnMock = mockWarn();
    test.onTestFinished(() => consoleWarnMock.mockRestore());

    // [:var hello world [how] is it going]
    const expr: BasicExpression = {
      type: "variableAccess",
      identifier: "var",
      args: [
        "hello",
        "world",
        { type: "call", identifier: "getHow", args: [] },
        "is",
        "it",
        "going",
      ],
    };

    const result = evaluateExpression(
      expr,
      { col: 0, row: 0, callTree: ["root"] },
      (fName) =>
        fName === "getHow"
          ? createTemplaterNoArgsFunction(() => "how")
          : undefined,
      (vName) =>
        vName === "var"
          ? { hello: { world: { how: { is: { it: { going: "awesome!" } } } } } }
          : undefined,
    );

    if (result.status === "failed") {
      throw new Error(JSON.stringify(result));
    }

    expect(result.issues).toHaveLength(0);
    expect(result.result).toEqual("awesome!");

    expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  });

  it("should be able to execute a complex expression", (test) => {
    const consoleWarnMock = mockWarn();
    test.onTestFinished(() => consoleWarnMock.mockRestore());

    // [join [map [:students] item { [:item fullName] } ] ", "]
    const expr: BasicExpression = {
      type: "call",
      identifier: "join",
      args: [
        {
          type: "call",
          identifier: "map",
          args: [
            {
              type: "variableAccess",
              identifier: "students",
              args: [],
            },
            "item",
            {
              type: "lambda",
              expression: {
                type: "variableAccess",
                identifier: "item",
                args: ["fullName"],
              },
            },
          ],
        },
        ", ",
      ],
    };

    const result = evaluateExpression(
      expr,
      { col: 0, row: 0, callTree: ["root"] },
      (fName) =>
        ({
          map: createTemplaterFunction(
            z.tuple([z.array(z.any()), z.string(), z.function()]),
            (arr, ident, fn) => {
              const fnLambda = callLambda(fn);
              const r: any[] = [];
              const issues: Issue[] = [];

              for (const item of arr) {
                const result = fnLambda({ variables: { [ident]: item } });

                if (result.status === "failed") return result;

                r.push(result.result);
                issues.push(...result.issues);
              }

              return success(r, issues);
            },
          ),
          join: createTemplaterFunction(
            z.tuple([z.array(z.string()), z.string()]),
            (strings, sep) => {
              return success(strings.join(sep));
            },
          ),
        })[fName],
      (vName) =>
        vName === "students"
          ? [
              {
                fullName: "John Doe",
              },
              {
                fullName: "Jane Doe",
              },
              {
                fullName: "Mark Doe",
              },
              {
                fullName: "Mary Doe",
              },
            ]
          : undefined,
    );

    if (result.status === "failed") {
      throw new Error(JSON.stringify(result));
    }

    expect(result.issues).toHaveLength(0);
    expect(result.result).toEqual("John Doe, Jane Doe, Mark Doe, Mary Doe");
    expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  });
});
