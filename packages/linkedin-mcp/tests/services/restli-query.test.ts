// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Rest.li 2.0 query encoding, pinned to LinkedIn's OWN test vectors.
 *
 * The expected strings below are copied verbatim from LinkedIn's official
 * client libraries rather than written by hand, so this suite asserts agreement
 * with the vendor's encoder, not with our reading of the protocol:
 *
 * - linkedin-developers/linkedin-api-js-client @ e4a1fae,
 *   tests/utils/encoder.test.ts (`expected.paramEncode`, `expected.encode`)
 * - linkedin-developers/linkedin-api-python-client @ 6331e52,
 *   tests/clients/restli/utils/encoder_test.py and
 *   tests/clients/restli/client_test.py
 */

import { describe, expect, it } from "vitest";
import { encodeRestliQuery, encodeRestliValue } from "../../src/services/linkedin/restli-query.js";

// Verbatim from linkedin-api-js-client tests/utils/encoder.test.ts.
const jsClientExample = {
  k1: "v1",
  k2: "value with spaces",
  k3: [1, 2, 3],
  k4: "List(value:with%reserved,chars,'')",
  k5: {
    k51: "v51",
    k52: "v52",
  },
  k6: ["(v1,2)", "(v2,2)"],
  "dangerous('),:key:": "value",
  emptystring: "",
  querystringbreaker1: "?key=value",
  querystringbreaker2: "&key=value&",
  boom: null,
  boom2: undefined,
  true: true,
  false: false,
  multibyte: "株式会社",
  株式会社: "multibytekey",
  "": "emptystringkey",
  emptyList: [],
  emptyListString: [""],
};

describe("encodeRestliQuery / encodeRestliValue", () => {
  it("matches linkedin-api-js-client's paramEncode test vector byte for byte", () => {
    expect(encodeRestliQuery(jsClientExample)).toBe(
      "k1=v1&k2=value%20with%20spaces&k3=List(1,2,3)&k4=List%28value%3Awith%25reserved%2Cchars%2C%27%27%29&k5=(k51:v51,k52:v52)&k6=List(%28v1%2C2%29,%28v2%2C2%29)&dangerous%28%27%29%2C%3Akey%3A=value&emptystring=''&querystringbreaker1=%3Fkey%3Dvalue&querystringbreaker2=%26key%3Dvalue%26&boom=null&true=true&false=false&multibyte=%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE&%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE=multibytekey&''=emptystringkey&emptyList=List()&emptyListString=List('')"
    );
  });

  it("matches linkedin-api-js-client's encode test vector for a record", () => {
    expect(encodeRestliValue(jsClientExample)).toBe(
      "(k1:v1,k2:value%20with%20spaces,k3:List(1,2,3),k4:List%28value%3Awith%25reserved%2Cchars%2C%27%27%29,k5:(k51:v51,k52:v52),k6:List(%28v1%2C2%29,%28v2%2C2%29),dangerous%28%27%29%2C%3Akey%3A:value,emptystring:'',querystringbreaker1:%3Fkey%3Dvalue,querystringbreaker2:%26key%3Dvalue%26,boom:null,true:true,false:false,multibyte:%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE,%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE:multibytekey,'':emptystringkey,emptyList:List(),emptyListString:List(''))"
    );
  });

  it("matches linkedin-api-python-client's URN-in-record and nested-list vectors", () => {
    expect(
      encodeRestliValue({ k1: "v1", k2: "urn:li:app:123", k3: [1, 2], k4: { k41: "foobar" } })
    ).toBe("(k1:v1,k2:urn%3Ali%3Aapp%3A123,k3:List(1,2),k4:(k41:foobar))");
    expect(
      encodeRestliQuery({
        param1: [{ k1: "v1" }, ["e1", "e2"]],
        param2: { k2: { k21: "v21" }, k3: ["v3"] },
      })
    ).toBe("param1=List((k1:v1),List(e1,e2))&param2=(k2:(k21:v21),k3:List(v3))");
    expect(
      encodeRestliQuery({
        q: "search",
        search: { ids: { values: ["urn:li:entity:123", "urn:li:entity:456"] } },
      })
    ).toBe("q=search&search=(ids:(values:List(urn%3Ali%3Aentity%3A123,urn%3Ali%3Aentity%3A456)))");
  });

  it("writes the `fields` projection in comma-separated form, last, as both clients do", () => {
    // python client_test: {"param1": [1, 2, 3], "fields": "id,firstName"}
    //   -> "/me?param1=List(1,2,3)&fields=id,firstName"
    expect(encodeRestliQuery({ fields: "id,firstName", param1: [1, 2, 3] })).toBe(
      "param1=List(1,2,3)&fields=id,firstName"
    );
  });

  it("cannot be used to inject extra query parameters through `fields`", () => {
    expect(encodeRestliQuery({ q: "analytics", fields: "impressions&q=other" })).toBe(
      "q=analytics&fields=impressions%26q%3Dother"
    );
  });
});
