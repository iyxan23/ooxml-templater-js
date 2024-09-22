## DRY-ing the expression code

Currently the sole purpose of the custom templating syntax is only for
sheet-based documents (xlsx). But I am planning to use the same expression and
system for other office documents (docx and pptx, if possible). As I do not
have to write another parser and evaluator for each. This reduces the
maintenance burden, and eases the user experience so they would only need to
understand one expression to 

## Blocks are determined separately from the parser

Currently, `startBlock` and `endBlock` are their own expression types (and I
purposely hardcoded the code to only parse repeatRow and repeatCol). Which
does make sense as it was only intended to be used in a 2D sheet context.

But moving forwards to getting this custom syntax to be able to be reused in
other documents (which all have different structures). I feel like it makes
more sense for the parser-side to generalise "blocks", and treat them as just
regular call expressions.

Then let the extraction work done on the side of the xlsx side rather than in
the expression side. So that we could also make use of the expression parser/
evaluator for other things than just xlsx.

## More generalised block, "special calls"

Let's reuse the `#` from the previous idea, and use an additional identifier on
the front:

```
[r#repeat] // replacement of [#repeatRow]
[c#repeat] // replacement of [#repeatCol]
```

This way, we can also write a system that could parse certain special calls
with certain "special identifier". Like, every special blocks with `r#` will be
treated parsing a whole row, and vice versa for `c#`.
