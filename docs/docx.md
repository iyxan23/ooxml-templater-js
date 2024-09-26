## Templating docx

`ooxml-templater-js`' docx templater uses the same [templating syntax](./template-syntax.md)
as xlsx, with a difference in special calls, and the ability to use
xlsx-like functionality within tables (`r#repeatRow` and `c#repeatCol`).

You can use the regular function call and variable access expressions:

```
Hello, [:name]!
```

With an input object of:

```json
{ "name": "John" }
```

Will be evaluated to:

```
Hello, John!
```

And functions do work the same:

```
Cities you've been to: [join [map [:places] place { [:place name] }] ", "]
```

With an input object of:

```json
{
  "places": [
    { "name": "London" },
    { "name": "Paris" },
    { "name": "Berlin" }
  ]
}
```

Will be evaluated to:

```
Cities you've been to: London, Paris, Berlin
```

> Given that the standard builtin functions are available.

### Special calls

Here are some of the special calls that are available in paragraphs:

#### `[p#repeatParagraph]`

```
[p#repeatParagraph [:count] index]
```

Repeats the paragraph the given number of times.

Here's an example:

```
[p#repeatParagraph 10 index]number [:index]
```

Will be evaluated to:

```
number 0
number 1
number 2
number 3
number 4
number 5
number 6
number 7
number 8
number 9
```

> Each lines is a paragraph.

#### That's it for now

### Tables

Tables in docx are quite different from xlsx, It does not have the same uniform
structure as xlsx "tables", or more like sheets. There are multiple ways to
calculate the size of a table, and its quite complicated to bring a single API
to make it work for all table sizes.

Tables in docx will support the following special calls: `r#repeatRow` and
`c#repeatCol` that will work the same way as they do in xlsx.
