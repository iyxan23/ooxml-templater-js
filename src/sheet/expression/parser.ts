export function parseExpressionCell(s: string): ExpressionCell {
  const result: ExpressionCell = [];
  let currentBuf = "";
  let index = 0;

  function parseExpression(): Expression {
    let type: Expression["type"] | null = null;
    let identifier: string | null = null;
    let args: (string | Expression)[] = [];

    if (s[index] === "[") {
      index++;
    } else if (s[index] === "{") {
      index++;

      while (s[index] !== "[" && index < s.length) index++;
      const content = parseExpression();
      while (s[index] !== "}" && index < s.length) index++;

      return {
        type: "lambda",
        expression: content,
      };
    }

    if (s[index] === " " || s[index] === "\t") {
      while ((s[index] === " " || s[index] === "\t") && index < s.length)
        index++;
    }

    if (s[index] === ":") {
      type = "variableAccess";
      index++;
    } else if (s[index] === "#") {
      type = "blockStart";
      index++;
    } else if (s[index] === "/" && s[index + 1] === "#") {
      type = "blockEnd";
      index++;
      index++;
    } else {
      type = "call";
    }

    let char;
    while ((char = s[index]) !== "]") {
      if (char === "[" || char === "{") {
        args.push(parseExpression());
        index++;
        continue;
      } else if (char === ".") {
        // if there are 3 dots, and there is an expression right after it,
        // that expression's evaluation result will be spread like how the ...
        // operator work

        index++;
        let numberOfDots = 1;
        while (s[index] === ".") {
          numberOfDots++;
          index++;
        }

        // skip if there are no exactly 3 dots
        if (numberOfDots !== 3) {
          currentBuf += ".".repeat(numberOfDots);
          continue;
        }

        // skip if there is no `[` right after it
        if (s[index] !== "[") {
          currentBuf += ".".repeat(numberOfDots);
          continue;
        }

        args.push({
          type: "spread",
          expr: parseExpression(),
        });

        index++;
        continue;
      } else if (char === '"') {
        let str = "";

        index++;

        while (index < s.length) {
          const char = s[index];
          if (char === '"') break;
          str += char;

          index++;
        }

        index++;

        currentBuf += str;
        continue;
      } else if (char === " " || char === "\t") {
        if (!currentBuf) {
          index++;
          continue;
        }

        if (!identifier) {
          if (currentBuf === "hoist") {
            type = "variableHoist";
          } else if (type === "variableHoist") {
            identifier = currentBuf;
          } else {
            identifier = currentBuf;
          }
        } else {
          args.push(currentBuf);
        }

        currentBuf = "";
        index++;

        continue;
      }

      if (index >= s.length) {
        console.error("[err] parser gone too far");
        break;
      }

      currentBuf += char;
      index++;
    }

    if (!identifier) {
      if (currentBuf === "hoist") {
        type = "variableHoist";
      } else if (type === "variableHoist") {
        identifier = currentBuf;
      } else {
        identifier = currentBuf;
      }
      currentBuf = "";
    } else if (currentBuf) {
      args.push(currentBuf);
      currentBuf = "";
    }

    if (!identifier) throw new Error("identifier has not been set yet");
    if (!type) throw new Error("could not determine the type");

    if (type === "blockStart" || type === "variableAccess" || type === "call") {
      return {
        type,
        identifier,
        args,
      };
    } else if (type === "blockEnd") {
      return {
        type,
        identifier,
      };
    } else if (type === "variableHoist") {
      const expression = args[0];
      if (!expression) throw new Error("expression must be set for hoist");
      if (typeof expression === "string")
        throw new Error("variable content must be an expression");

      return {
        type,
        identifier,
        expression,
      };
    }

    throw new Error("unreachable");
  }

  while (index < s.length) {
    const char = s[index];

    if (char === "[") {
      if (currentBuf) result.push(currentBuf);
      currentBuf = "";

      const expr = parseExpression();
      result.push(expr);
    } else {
      currentBuf += char;
    }

    index++;
  }

  if (currentBuf) result.push(currentBuf);

  return result;
}

export type ExpressionCell = (string | Expression)[];

export type Expression =
  | {
    type: "blockStart";
    identifier: string;
    args: (string | Expression)[];
  }
  | {
    type: "blockEnd";
    identifier: string;
  }
  | {
    // evaluation of this expression will be spread
    type: "spread";
    expr: Expression;
  }
  | {
    type: "call";
    identifier: string;
    args: (string | Expression)[];
  }
  | {
    type: "variableAccess";
    identifier: string;
    args: (string | Expression)[];
  }
  | {
    type: "variableHoist";
    identifier: string;
    expression: Expression;
  }
  | {
    type: "lambda";
    expression: Expression;
  };
