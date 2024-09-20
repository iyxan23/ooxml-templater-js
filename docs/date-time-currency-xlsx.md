## Using Date, Time and Currency

I have encountered this issue where I need to add currency, date and times
inside cells that should be templated in xlsx files.

But before doing this, let me explain about how xlsx treats cells as currency,
time or date. There is this thing named "formatting", and that formatting data
is stored separately from the sheet xml itself that is modified by this
library.

By using this library, your formatting is 100% safe and untouched. But this
also makes us unable to set custom formatting with this method of templating.

A simple solution to this is to format the cells as currency or time or date or
anything else that you want a cell to be formatted to be, with the templating
syntax inside. It wouldn't affect anything, but it will make the resulting
number to be formatted correclty.

For currencies, in simple steps:

- Write your template
- In any case you want the cell to be formatted as a currency, format it as
  such, even if the text is not a number, yet (but it will be after being
  templated by this library).
- Profit??

Date and times are slightly different and will need an extra function to
convert native javascript `Date`s into numbers that is compatible with xlsx's
date and time formatting.

To convert a javascript `Date` into excel compatible date
([1900 date system](https://support.microsoft.com/en-us/office/date-systems-in-excel-e7fe7167-48a9-4b96-bb53-5612a800b487)),
you can use the builtin function `writeDate` (but also make sure to format the
cell as date as well):

```
[writeDate [now]]
```

Note that this will strip away any information regarding time.

> [!INFO]
> `now` is also a builtin function that simply returns a `new Date()`.

To convert a javascript `Date` into excel compatible time, you can use the
builtin function `writeTime`:

```
[writeTime [now]]
```

Note that this will strip away any information regarding date.
