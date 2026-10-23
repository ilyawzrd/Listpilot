import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Page } from "playwright-core";
import { connect } from "./connect.js";
import { detectLanguage, ensureSignedIn, isInList, type LangOption, openList, openPlace, readList, sameTitle } from "./maps.js";
import type { Plan } from "./plan.js";
import { S } from "./selectors.js";

/**
 * Has Maps changed under us? Read-only: walks what apply does, through the executor's own code and
 * selectors, against a fixed list, and reports each step. Run it before a release, and with
 * --lang es / --lang ru after touching TEXT.es / TEXT.ru.
 *
 *   maps-lists ui-check [--cdp auto] [--lang auto|en|es|ru]
 *   maps-lists ui-check --setup [--cdp auto]     # once: creates the zz-ui-check list through apply
 *   maps-lists ui-check --signed-out             # CI: only the steps a signed-out Chrome can do
 *
 * Each passing step's ARIA snapshot is kept as ui-check/<hl>/<step>.yaml. A failing step writes
 * <step>.fail.yaml and prints the lines that changed since the last pass: usually the renamed
 * label. Snapshots go through `scrub` first, which drops the account button (name + email).
 * Exit 0 all passed · 1 a step failed · 2 the fixture list is missing (run --setup).
 */

export const FIXTURE = "zz-ui-check";
const FIXTURE_NOTE = "ui-check fixture: keep this note";
const place = (name: string, id: string) => ({ name, url: `https://www.google.com/maps/place/${name.replace(/ /g, "+")}/data=!4m2!3m1!1s${id}` });
// San Francisco bakeries open for decades, so their pages stay put.
const WITH_NOTE = place("Tartine Bakery", "0x808f7e1807365605:0x601f7a97f0ce6c6b");
const WITHOUT_NOTE = place("Tartine Manufactory", "0x808f7e308f2ed1bb:0x88d7d35712aa2ba3");
// Fragments, Rue des Tournelles, Paris: permanently closed (seen in en, es and ru, Oct 2026).
const CLOSED = place("Fragments", "0x47e66dffd3e46d67:0xb0aec682bcf3a64");

export const FIXTURE_PLAN: Plan = {
  version: 1,
  lists: [{ name: FIXTURE, emoji: "🧪", ordered: false, places: [{ ...WITH_NOTE, note: FIXTURE_NOTE }, WITHOUT_NOTE] }],
};

/** Drops lines that carry the signed-in account (its button names the email). */
export const scrub = (snapshot: string) =>
  snapshot.split("\n").filter((l) => !/Google Account|@[\w-]+\.[\w.]+/.test(l)).join("\n");

/**
 * What changed between two snapshots, as role/name lines: `gone` were in the last passing one.
 * Free text, links and images are left out, and numbers become # (ratings, counts, hours change daily).
 */
export function snapshotDiff(before: string, after: string): { gone: string[]; added: string[] } {
  const lines = (s: string) =>
    new Set(
      s.split("\n")
        .map((l) => l.trim().replace(/^- /, "").replace(/:$/, "").replace(/\d+([.,]\d+)?/g, "#"))
        .filter((l) => l && !/^(text|\/url|img|paragraph|listitem)\b/.test(l)),
    );
  const a = lines(before), b = lines(after);
  return { gone: [...a].filter((l) => !b.has(l)), added: [...b].filter((l) => !a.has(l)) };
}

type Step = { name: string; ok: boolean | null; detail: string };

async function main() {
  const { values } = parseArgs({
    options: {
      cdp: { type: "string", default: "http://127.0.0.1:9333" },
      lang: { type: "string", default: "auto" },
      setup: { type: "boolean", default: false },
      "signed-out": { type: "boolean", default: false },
    },
  });
  if (!["auto", "en", "es", "ru"].includes(values.lang!)) {
    console.error(`--lang must be auto, en, es or ru, got "${values.lang}"`);
    process.exit(1);
  }
  if (values.setup) {
    // Through apply itself, so the fixture is made the way every list is.
    await fs.writeFile("plan.ui-check.json", JSON.stringify(FIXTURE_PLAN, null, 2));
    const run = fileURLToPath(new URL("./run.ts", import.meta.url));
    const r = spawnSync(process.execPath, [...process.execArgv, run, "plan.ui-check.json", "--cdp", values.cdp!, "--lang", values.lang!], { stdio: "inherit" });
    process.exit(r.status ?? 1);
  }

  const browser = await connect(values.cdp!);
  const page = await browser.contexts()[0]!.newPage();
  const steps: Step[] = [];
  let dir = "";
  let missing = false;

  const step = async (name: string, fn: () => Promise<string>, needs: string[] = []) => {
    const unmet = needs.filter((n) => !steps.find((s) => s.name === n)?.ok);
    if (unmet.length) {
      steps.push({ name, ok: null, detail: `skipped: needs ${unmet.join(", ")}` });
      return;
    }
    let ok = true, detail: string;
    try {
      detail = await fn();
    } catch (e) {
      ok = false;
      detail = (e as Error).message.split("\n")[0]!;
    }
    steps.push({ name, ok, detail });
    await snapshot(page, name, ok);
  };

  const snapshot = async (p: Page, name: string, ok: boolean) => {
    const now = scrub(await p.locator("body").ariaSnapshot().catch(() => ""));
    const base = path.join(dir, `${name}.yaml`);
    if (ok) return fs.writeFile(base, now);
    await fs.writeFile(path.join(dir, `${name}.fail.yaml`), now);
    const before = await fs.readFile(base, "utf8").catch(() => null);
    if (!before) return;
    const { gone, added } = snapshotDiff(before, now);
    steps.at(-1)!.detail += [
      ...gone.slice(0, 12).map((l) => `\n      − ${l}`),
      ...added.slice(0, 12).map((l) => `\n      + ${l}`),
    ].join("");
  };

  try {
    const hl = await detectLanguage(page, values.lang as LangOption);
    dir = path.join("ui-check", hl);
    await fs.mkdir(dir, { recursive: true });
    console.log(`Maps UI: ${hl}\n`);

    if (values["signed-out"]) steps.push({ name: "signed-in", ok: null, detail: "skipped: --signed-out" });
    else await step("signed-in", async () => {
      await ensureSignedIn(page);
      return "account button found, no Sign in link";
    });
    await step("place-page", async () => {
      const r = await openPlace(page, WITH_NOTE);
      if (!r.ok) throw new Error(r.reason);
      if (!sameTitle(r.title, WITH_NOTE.name)) throw new Error(`title "${r.title}"`);
      await S.saveButton(page).waitFor({ timeout: 8000 });
      return `"${r.title}", Save button`;
    });
    await step("save-dialog", async () => {
      const inList = await isInList(page, FIXTURE);
      if (inList === null) {
        missing = true;
        throw new Error(`${FIXTURE} isn't in the Save menu`);
      }
      if (!inList) throw new Error(`${WITH_NOTE.name} isn't ticked in ${FIXTURE}`);
      return `${FIXTURE} listed and ticked`;
    }, ["signed-in", "place-page"]);
    await step("closed-place", async () => {
      const r = await openPlace(page, CLOSED);
      if (r.ok) throw new Error(`"${r.title}" opened as open: the closed text wasn't found`);
      if (!/permanently closed/.test(r.reason)) throw new Error(r.reason);
      return "recognised as permanently closed";
    });
    await step("list-navigation", async () => {
      await openList(page, FIXTURE); // ☰ Menu → Saved → the list, with no cached URL
      return "Menu → Saved → list view";
    }, ["signed-in"]);
    await step("list-rows", async () => {
      const rows = await readList(page);
      const noted = rows.find((r) => sameTitle(r.title, WITH_NOTE.name));
      const plain = rows.find((r) => sameTitle(r.title, WITHOUT_NOTE.name));
      if (!noted || !plain) throw new Error(`rows read: ${rows.map((r) => r.title).join(", ") || "none"}`);
      if (!noted.note.includes(FIXTURE_NOTE)) throw new Error(`${WITH_NOTE.name}'s note reads "${noted.note}"`);
      if (plain.note) throw new Error(`${WITHOUT_NOTE.name} has a note: "${plain.note}"`);
      return `${rows.length} rows, note read, empty note read`;
    }, ["list-navigation"]);
    await step("icon-button", async () => {
      if (await S.editIconButton(page).isVisible().catch(() => false)) return '"Edit icon" button';
      await S.chooseIconButton(page).waitFor({ timeout: 5000 });
      return '"Choose icon" button';
    }, ["list-navigation"]);
  } finally {
    await page.close().catch(() => {});
    await browser.close(); // disconnects only
  }

  for (const s of steps) console.log(`  ${s.ok ? "✓" : s.ok === null ? "–" : "✗"} ${s.name.padEnd(16)} ${s.detail}`);
  const failed = steps.filter((s) => s.ok === false).length;
  if (missing) {
    console.log(`\n${FIXTURE} is missing: run \`maps-lists ui-check --setup\` once (it creates the list with two places).`);
    process.exitCode = 2;
  } else if (failed) {
    console.log(`\n${failed} step(s) failed. Snapshots: ${dir}/<step>.fail.yaml (− label gone since the last pass, + new).`);
    process.exitCode = 1;
  } else {
    const skipped = steps.filter((s) => s.ok === null).length;
    console.log(`\nAll steps passed${skipped ? ` (${skipped} skipped)` : ""}.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
