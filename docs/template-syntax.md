# Templating Syntax

This is a templating syntax that I have developed to make the templating
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

It's also important to know that this templating syntax will be used across
multiple file formats. They will still retain the same syntax and behavior,
except for **special calls**, which will be drastically different across
different file formats.

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

### Spreading Arguments

Sometimes, when you have an array and you need to spread it as its own separate
arguments. Let's say we have a function that returns an array of numbers, and
we need to sum them together with the sum function. But the problem is that the
sum function (its a builtin function) takes multiple arguments, not a single
array. Like so:

```
[sum 1 2 3 4 5]
```

We can make use of the spread operator `...` before the argument expression to
make it spread the array as each different arguments.

```
[sum ...[array 1 2 3 4 5]]
```

The experssion above will be interpreted as:

```
[sum 1 2 3 4 5]
```

### Types of expressions

There are essentially 4 different types of expressions:

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

- Special Calls

  ```
  [r#repeatRow 5 idx] ... [/r#repeatRow]
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
as a fun fact, [here is the code](https://github.com/iyxan/ooxml-templater/blob/main/src/expression/function/builtin.ts)
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

## Special Calls

Special calls are expressions that has a special character `#` which splits
a call function identifier into two parts: code and the identifier itself.

```
  #
  |          --- arguments
[r#repeatRow ...]
 | ---------
 |  L identifier
 |
 L code
```

It also has a closing variant that is indicated by the character `/` at the
start of the identifier (given that the special call supports it):

```
[/r#repeatRow]
```

Special calls are simply labels. They are not evaluated by the engine, but they
are used to define what the caller should do before every expressions are
evaluated. e.g. in xlsx, we have special calls named `r#repeatRow` and
`c#repeatCol` that are used to define how the row and column should be cloned
and repeated.

This process is what I call as "extraction", as it "extracts" information about
special calls from a "source", then collects them together, to be interpreted
or used by the caller.

On the previous case, the xlsx API collects `r#repeatRow` and `c#repeatCol`
(and variable definitions) special calls, which are then evaluated right (and
duplicated) before the whole sheet is evaluated.

### The code

The code of a special call defines how a special call is processed, they are
implemented differently across different callers (xlsx and docx). It also
doesn't have to be one character long, it can be multiple characters long. But
for the sake of brevity, it's recommended to keep it to one character.

#### The code `r` and `c`

For example, the code `r` in xlsx is used to define a special call that will
process a block of row. Which explains why `repeatRow` will fall under this
code. The `repeatRow` special call uses the code `r` so that it is able to
process a block of row, from column X to column Y. This also works the same way
for `c` in xlsx.

I have a plan to make another special call that allows for looping over an
array instead of repeating for a number of times. Perhaps the name would be
`forEachRow`, which will also fall under the code `r`: `[r#forEachRow ...]`.

#### The code `g`

The code `g` is used to define a special call that does not use a closing
special call. The character `g` came from the word "global".

One special call that falls under this code is the `var` special call. It is
used to define a variable that can be used in the rest of the sheet, which is
why it falls under the code `g` (global).

Here is an example of a `var` block:

```
[g#var name "iyxan"]
```

### xlsx-specific special calls

Here are some special calls that are specific to xlsx:

#### `repeatRow`

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

#### `repeatCol`

Here is an example of a `repeatCol` block:

| 1                    |
| -------------------- |
| `[#repeatCol 5 idx]` |
| `[:idx]`             |
| `[/#repeatCol]`      |

The sheet above will be expanded to be:

| 1        | 2        | 3        | 4        | 5        |
| -------- | -------- | -------- | -------- | -------- |
|          |          |          |          |          |
| `[:idx]` | `[:idx]` | `[:idx]` | `[:idx]` | `[:idx]` |
|          |          |          |          |          |

> With each columns storing a local variable `idx` depending on the column

And finally evaluated to be:

| 1   | 2   | 3   | 4   | 5   |
| --- | --- | --- | --- | --- |
|     |     |     |     |     |
| `0` | `1` | `2` | `3` | `4` |
|     |     |     |     |     |

### Mixing multiple blocks

For more complex use cases, it is also possible to combine special calls
together in an intersection, or be nested in a union.

## Trying it out

Learning by practice is way better. I've prepared some samples you can check out
on the [samples/](/samples) directory and try them out in the [live demo](https://iyxan23.github.io/ooxml-templater-js/).
