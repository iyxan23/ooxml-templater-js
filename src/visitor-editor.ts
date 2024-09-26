/** ## Visitor API
 *
 * An API that is originally made to be used as a base for the templating
 * engine, but ended up being kind of a mess.
 *
 * > Planning to use something similar to python's elementtree API instead.
 * > Which actually exists as a package in npm, but it looks terribly old, and
 * > I think I should write my own.
 *
 * The idea is that you can register visitors for each object type, and they
 * will be called before and after the object is visited. The visitors can
 * modify the object, and they can also return a new object to replace the
 * original one.
 *
 * It's also able to return a context object, which will be passed to the next
 * visitors (that are visiting children of the object where the context was
 * returned).
 */

// @internal
export type Visitors = {
  before: {
    [key: string]: ((
      doc: any,
      path: string[],
      parentCtx?: any,
    ) => { newObj?: any; childCtx?: any } | void)[];
  };
  after: {
    [key: string]: ((
      doc: any,
      path: string[],
      parentCtx?: any,
    ) => { newObj?: any; childCtx?: any } | void)[];
  };
};

// @internal
export async function startVisiting(
  doc: any,
  visitors: Visitors,
): Promise<any> {
  return visitObject([], "<root>", doc, visitors, undefined);
}

function visitObject(
  path: string[],
  key: string,
  obj: any,
  visitors: Visitors,
  parentCtx: any,
): Promise<any> {
  let theObj = obj;
  let thisCtx = parentCtx;

  if (visitors.before[key]) {
    console.log(`\nBEFORE visiting ${path.join("/")}/${key}`);
    console.log("  str: " + JSON.stringify(obj));

    for (const visitor of visitors.before[key]) {
      const result = visitor(theObj, [...path], thisCtx);

      if (result) {
        if (result.newObj) {
          Object.assign(theObj, result.newObj);
        }

        if (result.childCtx) {
          thisCtx = result.childCtx;
        }
      }
    }

    if (theObj === obj) {
      console.log("  no changes");
    }
  }

  for (const [k, v] of Object.entries(theObj)) {
    if (typeof v === "object") {
      theObj[k] = visitObject([...path, k], k, v, visitors, thisCtx);
    }
  }

  if (visitors.after[key]) {
    console.log(`\nAFTER visiting ${path.join("/")}/${key}`);
    console.log("  str: " + JSON.stringify(obj));

    for (const visitor of visitors.after[key]) {
      const result = visitor(theObj, [...path], thisCtx);

      if (result) {
        if (result.newObj) {
          Object.assign(theObj, result.newObj);
        }

        if (result.childCtx) {
          thisCtx = result.childCtx;
        }
      }
    }

    if (theObj === obj) {
      console.log("  no changes");
    }

    console.log("  end: " + JSON.stringify(theObj));
    console.log();
  }

  return theObj;
}
