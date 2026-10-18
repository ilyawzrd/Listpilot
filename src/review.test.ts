import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  applyChoices, buildPlacesMd, inline, loadResearch, placesPath, renderPage, ResearchSchema, serve, summarize,
} from "./review.js";

const EXAMPLE = "examples/research.example.json";

test("schema accepts the example and rejects bad links and long list names", async () => {
  const r = await loadResearch(EXAMPLE);
  assert.equal(r.places.length, 3);
  assert.equal(r.excluded.length, 1);
  const raw = JSON.parse(await fs.readFile(EXAMPLE, "utf8"));
  raw.places[0].sources = [{ title: "x", url: "javascript:alert(1)" }];
  assert.equal(ResearchSchema.safeParse(raw).success, false);
  assert.equal(ResearchSchema.safeParse({ ...raw, list: "x".repeat(41) }).success, false);
});

test("buildPlacesMd keeps ticked items, a ticked filtered-out one and edited notes, in section order", async () => {
  const r = await loadResearch(EXAMPLE);
  const after = applyChoices(r, [
    { id: "p1", keep: false, note: "Sourdough sells out by noon; closed Mondays." },
    { id: "p2", keep: true, note: "Flat white;\n laptop-friendly before 11." },
    { id: "x0", keep: true, note: "Only if the queue is short." },
  ]);
  assert.equal(buildPlacesMd(after), [
    "# Lisbon Bakeries",
    "",
    "## Bakeries",
    "",
    "- **Manteigaria** (all branches): Pastel de nata straight from the oven; eat it standing at the counter.",
    "- **Fábrica da Nata** (Restauradores): Only if the queue is short.",
    "",
    "## Coffee",
    "",
    "- **Copenhagen Coffee Lab** (Príncipe Real): Flat white; laptop-friendly before 11.",
    "",
  ].join("\n"));
  assert.equal(summarize(r, after), "Kept 2 of 3 (+1 from filtered out), 2 notes edited");
});

test("page escapes HTML from the research file and renders details links", async () => {
  const r = await loadResearch(EXAMPLE);
  r.places[0]!.details = "<script>alert(1)</script> see [Time Out](https://timeout.com)";
  r.places[0]!.note = "</textarea><img src=x onerror=alert(1)>";
  const html = renderPage(r);
  assert.ok(!html.includes("<script>alert"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes('<a href="https://timeout.com" target="_blank" rel="noopener">Time Out</a>'));
  assert.ok(html.includes("Filtered out (1)"));
});

test("inline links markdown and bare URLs, http(s) only", () => {
  assert.equal(
    inline("[Islands](https://islands.com/a?b=1&c=2) and **bold**"),
    '<a href="https://islands.com/a?b=1&amp;c=2" target="_blank" rel="noopener">Islands</a> and <strong>bold</strong>',
  );
  assert.equal(
    inline("See https://example.com/x."),
    'See <a href="https://example.com/x" target="_blank" rel="noopener">https://example.com/x</a>.',
  );
  assert.ok(!inline("[x](javascript:alert(1))").includes("<a "));
});

test("server: wrong token is refused, submit writes the places file and the choices", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "review-"));
  const file = path.join(dir, "lisbon.json");
  await fs.copyFile(EXAMPLE, file);
  const token = "secret";
  const outcome = serve({
    file, token, waitMs: 5000, idleMs: 5000,
    onListen: async (port) => {
      const base = `http://127.0.0.1:${port}`;
      assert.equal((await fetch(`${base}/?t=wrong`)).status, 403);
      assert.equal((await fetch(`${base}/?t=${token}`)).status, 200);
      const res = await fetch(`${base}/submit?t=${token}`, {
        method: "POST",
        body: JSON.stringify({ items: [{ id: "p0", keep: false, note: "" }] }),
      });
      assert.equal(res.status, 204);
    },
  });
  const o = await outcome;
  assert.equal(o.outcome, "submitted");
  const md = await fs.readFile(placesPath(file), "utf8");
  assert.ok(!md.includes("Manteigaria"));
  assert.ok(md.includes("Padaria do Bairro"));
  assert.equal((await loadResearch(file)).places[0]!.keep, false);
});

test("server: no heartbeat means the page is gone", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "review-"));
  const file = path.join(dir, "lisbon.json");
  await fs.copyFile(EXAMPLE, file);
  assert.deepEqual(await serve({ file, token: "t", waitMs: 10_000, idleMs: 500 }), { outcome: "closed" });
});
