## Richer Error

Templating is not always an error-free process, this library must be able to
produce error that can be understood from a developer's perspective, and
perhaps the user's perspective as well.

I think the `Issue` type should be filled with richer types that can store call
traces with the arguments to make it easier to figure out where the problem
actually is.

Since it's a functional language, we can't just provide a function to log or
anything, the user/dev must know the expression values while it is being
evaluated, top-down.

Here's what I'm imagining would be the end result:

```
Error occured during evaluating {variable,cell,block argument}.

Trace:
 - `unique` call, args:
   - [0]: "some value"
   - [1]: "other values"
   - [2]: `map` call, args:
     - [0]: ["value", "value", ...]
     - [1]: v
     - [2]: 2nd lambda call:
       - not sure what to put here
```

ideas appreciated.

## Debugging

Since we may make mistakes whilst writing templates, it may as well be quite a
saver when we can debug and inspect what functions returned when we evaluate
the template.

The ability to see expanded blocks would be really great as well.

An intial data of mine is to have an expression like this:

```
[$inspect map]
```

This expression will make the templater to output every instances of the
function `map` being called in the template, with their arguments, and debug
info. The debug data will probably be printed similar to how issues will be
printed (placed at the end of the sheet).

Let's have a convention where functions starting with `$` is an "internal
function" that can change the behavior of the templater.

Because the `map` function could be called anywhere in the template, I think
it's better to add labeling where we can specify which `map` calls we wanted
to inspect on.

```
[$inspect map@helloLabel]

// somewhere else
[map@helloLabel [:array] item { [...] }]
```
