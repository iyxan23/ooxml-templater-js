// Default built-in functions

import { z } from "zod";
import {
  createTemplaterNoArgsFunction,
  callLambda,
  createTemplaterFunction,
} from "./wrapper";
import { isResult, success } from "../../result";

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
const arrayConcat = createTemplaterFunction(
  z.tuple([z.array(z.any()), z.array(z.any())]).rest(z.array(z.any())),
  (a, b, ...others) => success([...a, ...b, ...others.flat()]),
);
const arrayAt = createTemplaterFunction(
  z.tuple([z.array(z.any()), z.coerce.number()]),
  (a, b) => success(a.at(b)),
);
const arraySlice = createTemplaterFunction(
  z.tuple([
    z.array(z.any()),
    z.coerce.number().optional(),
    z.coerce.number().optional(),
  ]),
  (arr, a, b) => success(arr.slice(a, b)),
);
const arrayIndexOf = createTemplaterFunction(
  z.tuple([z.array(z.any()), z.any()]),
  (arr, item) => success(arr.indexOf(item)),
);
const arrayLastIndexOf = createTemplaterFunction(
  z.tuple([z.array(z.any()), z.any()]),
  (arr, item) => success(arr.lastIndexOf(item)),
);
const arrayIncludes = createTemplaterFunction(
  z.tuple([z.array(z.any()), z.any()]),
  (arr, item) => success(arr.includes(item)),
);
const arrayFind = createTemplaterFunction(
  z.tuple([z.array(z.any()), z.string(), z.function()]),
  (arr, idxName, fn) => {
    const callFn = callLambda(fn);
    for (const item of arr) {
      const result = callFn({
        variables: {
          [idxName]: item,
        },
      });

      if (result.status === "failed") return result;
      if (result.result) return success(result.result);
    }
    return success(undefined);
  },
);
const arrayFindIndex = createTemplaterFunction(
  z.tuple([z.array(z.any()), z.string(), z.function()]),
  (arr, idxName, fn) => {
    const callFn = callLambda(fn);
    for (const [idx, item] of arr.entries()) {
      const result = callFn({
        variables: {
          [idxName]: item,
        },
      });

      if (result.status === "failed") return result;
      if (result.result) return success(idx);
    }
    return success(-1);
  },
);
const arrayFindLast = createTemplaterFunction(
  z.tuple([z.array(z.any()), z.string(), z.function()]),
  (arr, idxName, fn) => {
    const callFn = callLambda(fn);
    for (const item of Array.from(arr).reverse()) {
      const result = callFn({
        variables: {
          [idxName]: item,
        },
      });

      if (result.status === "failed") return result;
      if (result.result) return success(result.result);
    }

    return success(undefined);
  },
);
const arrayFindLastIndex = createTemplaterFunction(
  z.tuple([z.array(z.any()), z.string(), z.function()]),
  (arr, idxName, fn) => {
    const callFn = callLambda(fn);
    for (const [idx, item] of Array.from(arr.entries()).reverse()) {
      const result = callFn({
        variables: {
          [idxName]: item,
        },
      });

      if (result.status === "failed") return result;
      if (result.result) return success(idx);
    }

    return success(-1);
  },
);
const arrayReverse = createTemplaterFunction(
  z.tuple([z.array(z.any())]),
  (arr) => success([...arr].reverse()),
);
// todo: make it possible to use z.tuple(..).or() as argument type here
// so we can do z.tuple([z.array(z.any())]).or(z.tuple([z.array(z.any()), z.string(), z.string(), z.function()]))
const arraySort = createTemplaterFunction(z.tuple([z.array(z.any())]), (arr) =>
  success(arr.toSorted()),
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
const power = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number()]),
  (a, b) => success(Math.pow(a, b)),
);
const mod = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number()]),
  (a, b) => success(a % b),
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
const floor = createTemplaterFunction(z.tuple([z.coerce.number()]), (num) =>
  success(Math.floor(num)),
);
const ceil = createTemplaterFunction(z.tuple([z.coerce.number()]), (num) =>
  success(Math.ceil(num)),
);

// == bitwise operations

const bitAnd = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number()]),
  (a, b) => success(a & b),
);
const bitOr = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number()]),
  (a, b) => success(a | b),
);
const bitXor = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number()]),
  (a, b) => success(a ^ b),
);
const bitNot = createTemplaterFunction(z.tuple([z.coerce.number()]), (a) =>
  success(~a),
);
const bitLShift = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number()]),
  (a, b) => success(a << b),
);
const bitRShift = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number()]),
  (a, b) => success(a >> b),
);
const bitURShift = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number()]),
  (a, b) => success(a >>> b),
);

// == boolean operations

const eqStrict = createTemplaterFunction(z.tuple([z.any(), z.any()]), (a, b) =>
  success(a === b),
);
const eqWeak = createTemplaterFunction(z.tuple([z.any(), z.any()]), (a, b) =>
  success(a == b),
);
const neqStrict = createTemplaterFunction(z.tuple([z.any(), z.any()]), (a, b) =>
  success(a !== b),
);
const neqWeak = createTemplaterFunction(z.tuple([z.any(), z.any()]), (a, b) =>
  success(a != b),
);
const not = createTemplaterFunction(z.tuple([z.coerce.boolean()]), (a) =>
  success(!a),
);
const or = createTemplaterFunction(
  z.tuple([z.coerce.boolean(), z.coerce.boolean()]),
  (a, b) => success(a || b),
);
const and = createTemplaterFunction(
  z.tuple([z.coerce.boolean(), z.coerce.boolean()]),
  (a, b) => success(a && b),
);

// == comparison

const gt = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number()]),
  (a, b) => success(a > b),
);
const gte = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number()]),
  (a, b) => success(a >= b),
);
const lt = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number()]),
  (a, b) => success(a < b),
);
const lte = createTemplaterFunction(
  z.tuple([z.coerce.number(), z.coerce.number()]),
  (a, b) => success(a <= b),
);

// == string

const strConcat = createTemplaterFunction(
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
  success(differenceInDays(new Date(1900, 0, 0), startOfDay(date)) + 1),
);
const writeTime = createTemplaterFunction(z.tuple([z.coerce.date()]), (date) =>
  success(differenceInSeconds(startOfDay(date), date) / (60 * 60 * 24)),
);
const formatDate_ = createTemplaterFunction(
  z.tuple([z.coerce.date(), z.string().optional()]),
  (date, format = "yyyy-MM-dd") => success(formatDate(date, format)),
);

// == misc

const undefined_ = createTemplaterNoArgsFunction(() => undefined);
const null_ = createTemplaterNoArgsFunction(() => null);
const call = createTemplaterFunction(
  z.tuple([z.function(), z.any().optional()]),
  (func, ths) => {
    const result = func.call(ths);
    if (isResult(result)) {
      return result;
    } else {
      return success(result);
    }
  },
);
const typeOf = createTemplaterFunction(z.tuple([z.any()]), (a) =>
  success(typeof a),
);

export const builtinFunctions = {
  array,
  arrayEmpty,
  arrayAppend,
  arrayConcat,
  arrayAt,
  arraySlice,
  arrayIndexOf,
  arrayLastIndexOf,
  arrayIncludes,
  arrayFind,
  arrayFindIndex,
  arrayFindLast,
  arrayFindLastIndex,
  arrayReverse,
  arraySort,

  flatten,
  reduce,
  map,
  unique,
  filter,

  length,
  keys,
  values,
  entries,

  bitAnd,
  bitOr,
  bitXor,
  bitNot,
  bitLShift,
  bitRShift,
  bitURShift,

  eqStrict,
  eqWeak,
  neqStrict,
  neqWeak,
  not,
  or,
  and,

  gt,
  gte,
  lt,
  lte,

  add,
  subtract,
  multiply,
  divide,
  mod,
  power,

  floor,
  ceil,
  round,
  sum,

  strConcat,
  join,
  jsonStringify,
  jsonParse,

  if: if_,
  ifUndefined,

  now,
  writeDate,
  writeTime,
  formatDate: formatDate_,

  undefined: undefined_,
  null: null_,
  call,
  typeOf,
};
