// Default built-in functions

import { z } from "zod";
import { callLambda, createTemplaterFunction } from "./templater-function";
import { createTemplaterNoArgsFunction } from "./templater-function";
import { success } from "./expression/result";

import { startOfDay } from "date-fns/fp/startOfDay";
import { differenceInDays } from "date-fns/fp/differenceInDays";
import { differenceInSeconds } from "date-fns/fp/differenceInSeconds";
import { formatDate } from "date-fns/format";

// == array

// usage:
//
//  [array "hello world" "another item" "and so on"]
const array = createTemplaterFunction(z.tuple([]).rest(z.any()), (...rest) =>
  success([...rest]),
);
const arrayEmpty = createTemplaterNoArgsFunction(() => []);
const arrayAppend = createTemplaterFunction(
  z.tuple([z.any().array(), z.any()]),
  (arr, item) => success([...arr, item]),
);
const length = createTemplaterFunction(z.tuple([z.array(z.any())]), (a) =>
  success(a.length),
);
const keys = createTemplaterFunction(z.tuple([z.any()]), (obj) =>
  success(Object.keys(obj)),
);
const values = createTemplaterFunction(z.tuple([z.any()]), (obj) =>
  success(Object.values(obj)),
);
const entries = createTemplaterFunction(z.tuple([z.any()]), (obj) =>
  success(Object.entries(obj)),
);

// == composable functions

const flatten = createTemplaterFunction(
  z.tuple([z.array(z.array(z.any()))]),
  (arr) => success(arr.flat()),
);

// usage:
//
//  [reduce [:array] item acc { [...] } 0]
//          -------  ---- --- --------- -
//          array    |      |   |       L initial value
//                   |      | lambda
// item local variable name | with item
//                          | & acc
// acc local variable name -+
const reduce = createTemplaterFunction(
  z.tuple([
    z.array(z.any()),
    z.string(),
    z.string(),
    z.function(),
    z.any().optional(),
  ]),
  (arr, itemName, accName, fn, init) => {
    let result = init;
    const issues = [];
    const callFn = callLambda(fn);

    for (const item of arr) {
      const callResult = callFn({
        variables: {
          [itemName]: item,
          [accName]: result,
        },
      });

      if (callResult.status === "failed") {
        callResult.issues.push(...issues);
        return callResult;
      }

      issues.push(...callResult.issues);
      result = callResult.result;
    }

    return success(result, issues);
  },
);

// usage:
//
//  [map [:array] item { [...] }]
//       -------- ---- --------
//       array    |           L lambda with item,
//                |             returns mapped item
// item local variable name
const map = createTemplaterFunction(
  z.tuple([z.array(z.any()), z.string(), z.function()]),
  (arr, idxName, fn) => {
    const resultArr = [];
    const issues = [];
    const callFn = callLambda(fn);

    for (const item of arr) {
      const result = callFn({
        variables: {
          [idxName]: item,
        },
      });

      if (result.status === "failed") {
        result.issues.push(...issues);
        return result;
      }

      issues.push(...result.issues);
      resultArr.push(result.result);
    }

    return success(resultArr, issues);
  },
);
const unique = createTemplaterFunction(z.tuple([z.array(z.any())]), (a) =>
  success([...new Set(a)]),
);

// usage:
//
//  [filter [:array] item { [...] }]
//          -------- ---- --------
//          array    |    L lambda with item,
//                   |      returns boolean
// item local variable name
const filter = createTemplaterFunction(
  z.tuple([z.array(z.any()), z.string(), z.function()]),
  (arr, idxName, fn) => {
    const resultArr = [];
    const issues = [];
    const callFn = callLambda(fn);

    for (const item of arr) {
      const result = callFn({
        variables: {
          [idxName]: item,
        },
      });

      if (result.status === "failed") {
        result.issues.push(...issues);
        return result;
      }

      issues.push(...result.issues);
      if (result.result) resultArr.push(item);
    }

    return success(resultArr, issues);
  },
);

// == arithmetic

const add = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number()]),
  (a, b) => success(a + b),
);
const subtract = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number()]),
  (a, b) => success(a - b),
);
const multiply = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number()]),
  (a, b) => success(a * b),
);
const divide = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number()]),
  (a, b) => success(a / b),
);
const round = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number().optional()]),
  (num, round) =>
    success(
      round ? Math.round(num * (round * 10)) / (round * 10) : Math.round(num),
    ),
);
const sum = createTemplaterFunction(
  z.tuple([]).rest(z.coerce.number()),
  (...nums) => success(nums.reduce((a, b) => a + b, 0)),
);

// == string

const concat = createTemplaterFunction(
  z.tuple([z.coerce.string(), z.coerce.string()]),
  (a, b) => success(a + b),
);
const join = createTemplaterFunction(
  z.tuple([z.array(z.string()), z.string().optional()]),
  (arr, sep = "") => success(arr.join(sep)),
);
const jsonStringify = createTemplaterFunction(z.tuple([z.any()]), (a) =>
  success(JSON.stringify(a)),
);
const jsonParse = createTemplaterFunction(z.tuple([z.string()]), (a) =>
  success(JSON.parse(a)),
);

// == conditionals

const if_ = createTemplaterFunction(
  z.tuple([z.coerce.boolean(), z.any(), z.any()]),
  (condition, ifTrue, ifFalse) => (condition ? ifTrue : ifFalse),
);
const ifUndefined = createTemplaterFunction(
  z.tuple([z.any(), z.string()]),
  (a, b) => (a === undefined ? success(b) : success(a)),
);

// == working with date and times

const now = createTemplaterNoArgsFunction(() => success(new Date()));
const writeDate = createTemplaterFunction(z.tuple([z.coerce.date()]), (date) =>
  success(differenceInDays(new Date(1900, 0, 0), startOfDay(date))),
);
const writeTime = createTemplaterFunction(z.tuple([z.coerce.date()]), (date) =>
  success(differenceInSeconds(startOfDay(date), date) / (60 * 60 * 24)),
);
const formatDate_ = createTemplaterFunction(
  z.tuple([z.coerce.date(), z.string().optional()]),
  (date, format = "yyyy-MM-dd") => success(formatDate(date, format)),
);

export const builtinFunctions = {
  array,
  arrayEmpty,
  arrayAppend,
  flatten,
  reduce,
  map,
  unique,
  filter,

  length,
  keys,
  values,
  entries,

  add,
  subtract,
  multiply,
  divide,
  round,
  sum,

  concat,
  join,
  jsonStringify,
  jsonParse,

  if: if_,
  ifUndefined,

  now,
  writeDate,
  writeTime,
  formatDate: formatDate_,
};
