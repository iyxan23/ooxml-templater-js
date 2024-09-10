<h1 align=center><pre>ooxml-templater-js</pre></h1>

No-nonsense minimally invasive docx and xlsx templater written in pure
typescript, featuring a functional language.

## Installation

This library is still in the works, I do not have plans of publishing it into a
repository yet. In the meantime, you could use this repo as a git submodule
and then add it as a dependency in your project by path.

## Wait what?

> What does minimally invasive even mean?

This means that the library does as little as it could to the original structure
of the template. It does not parse any style info, page setups, or anything else
that is unrelated to the templating itself (replacing specific text within the
document/sheet).

Think of it as a surgery, it only changes the parts that it needed to change
and minimizes the amount of damage it could do to other parts of the file. This
is due to me not having much experience in parsing ooxml files, where, who knows
it might break something I didn't want to break.

In short, it replaces the texts and duplicates existing text (with its style
data and all).
