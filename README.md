<img src="./.github/ooxml-templater-js.png" />

<h1 align=center><pre>ooxml-templater-js</pre></h1>

[![Main Branch Build & Test](https://github.com/iyxan23/ooxml-templater-js/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/iyxan23/ooxml-templater-js/actions/workflows/build-and-test.yml)
[![Staging Branch Build & Test (also deployment)](https://github.com/iyxan23/ooxml-templater-js/actions/workflows/deploy.yml/badge.svg?branch=staging)](https://github.com/iyxan23/ooxml-templater-js/actions/workflows/deploy.yml)

Template within your docs, and xlsx files.

## What is this?

A library for templating within your docx and xlsx files (.pptx unplanned). It
works by modifying the xml files in place without touching anything unrelated.

It works on browsers and Node.js. See it live on [the site](https://iyxan23.github.io/ooxml-templater-js).

There is a custom-developed language for working with sheets inspired by
functional programming, making it deterministic, robust, and extremely
composable. It's also possible to define your own functions, for extra
customizability.

[Read more about the custom templating syntax here.](./docs/template-syntax.md)

## Getting Started

Check this [doc for more info](docs/getting-started.md). You can also try it out
on the live astro-powered demo [here](https://iyxan23.github.io/ooxml-templater-js/).
