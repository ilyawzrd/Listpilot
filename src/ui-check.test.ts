import assert from "node:assert/strict";
import { test } from "node:test";
import { PlanSchema } from "./plan.js";
import { FIXTURE_PLAN, scrub, snapshotDiff } from "./ui-check.js";

test("ui-check fixture is a valid plan for a zz- list", () => {
  const plan = PlanSchema.parse(FIXTURE_PLAN);
  assert.ok(plan.lists[0]!.name.startsWith("zz-"));
});

test("scrub drops the account button, keeps the rest", () => {
  const snap = ['- button "Menu"', '- button "Google Account: Ana B (ana.b@gmail.com)":', "  - img", '- heading "Tartine" [level=1]'].join("\n");
  assert.equal(scrub(snap), ['- button "Menu"', "  - img", '- heading "Tartine" [level=1]'].join("\n"));
});

test("snapshotDiff names the renamed label and ignores numbers and free text", () => {
  const before = ['- region "Actions for Tartine":', '  - button "Save"', '  - button "4.6 stars 2,345 reviews"', "  - text: Open until 5 PM"].join("\n");
  const after = ['- region "Actions for Tartine":', '  - button "Keep"', '  - button "4.7 stars 2,351 reviews"', "  - text: Closes soon"].join("\n");
  assert.deepEqual(snapshotDiff(before, after), { gone: ['button "Save"'], added: ['button "Keep"'] });
});
