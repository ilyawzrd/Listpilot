import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import type { Page } from "playwright-core";
import { connect } from "./connect.js";
import { PlanSchema, type ListPlan, type Place } from "./plan.js";
import {
  ARTIFACTS, createListWithPlace, ensureSignedIn, hardReload, listExists, norm, openList,
  openPlace, pause, readList, retry, sameTitle, saveToList, setListIcon, titleGroup, writeNote, type ListItem,
} from "./maps.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "dry-run": { type: "boolean", default: false },
    cdp: { type: "string", default: "http://127.0.0.1:9222" },
    // How Maps displays a list. Calibrate once with `npm run probe` and flip if verify reports order drift.
    "list-order": { type: "string", default: "newest-first" },
    state: { type: "string", default: ".gmaps-state.json" },
  },
});

const planPath = positionals[0] ?? "plan.json";
const dryRun = values["dry-run"]!;
const newestFirst = values["list-order"] === "newest-first";

/** Lists this executor knows exist (it created them or opened them), with the list view URL once seen. */
type State = { lists: Record<string, { url?: string }> };
type Issue = { name: string; reason: string };
type Resolved = { name: string; url: string; title: string; note?: string };

/** Google's place id from a /maps/place/ URL (…!1s0x…:0x…), used to spot two entries for one place. */
const placeId = (url: string) => url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1];
/** How many resolved places share this title (branches of a chain do). */
const countTitle = (resolved: Resolved[], title: string) => titleGroup(resolved, title, (p) => p.title).length;
type ListReport = {
  list: string;
  created: boolean;
  emojiSet: boolean | null;
  added: string[];
  alreadyPresent: string[];
  notesWritten: string[];
  unresolved: Issue[];
  failed: Issue[];
  verify: { ok: boolean; missing: string[]; notesMissing: string[]; orderOk: boolean | null; observed: ListItem[] } | null;
  warnings: string[];
};

async function loadState(): Promise<State> {
  try { return JSON.parse(await fs.readFile(values.state!, "utf8")); } catch { return { lists: {} }; }
}

async function runList(page: Page, list: ListPlan, state: State): Promise<ListReport> {
  const r: ListReport = {
    list: list.name, created: false, emojiSet: null, added: [], alreadyPresent: [],
    notesWritten: [], unresolved: [], failed: [], verify: null, warnings: [],
  };
  return dryRun ? dryRunList(page, list, state, r) : applyList(page, list, state, r);
}

/** Opens a place and records it in `resolved`, or in the report as unresolved or a duplicate. Leaves the page on it. */
async function resolvePlace(page: Page, place: Place, resolved: Resolved[], r: ListReport): Promise<Resolved | null> {
  const res = await retry(page, `resolve-${place.name}`, () => openPlace(page, place)).catch(
    (e: Error) => ({ ok: false as const, reason: e.message }),
  );
  if (!res.ok) { r.unresolved.push({ name: place.name, reason: res.reason }); return null; }
  if (resolved.some((x) => placeId(x.url) && placeId(x.url) === placeId(res.url))) {
    r.warnings.push(`"${place.name}" resolved to the same Maps place as another entry, so it was skipped.`);
    return null;
  }
  const p = { name: place.name, url: res.url, title: res.title, note: place.note };
  resolved.push(p);
  return p;
}

function warnShared(resolved: Resolved[], r: ListReport) {
  const shared = [...new Set(resolved.map((p) => p.title))].filter((t) => countTitle(resolved, t) > 1);
  if (shared.length) {
    r.warnings.push(`Same-name places (chain branches): ${shared.join(", ")}. The list view can't tell them apart, so their notes should match.`);
  }
  return shared;
}

/** Resolves everything and reads the list; writes nothing. */
async function dryRunList(page: Page, list: ListPlan, state: State, r: ListReport): Promise<ListReport> {
  // 1. Resolve every place.
  const resolved: Resolved[] = [];
  for (const place of list.places) {
    await resolvePlace(page, place, resolved, r);
    await pause();
  }
  if (!resolved.length) return r;
  const shared = warnShared(resolved, r);

  // 2. Does the list exist? Read its current contents if so.
  // A list recorded in state exists for sure; the Save menu has failed to show a just-created one.
  const cached = state.lists[list.name]?.url || undefined;
  let exists = list.name in state.lists;
  if (!exists) {
    try {
      exists = await retry(page, "check-list", async () => {
        await openPlace(page, { name: resolved[0]!.name, url: resolved[0]!.url });
        return listExists(page, list.name);
      });
    } catch (e) {
      r.failed.push({ name: list.name, reason: `checking whether the list exists: ${(e as Error).message}` });
      return r;
    }
  }
  let current: ListItem[] = [];
  if (exists) {
    try {
      const url = await retry(page, "open-list", () => openList(page, list.name, cached));
      state.lists[list.name] = { url };
      current = await readList(page);
    } catch (e) {
      // Without the current contents we can't tell what's already saved.
      r.failed.push({ name: list.name, reason: `reading the existing list: ${(e as Error).message}` });
      return r;
    }
  }
  const inList = (title: string) => current.some((i) => sameTitle(i.title, title));
  for (const p of resolved) (inList(p.title) ? r.alreadyPresent : r.added).push(p.title);
  r.warnings.push("dry run: nothing was written; `added` lists what WOULD be added");
  if (shared.length) r.warnings.push("dry run matches by name, so a chain branch may show as already there; apply checks each branch.");
  return r;
}

/**
 * One visit per place: resolve it and save it from the same page, then write all notes in one pass
 * over the list view (the only place Maps offers notes), then verify. `dry` is the up-front check.
 */
async function applyList(page: Page, list: ListPlan, state: State, r: ListReport): Promise<ListReport> {
  // For newest-first display, rank 1 is saved last, so a ranked list is walked backwards.
  const backwards = list.ordered && newestFirst;
  const resolved: Resolved[] = [];
  // A list recorded in state exists for sure; the Save menu has failed to show a just-created one.
  let listReady = list.name in state.lists;
  for (const place of backwards ? [...list.places].reverse() : list.places) {
    const p = await resolvePlace(page, place, resolved, r);
    if (!p) { await pause(); continue; }
    // No skipping by name: branches of a chain share one. Each place's own checkbox in the Save
    // dialog (saveToList → "already") says whether this exact place is in the list.
    let onPage = true;
    try {
      await retry(page, `save-${p.title}`, async () => {
        if (!onPage) await openPlace(page, { name: p.name, url: p.url });
        onPage = false; // a retry starts from a fresh load
        // A create whose confirmation timed out may still have worked. Never create the list twice.
        if (!listReady && (await listExists(page, list.name))) listReady = true;
        if (!listReady) {
          await createListWithPlace(page, list.name);
          r.created = true; listReady = true;
          // Record it right away, so even a crashed run never creates this list again.
          state.lists[list.name] ??= {};
          await fs.writeFile(values.state!, JSON.stringify(state, null, 2));
        } else {
          if ((await saveToList(page, list.name)) === "already") { r.alreadyPresent.push(p.title); return; }
        }
        r.added.push(p.title);
      });
    } catch (e) {
      r.failed.push({ name: p.title, reason: (e as Error).message });
      if (list.ordered) r.warnings.push(`"${p.title}" failed mid-sequence, so ranking after it may be off.`);
    }
    await pause();
  }
  if (backwards) resolved.reverse(); // back to plan order for note pairing and the order check
  warnShared(resolved, r);
  if (list.ordered && !r.created) {
    r.warnings.push("List already existed; new places are ranked among themselves, existing ones keep their position (nothing is removed).");
  }
  if (!r.created && !r.added.length && !r.alreadyPresent.length) {
    r.warnings.push("Nothing was saved, so the list view, icon and notes were skipped.");
    return r;
  }
  try {
    await finishList(page, list, state, resolved, r);
  } catch (e) {
    // Keep what was already done in the report instead of losing it to a crash.
    r.failed.push({ name: list.name, reason: `list view: ${(e as Error).message}` });
  }
  return r;
}

async function finishList(
  page: Page, list: ListPlan, state: State, resolved: Resolved[], r: ListReport,
) {
  // 4. Icon + notes, in the list view.
  const url = await retry(page, "open-list", () => openList(page, list.name, state.lists[list.name]?.url));
  state.lists[list.name] = { url };
  if (list.emoji && r.created) r.emojiSet = await setListIcon(page, list.emoji);
  if (list.emoji && !r.created) r.warnings.push("List already existed; its icon was left as is.");
  // The k-th plan entry with a given title goes with the k-th row of that title (chain branches).
  const nthOfTitle = (p: Resolved) => titleGroup(resolved, p.title, (x) => x.title).indexOf(p);
  const titles = resolved.map((x) => x.title);
  // One full read loads every row and shows which notes are already there (a re-run touches none of those).
  const before = await readList(page);
  const hasNote = (p: Resolved) => {
    const row = titleGroup(before, p.title, (i) => i.title, titles)[nthOfTitle(p)];
    return !!row && norm(row.note).includes(norm(p.note!));
  };
  for (const p of resolved.filter((x) => x.note && !hasNote(x))) {
    try {
      const res = await retry(page, `note-${p.title}`, () => writeNote(page, p.title, p.note!, nthOfTitle(p), titles));
      if (res === "written") r.notesWritten.push(p.title);
    } catch (e) {
      r.failed.push({ name: p.title, reason: `note: ${(e as Error).message}` });
    }
  }

  // 5. Verify against the server, not the optimistic UI.
  await retry(page, "verify-reload", () => hardReload(page));
  const observed = await readList(page);
  const rowFor = (p: Resolved) => titleGroup(observed, p.title, (i) => i.title, titles)[nthOfTitle(p)];
  const find = (t: string) => observed.findIndex((i) => sameTitle(i.title, t));
  const missing = resolved.filter((p) => !rowFor(p)).map((p) => p.title);
  const notesMissing = resolved
    .filter((p) => p.note && rowFor(p))
    .filter((p) => !norm(rowFor(p)!.note).includes(norm(p.note!).slice(0, 40)))
    .map((p) => p.title);
  let orderOk: boolean | null = null;
  if (list.ordered && r.created) {
    const positions = resolved.map((p) => find(p.title)).filter((i) => i >= 0);
    orderOk = positions.every((v, i, a) => i === 0 || v > a[i - 1]!);
    if (!orderOk) r.warnings.push("Display order doesn't match the plan — try the opposite --list-order.");
  }
  r.verify = { ok: missing.length === 0 && notesMissing.length === 0 && orderOk !== false, missing, notesMissing, orderOk, observed };
}

async function main() {
  const plan = PlanSchema.parse(JSON.parse(await fs.readFile(planPath, "utf8")));
  const state = await loadState();

  // Attach to Chrome over CDP (main Chrome via chrome://inspect toggle, or the dedicated profile).
  const browser = await connect(values.cdp!);
  const context = browser.contexts()[0];
  if (!context) throw new Error("No browser context — is Chrome running with --remote-debugging-port?");
  const page = await context.newPage();
  page.setDefaultTimeout(15000); // any step without its own timeout fails in 15s instead of hanging

  const reports: ListReport[] = [];
  try {
    await ensureSignedIn(page);
    for (const list of plan.lists) {
      // A crash in one list must not take the report (or the other lists) down with it.
      reports.push(await runList(page, list, state).catch((e: Error) => ({
        list: list.name, created: false, emojiSet: null, added: [], alreadyPresent: [], notesWritten: [],
        unresolved: [], failed: [{ name: list.name, reason: `crashed: ${e.message}` }], verify: null,
        warnings: ["Crashed mid-run: check the list in Maps before re-running."],
      })));
    }
  } finally {
    await fs.writeFile(values.state!, JSON.stringify(state, null, 2));
    await fs.mkdir(ARTIFACTS, { recursive: true });
    await fs.writeFile(`${ARTIFACTS}/report.json`, JSON.stringify(reports, null, 2));
    await page.close().catch(() => {});
    await browser.close(); // disconnects only; your Chrome keeps running
  }

  for (const r of reports) {
    console.log(`\n■ ${r.list}${r.created ? " (created)" : ""}${dryRun ? " [dry run]" : ""}`);
    console.log(`  added ${r.added.length} · already there ${r.alreadyPresent.length} · notes ${r.notesWritten.length}`);
    for (const u of r.unresolved) console.log(`  ? unresolved: ${u.name} — ${u.reason}`);
    for (const f of r.failed) console.log(`  ✗ failed: ${f.name} — ${f.reason}`);
    for (const w of r.warnings) console.log(`  ! ${w}`);
    if (r.verify) {
      console.log(`  verify after hard reload: ${r.verify.ok ? "OK" : "PROBLEMS"}`);
      if (r.verify.missing.length) console.log(`    missing: ${r.verify.missing.join(", ")}`);
      if (r.verify.notesMissing.length) console.log(`    notes not persisted: ${r.verify.notesMissing.join(", ")}`);
    }
  }
  console.log(`\nFull report: ${ARTIFACTS}/report.json`);
  if (reports.some((r) => r.verify && !r.verify.ok)) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
