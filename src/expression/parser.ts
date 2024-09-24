export function parseBasicExpressions(
  input: string,
): BasicExpressionsWithStaticTexts {
  const result: BasicExpressionsWithStaticTexts = [];
  let currentBuf = "";
  let index = 0;

  function parseBasicExpression(): BasicExpression {
    let type: BasicExpression["type"] | null = null;
    let identifier: string | null = null;
    let args: (string | BasicExpression)[] = [];

    if (input[index] === "[") {
      index++;
    } else if (input[index] === "{") {
      index++;

      while (input[index] !== "[" && index < input.length) index++;
      const content = parseBasicExpression();
      while (input[index] !== "}" && index < input.length) index++;

      return {
        type: "lambda",
        expression: content,
      };
    }

    if (input[index] === " " || input[index] === "\t") {
      while (
        (input[index] === " " || input[index] === "\t") &&
        index < input.length
      )
        index++;
    }

    if (input[index] === ":") {
      type = "variableAccess";
      index++;
    } else {
      type = "call";
    }

    let char;
    while ((char = input[index]) !== "]") {
      if (char === "[" || char === "{") {
        args.push(parseBasicExpression());
        index++;
        continue;
      } else if (char === ".") {
        // if there are 3 dots, and there is an expression right after it,
        // that expression's evaluation result will be spread like how the ...
        // operator work

        index++;
        let numberOfDots = 1;
        while (input[index] === ".") {
          numberOfDots++;
          index++;
        }

        // skip if there are no exactly 3 dots
        if (numberOfDots !== 3) {
          currentBuf += ".".repeat(numberOfDots);
          continue;
        }

        // skip if there is no `[` right after it
        if (input[index] !== "[") {
          currentBuf += ".".repeat(numberOfDots);
          continue;
        }

        args.push({
          type: "spread",
          expr: parseBasicExpression(),
        });

        index++;
        continue;
      } else if (char === '"') {
        let str = "";

        index++;

        while (index < input.length) {
          const char = input[index];
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
          identifier = currentBuf;
        } else {
          args.push(currentBuf);
        }

        currentBuf = "";
        index++;

        continue;
      }

      if (index >= input.length) {
        console.error("[err] parser gone too far");
        break;
      }

      currentBuf += char;
      index++;
    }

    if (!identifier) {
      identifier = currentBuf;
      currentBuf = "";
    } else if (currentBuf) {
      args.push(currentBuf);
      currentBuf = "";
    }

    if (!identifier) throw new Error("identifier has not been set yet");
    if (!type) throw new Error("could not determine the type");

    // type is either "call" or "variableAccess"

    if (type === "call") {
      // let's further check if the identifier is a special call
      const split = identifier.split("#");
      if (split.length > 1) {
        // this is a special function
        const closing = identifier.startsWith("/");
        const code = closing ? split[0]!.slice(1) : split[0]!;
        const restIdent = split.slice(1).join("#"); // respect other `#` as identifier

        return {
          type: "specialCall",
          code,
          identifier: restIdent,
          closing,
          args,
        };
      }
    }

    return {
      type,
      identifier,
      args,
    };
  }

  while (index < input.length) {
    const char = input[index];

    if (char === "[") {
      if (currentBuf) result.push(currentBuf);
      currentBuf = "";

      const expr = parseBasicExpression();
      result.push(expr);
    } else {
      currentBuf += char;
    }

    index++;
  }

  if (currentBuf) result.push(currentBuf);

  return result;
}

export type BasicExpressionsWithStaticTexts = (string | BasicExpression)[];

export type BasicExpression =
  // [r#specialCall]
  | {
    type: "specialCall";
    code: string; // the text before `#`
    identifier: string;
    closing: boolean; // whether it has `/` in the front
    args: (string | BasicExpression)[];
  }
  | {
    // evaluation of this expression will be spread
    type: "spread";
    expr: BasicExpression;
  }
  | {
    type: "call";
    identifier: string;
    args: (string | BasicExpression)[];
  }
  | {
    type: "variableAccess";
    identifier: string;
    args: (string | BasicExpression)[];
  }
  | {
    type: "lambda";
    expression: BasicExpression;
  };
