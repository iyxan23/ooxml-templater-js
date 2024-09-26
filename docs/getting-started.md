# Getting Started

Oh, so you want to use it? cool.

## Installing

`ooxml-templater-js` is an _interesting_ project of mine, that hasn't been published
to npm yet, and will most likely not. Best you could do is by cloning this repo or
adding it as a submodule to your existing github repo:

```console
$ # this will clone the staging branch instead of `main`, because the latter is prone to wip commits
$ git clone -b staging https://github.com/iyxan23/ooxml-templater-js
```

Then add it as a dependency by path as such in your `package.json` file:

```json
{
  "dependencies": {
    "ooxml-templater": "./path/to/ooxml-templater-js"
  }
}
```

> and yes, the package name is only `ooxml-templater`, without the `-js`. The
> goal of using the `-js` suffix is to make the library.. i guess more
> distinguishable when searching.

After putting the library in your `package.json`, you will also need to do an
`npm ci` and `npm run build` to build `ooxml-templater-js` to be able to be
used:

```console
$ cd path/to/ooxml-templater-js
$ npm ci
$ npm run build
```

## Browser Support?

Yes, this library does not use any Node-specific APIs so it's safe to use in a
client-side js. But I would **REALLY** recommend using a server instead, because
it's packed up with `@zip.js/zip.js` and `fast-xml-parser` (cough, and `zod`),
which might make your bundle rise like a tsunami about to wreck underpowered clients!

But at the end of the day it's up to you ¯\\\_(ツ)\_/¯

Like what I did with this site: https://iyxan23.github.io/ooxml-templater-js (you can try
out the library here right on the browser btw)

## Using

Currently it technically cannot be considered as "stable" yet, but I'm looking
forward for feedback and seeing it being used in real-world applications where the
documents may well be through-the-roof.

Despite the name `ooxml`, I have not yet considered adding support for `.pptx`
files, as I don't need that yet. But here is the feature matrix (and plans) for
this library:

| file      | feature                                                     | is it done?           |
| ------    | ----                                                        | ----                  |
| 🟩 `xlsx` | [a freaking custom templating syntax](./template-syntax.md) | ✅ 🔥🔥🔥🔥🔥              |
| 🟦 `docx` | really basic templating                                     | ✅ ofc lol            |
| 🟦 `docx` | templating tables like sheets                               | 🤔 thinking of adding |
| 🟧 `pptx` | -                                                           | 🙅 i dont need it     |

### bro i need code!

I only made **TWO** functions to be public APIs.

Please **don't** depend on **any other APIs than these two**, as they most likely
will break.

```ts
// get this function from:
// import { xlsxFillTemplate } from 'ooxml-templater/xlsx';
export declare function xlsxFillTemplate(
  xlsx: ReadableStream,
  output: WritableStream,
  input: any,
  opts?: {
    functions?: Record<string, TemplaterFunction<any>>;
    onSheetFinished: (status: {
      status: "success";
      issues: Issue[];
    } | {
      status: "failed";
      issues: Issue[];
      error: Issue;
    }) => void;
  }
): Promise<void>;

// get this function from:
// import { docxFillTemplate } from 'ooxml-templater/docx';
export declare function docxFillTemplate(
  docx: ReadableStream,
  output: WritableStream,
  input: any
): Promise<void>;
```

I only provide APIs that work directly with `Writable`/`ReadableStream`s. This
is perfect for something like API routes in Next.js where you can pass a
`ReadableStream` directly as a response, so the document data will be
streamed out right away without waiting for all of the data to be buffered.

A Next.js route example:

```ts
export async function POST(req: NextRequest): Promise<NextResponse> {
  // ... do some stuff ...
  const file: File = ...;

  const outputStream = new TransformStream();

  void xlsxFillTemplate( // <- notice how there's no await
    file.stream(),
    outputStream.writable,
    { /* ... input data ... */ }
  );

  return new Response(outputStream.readable);
  // ^ this Response will be the "pull" that actually pulls
  //   data from `TransformStream`, which will pull its data
  //   handled by the `xlsxFillTemplate` function.
}
```

Man, this API just looks so good.

If you really need just a regular `Uint8Array`/`Blob`/`Arraybuffer`, you can
too. It's pretty flexible. Here's a workaround by "tricking" `Response` to
make a `Blob` out of this whole thing:

```
const outputStream = new TransformStream();
void docxFillTemplate( // <- notice how there's no await
  file.stream(),
  outputStream.writable,
  { /* ... input data ... */ }
);

//           ----- we await here
const blob = await new Response(outputStream.readable).blob();
```

And would you look at that, satisfying the needs of two different users of
the same library :)

### Why `any` on the 2nd parameter????

If you look closely at the type declarations, each functions takes two
parameters which are the readable/writable streams, and a single `input` with
a type of `any`. huh, what does that do!!?

Okay, so when you're doing templating stuff, of course you will need a "data
source" where the "template" can then access and actually put data in them!

The `input` object is essentially that, it is the object where the templater
will take the data from. Let's say a docx file with these texts:

```
CEASE AND DESIST
SUBJECT: NOT PROPERLY WORKING ON THIS LIBRARY

Dear, {name}. I literally...
```

If you give it an input of:

```json
{ "name": "iyxan" }
```

and the resulting `docx` will be:

```
CEASE AND DESIST
SUBJECT: NOT PROPERLY WORKING ON THIS LIBRARY

Dear, iyxan. I literally...
```

That's it..

But you can get REALLY complex with the sheet functional language I made.
Like, working with arrays, or array of arrays, or array of objects, or arrays
of snacks, oops I'll be discussing it on a different file [here](./template-syntax.md).
