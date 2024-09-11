## How it works

There are multiple stages of interpreting expressions in a sheet:

### Parsing

Scans through each cells in the sheet and separate freeform text from
expressions. very straightforward.

### Extraction

Takes away any `[hoist ident [val]]` expressions from the sheet. As the name
implies, "hoist", this part hoists the variables from the sheet to be executed
before the expressions in this sheet.

This extraction part also extracts blocks (`[#repeatRow] ... [/#repeatRow]`)
from the sheet. It returns useful infromation about blocks that will be
executed right after the hoisted variables are defined.

### Hoisted Variable Execution

Executes the expressions that were hoisted in the sheet, taken from the
previous step.

### Block Expansion

Expands (clones) the expressions that are wrapped inside blocks right before
expressions are expanded or "filled" in the sheet.

This also creates local variables inside each cells that were expanded. e.g. if
you define an index variable with `[#repeatRow [length [:list]] myIdx]` (the
`myIdx` part), it will be included as a local variable inside each cells that
were cloned as a result of the block expansion.

### Execution

Executes, expands or fills every expressions in the sheet.
