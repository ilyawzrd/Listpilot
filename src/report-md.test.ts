import assert from "node:assert/strict";
import { test } from "node:test";
import { reportMarkdown, type ReportEntry } from "./report-md.js";

const base: ReportEntry = {
  list: "zz-test", created: false, added: [], alreadyPresent: ["Tartine Bakery"], notesWritten: [],
  notesSkipped: ["Tartine Bakery"], unresolved: [], failed: [],
  verify: { ok: true, missing: [], notesMissing: [] }, warnings: [],
};

test("reportMarkdown: heading, table, verify, skipped note, link", () => {
  const md = reportMarkdown(base, "https://maps/x");
  assert.ok(md.startsWith("## ✅ Saved — zz-test · existing list\n"));
  assert.ok(md.includes("| Added | Already in list | Notes written | Not found | Failed |"));
  assert.ok(md.includes("| 0 | 1 | 0 | 0 | 0 |"));
  assert.ok(md.includes("**Verify:** ✅ every place and note found after a hard reload"));
  assert.ok(md.includes("**Note not added:** Tartine Bakery (the existing note already says it)"));
  assert.ok(md.includes("📍 [Open zz-test in Google Maps](https://maps/x)"));
  assert.ok(!md.includes("\n**Verify") || md.includes("\n\n**Verify")); // blank line before each line
});

test("reportMarkdown: problems change the icon; no link without a url; Russian", () => {
  const warn = reportMarkdown({ ...base, unresolved: [{ name: "El Granjero", reason: "no match" }] }, undefined);
  assert.ok(warn.startsWith("## ⚠️ "));
  assert.ok(warn.includes("**Not found:** El Granjero (no match)"));
  assert.ok(!warn.includes("📍"));
  const failed = reportMarkdown({ ...base, failed: [{ name: "X", reason: "crashed" }], verify: { ok: false, missing: ["X"], notesMissing: [] } }, undefined);
  assert.ok(failed.startsWith("## ❌ "));
  assert.ok(failed.includes("⚠️ missing: X"));
  const many = reportMarkdown({ ...base, unresolved: Array.from({ length: 6 }, (_, i) => ({ name: `P${i}`, reason: "r" })) }, undefined);
  assert.ok(many.includes("**Not found:**\n- P0 (r)"));
  const ru = reportMarkdown({ ...base, created: true }, "u", "ru");
  assert.ok(ru.startsWith("## ✅ Сохранено — zz-test · новый список"));
  assert.ok(ru.includes("Открыть «zz-test» в Google Картах"));
});

test("reportMarkdown: dry run says Would add and has no notes column", () => {
  const md = reportMarkdown({ ...base, dryRun: true, verify: null }, undefined);
  assert.ok(md.startsWith("## ✅ Dry run — zz-test"));
  assert.ok(md.includes("| Would add | Already in list | Not found | Failed |"));
  assert.ok(!md.includes("Notes written"));
});
