import fs from "node:fs";
import { Readable, Writable } from "node:stream";
import { docxFillTemplate } from "src/docx";
import { xlsxFillTemplate } from "src/xlsx";

async function main() {
  // get first argument and second argument, then read them as files
  const [typ, inputFile, outputFile, outputType, jsonInput] =
    process.argv.slice(2);

  if (
    (typ !== "xlsx" && typ !== "docx") ||
    !inputFile ||
    !outputFile ||
    (outputType !== "json-file" && outputType !== "json-inline") ||
    !jsonInput
  ) {
    console.error(
      "Usage: [xlsx|docx] <input-file> <output-file> [json-file|json-inline] <path|string>",
    );
    process.exit(1);
  }

  const inputFileReadStream = fs.createReadStream(inputFile);
  const outputFileWriteStream = fs.createWriteStream(outputFile);

  const input = JSON.parse(
    outputType === "json-inline"
      ? jsonInput
      : (() => fs.readFileSync(jsonInput, "utf-8"))(),
  );

  if (typ === "docx") {
    await docxFillTemplate(
      Readable.toWeb(inputFileReadStream) as ReadableStream,
      Writable.toWeb(outputFileWriteStream) as WritableStream,
      input,
    );
  } else {
    await xlsxFillTemplate(
      Readable.toWeb(inputFileReadStream) as ReadableStream,
      Writable.toWeb(outputFileWriteStream) as WritableStream,
      input,
      {
        onSheetFinished: (status) => {
          console.log("sheet finished templated, additional info:");
          console.log(JSON.stringify(status));
        },
      },
    );
  }

  console.log("ooxml-templater-js v0.0.1");
}

main();
