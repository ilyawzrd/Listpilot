import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { clean } from "./clean.js";

const FILES = [
  "artifacts/report.json",
  "artifacts/20261018-fail-save.png",
  "artifacts/keep-me.txt", // tracked below
  "plan.json",
  "plan.20261018-1651.json",
  "plan.retry.json",
  "plan.paris.json",
  "research/lisbon-bakeries-20261018.json",
  "research/lisbon-bakeries-20261018.html",
  "research/lisbon-bakeries-20261018.md",
  "research/lisbon-bakeries-20261018.places.md",
  "reports/Lisbon bakeries.md",
  "research_notes/Lisbon bakeries/notes.md",
  "src/run.ts",
  "examples/plan.example.json", // tracked below
];

const STATE = {
  lists: {
    Paris: { url: "https://maps/paris" },
    "zz-skill-test": { url: "https://maps/zz" },
    "Where to Eat & Drink in Los Angeles (October 2026)": { url: "https://maps/long" },
  },
};

async function tree() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "clean-"));
  for (const f of FILES) {
    await fs.mkdir(path.dirname(path.join(root, f)), { recursive: true });
    await fs.writeFile(path.join(root, f), "x");
  }
  await fs.writeFile(path.join(root, ".gmaps-state.json"), JSON.stringify(STATE, null, 2));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-f", "artifacts/keep-me.txt", "src/run.ts", "examples/plan.example.json"], { cwd: root });
  return root;
}

const present = async (root: string) =>
  (await Promise.all(FILES.map(async (f) => ((await fs.access(path.join(root, f)).then(() => true, () => false)) ? f : null))))
    .filter(Boolean);

const state = async (root: string) => JSON.parse(await fs.readFile(path.join(root, ".gmaps-state.json"), "utf8"));

test("clean removes every untracked plan, keeps places files, tracked files and real lists", async () => {
  const root = await tree();
  const removed = await clean(root);
  assert.deepEqual(new Set(removed), new Set([
    "artifacts/report.json",
    "artifacts/20261018-fail-save.png",
    "plan.json",
    "plan.20261018-1651.json",
    "plan.retry.json",
    "plan.paris.json",
    "research/lisbon-bakeries-20261018.json",
    "research/lisbon-bakeries-20261018.html",
    "research/lisbon-bakeries-20261018.md",
    "reports/",
    "research_notes/",
    '.gmaps-state.json entry "zz-skill-test"',
    '.gmaps-state.json entry "Where to Eat & Drink in Los Angeles (October 2026)"',
  ]));
  assert.deepEqual(await present(root), [
    "artifacts/keep-me.txt",
    "research/lisbon-bakeries-20261018.places.md",
    "src/run.ts",
    "examples/plan.example.json",
  ]);
  assert.deepEqual(Object.keys((await state(root)).lists), ["Paris"]);
  assert.deepEqual(await clean(root), []);
});

test("clean --dry-run removes nothing and leaves the state file alone", async () => {
  const root = await tree();
  assert.equal((await clean(root, { dryRun: true })).length, 13);
  assert.equal((await present(root)).length, FILES.length);
  assert.deepEqual(Object.keys((await state(root)).lists).sort(), Object.keys(STATE.lists).sort());
});
