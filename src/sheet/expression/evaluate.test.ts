import { z } from "zod";
import { createTemplaterFunction } from "../sheet-templater";
import { evaluateExpression } from "./evaluate";
import { Expression } from "./parser";
import { success } from "./result";

function mockWarn() {
  return vi.spyOn(console, "warn").mockImplementation(() => undefined);
}

describe("expression evaluation", () => {
  it("evaluates a variableAccess expression", (test) => {
    const consoleWarnMock = mockWarn();
    test.onTestFinished(() => consoleWarnMock.mockRestore());

    const expr: Expression = {
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

    const expr: Expression = {
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

  it("returns an issue when encountering blockStart", (test) => {
    const consoleWarnMock = mockWarn();
    test.onTestFinished(() => consoleWarnMock.mockRestore());

    const expr: Expression = {
      type: "blockStart",
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

  it("returns an issue when encountering blockEnd", (test) => {
    const consoleWarnMock = mockWarn();
    test.onTestFinished(() => consoleWarnMock.mockRestore());

    const expr: Expression = {
      type: "blockEnd",
      identifier: "hello",
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

  it("returns an issue when encountering variableHoist", (test) => {
    const consoleWarnMock = mockWarn();
    test.onTestFinished(() => consoleWarnMock.mockRestore());

    const expr: Expression = {
      type: "variableHoist",
      identifier: "hello",
      expression: { type: "variableAccess", identifier: "hello", args: [] },
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

  it("returns a function call when calling a lambda", (test) => {
    const consoleWarnMock = mockWarn();
    test.onTestFinished(() => consoleWarnMock.mockRestore());

    // { [hello [:world]] }
    const expr: Expression = {
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
    const expr: Expression = {
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
          }).call
          : fName === "ret"
            ? createTemplaterFunction(z.tuple([z.string()]), (s) => {
              return success(`ret ${s}`);
            }).call
            : undefined,
      (_vName) => undefined,
    );

    if (result.status === "failed") {
      throw new Error(JSON.stringify(result));
    }

    console.log(result.issues);

    expect(result.issues).toHaveLength(0);
    expect(result.result).toEqual("ret people!");
    expect(consoleWarnMock).toHaveBeenCalledTimes(0);
  });
});
