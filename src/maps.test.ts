import assert from "node:assert/strict";
import { test } from "node:test";
import { norm, parseRows, placeId, sameName, sameTitle, titleGroup } from "./maps.js";
import { PlanSchema } from "./plan.js";

// Hand-written in the shape of real list-view snapshots (real ones contain the account email).
const SNAPSHOT = `
- heading "Paris" [level=1]
- button "Add a place"
- button "Septime 4.6 stars 2,345 reviews":
  - text: Septime
  - img "4.6 stars"
- textbox "Note": Book 3 weeks ahead
- button "Septime La Cave 4.5 stars":
  - text: Septime La Cave
- button "Add note": Note
- 'button "Le Bistrot: Paul''s 4.4 stars"':
  - text: 'Le Bistrot: Paul''s'
- textbox "Note": 'Ask for: the duck'
- button "Pho 19 Permanently closed"
- button "Add note": Note
- button "Ten Belles 4.3 stars":
  - text: Ten Belles
- textbox "Note"
`;

test("parseRows reads titles, notes and note controls in order", () => {
  assert.deepEqual(parseRows(SNAPSHOT), [
    { title: "Septime", note: "Book 3 weeks ahead", ctrl: "box", nth: 0 },
    { title: "Septime La Cave", note: "", ctrl: "add", nth: 0 },
    { title: "Le Bistrot: Paul's", note: "Ask for: the duck", ctrl: "box", nth: 1 },
    { title: "Pho 19", note: "", ctrl: "add", nth: 1 },
    { title: "Ten Belles", note: "", ctrl: "box", nth: 2 },
  ]);
});

test("parseRows counts a note control even when its row title wasn't recognised", () => {
  const rows = parseRows(`- button "Add note": Note\n- button "A 4.0 stars":\n  - text: A\n- button "Add note": Note`);
  assert.deepEqual(rows, [{ title: "A", note: "", ctrl: "add", nth: 1 }]);
});

test("norm strips diacritics, case and punctuation", () => {
  assert.equal(norm("  Café-Crème, L'Été! "), "cafe creme l ete");
});

test("sameName is a loose containment match", () => {
  assert.ok(sameName("Din Tai Fung", "Din Tai Fung Xinyi"));
  assert.ok(!sameName("", "x"));
});

test("sameTitle needs equality or a word-boundary prefix", () => {
  assert.ok(sameTitle("Septime", "septime"));
  assert.ok(sameTitle("Septime", "Septime La Cave"));
  assert.ok(!sameTitle("Thai", "Thaiful"));
});

test("titleGroup prefers exact titles over prefix matches", () => {
  const rows = ["Septime La Cave", "Septime", "Septime"].map((title) => ({ title }));
  assert.equal(titleGroup(rows, "Septime", (r) => r.title).length, 2);
  assert.deepEqual(titleGroup(rows, "Septime La Cave", (r) => r.title), [rows[0]]);
});

test("titleGroup fallback can't borrow a row that belongs to another plan entry", () => {
  const rows = [{ title: "Ten Belles" }];
  const get = (r: { title: string }) => r.title;
  assert.deepEqual(titleGroup(rows, "Ten Belles Bread", get), rows);
  assert.deepEqual(titleGroup(rows, "Ten Belles Bread", get, ["Ten Belles", "Ten Belles Bread"]), []);
});

test("placeId extracts the feature id", () => {
  assert.equal(placeId("https://www.google.com/maps/place/X/data=!4m2!3m1!1s0x47e6:0xAB12?hl=en"), "0x47e6:0xAB12");
  assert.equal(placeId("https://www.google.com/maps/place/X/"), undefined);
});

test("PlanSchema validates places and lists", () => {
  const place = { name: "A", url: "https://www.google.com/maps/place/A/" };
  const plan = PlanSchema.parse({ version: 1, lists: [{ name: "L", places: [place] }] });
  assert.equal(plan.lists[0]!.ordered, false);
  const bad = (lists: unknown) => assert.ok(!PlanSchema.safeParse({ version: 1, lists }).success);
  bad([{ name: "L", places: [{ name: "A" }] }]); // neither url nor query
  bad([{ name: "L", places: [{ name: "A", url: "https://example.com/maps/place/A" }] }]);
  bad([{ name: "L", places: [place] }, { name: "L", places: [place] }]); // duplicate list name
  bad([{ name: "Where to Eat & Drink in Los Angeles (October 2026)", places: [place] }]); // > 40 chars
  PlanSchema.parse({ version: 1, lists: [{ name: "x".repeat(40), places: [place] }] });
});
