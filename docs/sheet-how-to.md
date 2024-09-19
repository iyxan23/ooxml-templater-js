# "Programming Language"?

This is a "programming language" that I have developed to make the templating
process much more flexible, and easier to be customized.

It's inspired and modeled from how functional programming languages work.
Essentially, everything that you write is a form of expression. And that
expression will be evaluated. Just like:

```
y = f(x)
```

With enough functions (and the ability to define your own functions),
templating sheets will be much easier and deterministic. If you give it the
same input data, it will always return the same output.

## Expressions

Let's understand expressions first. It's "something" that can be evaluated.
Pretty simple, expressions are represented by anything surrounded by `[]`.

The code below is a form of expression that will evaluate to the value of a
variable named "helloWorld":

```
[:helloWorld]
```

If we provide an input object of:

```json
{ "helloWorld": "Hello!" }
```

The evaluation result will be:

```
Hello!
```

### With static text

Since this is technically a templating engine, you can mix in static text with
expressions like so:

```
Hello, welcome [:name]! I hope you have a nice stay at [:place].
```

If we provide an input object of:

```json
{ "name": "Bill", "place": "the beach" }
```

The evaluation result will be:

```
Hello, welcome Bill! I hope you have a nice stay at the beach.
```

### Arguments

Expressions can also take arguments! Just specify them after the identifier
itself, separated by spaces. You can also use double quotes `""` to be able to
have spaces as arguments. Here's an example of calling a function `add` with
the two arguments:

```
[add 10 3]
```

If we have the function `add` properly defined (it is a default builtin
function), when evaluated, it will return `13`.

Here's a big note: arguments are treated as strings, you can use any weird
symbols or even numbers, and they will always be treated as strings:

```
[concat *@^#&*)@^# @*&#%&(*#!#]
```

As long as you dont use the character `[]`, it will be treated as a regular
string by the parser. But if you do need to have a `[]` as an argument (and
spaces), you can do that by using double quotes:

```
[concat "eating burger king for my entire life" "[GONE WRONG]"]
```

> [!IMPORTANT]
> Important for developers that wants to define their own functions: it's
> important to know that arguments that are written by the user are always
> treated as strings. If you need to pass in a number, please also allow
> strings to be coerced into numbers, just like how `z.coerce.number()` works.

### Types of expressions

There are essentially 5 different types of expressions:

- Variable definitions

  ```
  [hoist hello "whats up?"]
  ```

- Variable access

  ```
  [:helloWorld]
  ```

- Function calls

  ```
  [add 5 10]
  ```

- Lambdas

  ```
  { [add 5 10] }
  ```

- Blocks

  ```
  [#repeatRow 5 idx] ... [/#repeatRow]
  ```

Let's take a look at how they work!

## Variable access

Just like the example that I had explained on the expressions section,
a variable access expression is an expression that starts with `:`, followed
by the variable name.

Here's an example that takes a variable named "helloWorld":

```
[:helloWorld]
```

And with an input object of:

```json
{ "helloWorld": "Hello!" }
```

The expression will evaluate to:

```
Hello!
```

### Accessing properties

You are also able to access a variable's properties by specifying the arguments
of this variable access call. Like so:

```
[:student fullName]
```

If you have the input object to be:

```json
{ "student": { "fullName": "iyxan", "age": 100, "isCool": true } }
```

It will evaluate to:

```
iyxan
```

You can also use evaluation result of expressions as arguments!

```
[hoist number 1] <- defining a variable via hoist, you can also use values from the input object
[:students [add [:number] 5] fullName]
```

Step-by-step, it will evaluate to:

```
[:students [add 1 5] fullName]
```

The `add` function will be evaluated to be:

```
[:students 6 fullName]
```

And it will get the 6th item of the `students` variable array, and take its
`fullName`. In javascript, you would write this to be something like:

```javascript
students[add(1, 5)].fullName;
```

## Variable definition

Variable definition is an expression that starts with `hoist`, followed by
the variable name and the value as an expression:

```
[hoist name iyxan]
```

You can then reference the variable `name` accross the whole sheet:

```
Hello, [:name]!
```

Every variable definitions are evaluated before the entire expression sheet is
evaluated, so you can place `[hoist ..]` expressions anywhere in your sheet,
and be able to reference it even before it:

```
Hello, [:name]!
------------------
[hoist name iyxan]
```

> [!NOTE]
> Why is it named `hoist`?
>
> Well I was inspired by how the javascript `var` keyword works. People often
> call them as "hoisting", because during execution, it declares the variable
> in the global scope, and will then be defined when that statement is ran.
>
> This reflects exactly how I wanted the variable definition to work in this
> language. It is "hoisted", and evaluated at an earlier stage before all the
> expressions in the sheet (and blocks) be evaluated.
>
> I'm planning to make an alias `var` to make it easier to understand.

## Function calls

Function calls are an expression that starts with `[`, followed by the
function name and the arguments as expressions:

```
[add 5 10]
```

You can nest function calls as arguments as such:

```
[concat "hello " [concat [:name] and [:otherName]] "!"]
```

Pretty simple, right?

### Making your own functions!

Here comes the cool part.

You can also define your own functions by using the APIs you use that uses
this "sheet language". Here is an example of how you could define your own
function with `xlsxFillTemplate` from `ooxml-templater/xlsx`:

```ts
import { createTemplaterFunction } from "ooxml-templater/sheet/custom";

const add = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number()]),
  (a, b) => success(a + b),
);

void xlsxFillTemplate(file.stream(), output, {
  functions: { add },
});
```

> [!NOTE]
> Currently I have not exposed the helper APIs (`createTemplaterFunction`) to
> better define them yet.

I will be writing on another doc about how to define your own functions. And,
as a fun fact, [here is the code](https://github.com/iyxan/ooxml-templater/blob/main/src/sheet/functions.ts)
that defines every built-in functions that can be used right away in this
language. You can clone, modify the functions there, and make your own build
of `ooxml-templater-js` to use them as a built-in function.

## Lambdas

Lambda is a tricky subject to cover. It's essentially an anonymous function
that can be passed into functions that needs them as an argument. It's
important to note that you cannot just pass lambdas to template:

❌you cannot do this

```
Hello [{ [concat iyxan and who] }]
```

It's supposed to be passed as arguments into functions that need them. E.g. a
map function (a built-in function btw):

```
[map [:numbers] number { [multiply [:number] 10] }]
```

Here's how the function above looks like in javascript:

```javascript
numbers.map((number) => multiply(number, 10));
```

The map function will be evaluated to be an array of numbers. Since it's not a
good idea to return arrays, we could make use of the `sum` function to sum all
the numbers within the array that was returned by `map`:

```
[sum [map [:numbers] number { [multiply [:number] 10] }]]
```

If we have an input object of:

```json
{ "numbers": [1, 2, 3, 4, 5] }
```

The expression will evaluate to:

```
15
```

### Local Variables inside Lambdas

Note how we have to pass an argument named `number` into the map function:

```
[map [:numbers] number { [multiply [:number] 10] }]
                ------
```

The string `number` is treated as a regular string argument to map. And in the
function `map`, it is used to define the name of a local variable inside the
lambda that we passed on the next argument.

```
[map [:numbers] number { [multiply [:number] 10] }]
                ------              -------
          defined here              use it inside the lambda
```

This is **purely** a behavior of how the builtin `map` function works. You can
check it's source [here](todo).

For function implementors, you can define any local variable you want inside a
lambda. Even if the user doesn't need to pass any arguments about what the
local variable name will be. But it is good practice to make the local variable
be named as how the user wished, as to not clash with any existing global
variables / input object keys.

## Blocks

Blocks are an expression that starts with `[#...`, followed by the name of the
block, then ended with an expression that starts with `[/#...`. Using blocks is
a method of grouping certain cells to do certain things with them.

Currently, there are only `repeatRow` and `repeatCol` blocks that clones a row
or a column multiple times according to a `count` argument. They are currently
uncustomizable, but I have an intention to make it customizable in the future.

Here is an example of a `repeatRow` block:

| 1                    | 2        | 3               |
| -------------------- | -------- | --------------- |
| `[#repeatRow 5 idx]` | `[:idx]` | `[/#repeatRow]` |

The sheet above will be expanded to be:

| 1   | 2        | 3   | Row Variables |
| --- | -------- | --- | ------------- |
|     | `[:idx]` |     | idx = 0       |
|     | `[:idx]` |     | idx = 1       |
|     | `[:idx]` |     | idx = 2       |
|     | `[:idx]` |     | idx = 3       |

And finally evaluated to be:

| 1   | 2   | 3   |
| --- | --- | --- |
|     | `0` |     |
|     | `1` |     |
|     | `2` |     |
|     | `3` |     |

Essentially, a `repeatRow` block will clone a row and repeat it according to
the evaluation result you placed on the first parameter. it will also define a
local variable on each row that where you can know the index of that row.

```
[#repeatRow [sum [:myArray]] row]
            ---------------- ---
      how much to repeat     local variable name
```

The `repeatCol` block also does the same thing, the obvious difference is that
it repeats columns rather than rows.

Here is an example of a `repeatCol` block:

| 1                    |
| -------------------- |
| `[#repeatCol 5 idx]` |
| `[:idx]`             |
