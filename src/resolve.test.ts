import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCandidates, placeUrl, searchUrl } from "./resolve.js";

// Hand-trimmed in the shape of a real /search?tbm=map response.
const RESPONSE = String.raw`)]}'
[["q",[[null,["3040 E Olympic Blvd"],[null,null,34.02,-118.21],"0x80c2c8b16c055ecb:0xbe1bda5a509624c9","Mariscos Jalisco",null,["Taco restaurant"],"Boyle Heights",null,"Mariscos Jalisco, 3040 E Olympic Blvd, Los Angeles, CA 90023, United States"],
["0x0:0xbe1bda5a509624c9"],
[null,"0x80c2c8b16c055ecb:0xbe1bda5a509624c9","Mariscos Jalisco"],
[null,"0x80c2bb7f17ffa3ff:0xf291764513875402","Saffron & Rose Ice Cream",null,"Saffron & Rose Ice Cream, 1387 Westwood Blvd, Los Angeles, CA 90024, United States"],
[null,"0x80c2c7b2d549c8b5:0xb1248293d0cf8a93","Nick + Stef's Steakhouse",null]]]]`;

test("parseCandidates: one entry per feature id, decoded names, address without the name", () => {
  const c = parseCandidates(RESPONSE);
  assert.deepEqual(c.map((x) => x.name), ["Mariscos Jalisco", "Saffron & Rose Ice Cream", "Nick + Stef's Steakhouse"]);
  assert.equal(c[0]!.address, "3040 E Olympic Blvd, Los Angeles, CA 90023, United States");
  assert.equal(c[1]!.address, "1387 Westwood Blvd, Los Angeles, CA 90024, United States");
  assert.equal(c[2]!.address, "");
});

test("placeUrl builds a /maps/place/ link the plan schema accepts", () => {
  assert.equal(
    placeUrl("Saffron & Rose", "0x1:0x2"),
    "https://www.google.com/maps/place/Saffron+%26+Rose/data=!4m2!3m1!1s0x1:0x2",
  );
});

test("searchUrl asks Maps in the chosen language, English by default", () => {
  assert.equal(searchUrl("Кофемания Москва"), `https://www.google.com/maps/search/?api=1&hl=en&query=${encodeURIComponent("Кофемания Москва")}`);
  assert.ok(searchUrl("Кофемания Москва", "ru").includes("&hl=ru&"));
});
