export type Visitors = {
  before: {
    [key: string]: ((
      doc: any,
      parentCtx?: any,
    ) => { newObj?: any; childCtx?: any } | void)[];
  };
  after: {
    [key: string]: ((
      doc: any,
      parentCtx?: any,
    ) => { newObj?: any; childCtx?: any } | void)[];
  };
};

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
      const result = visitor(theObj, thisCtx);

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
      const result = visitor(theObj, thisCtx);

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
