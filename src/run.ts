import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import type { BrowserContext, Page } from "playwright-core";
import { connect, connectedToOwnWindow } from "./connect.js";
import { PlanSchema, type ListPlan, type Place } from "./plan.js";
import {
  ARTIFACTS, createListWithPlace, detectLanguage, ensureSignedIn, type LangOption, hardReload, isInList, listExists, norm, openList,
  noteCovered, openPlace, pause, placeId, readList, retry, sameTitle, saveToList, setListIcon, titleGroup, writeNote, type ListItem,
} from "./maps.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "dry-run": { type: "boolean", default: false },
    cdp: { type: "string", default: "http://127.0.0.1:9333" }, // the dedicated profile (npm run chrome)
    // How Maps displays a list. Calibrate once with `npm run probe` and flip if verify reports order drift.
    "list-order": { type: "string", default: "newest-first" },
    state: { type: "string", default: ".gmaps-state.json" },
    // Expected Google account email; the run stops before any write on a mismatch.
    account: { type: "string", default: process.env.GMAPS_ACCOUNT },
    // Maps UI language: auto reads it from Maps (follows the Google account's language setting).
    lang: { type: "string", default: "auto" },
  },
});

const planPath = positionals[0] ?? "plan.json";
const dryRun = values["dry-run"]!;
if (!["newest-first", "oldest-first"].includes(values["list-order"]!)) {
  console.error(`--list-order must be newest-first or oldest-first, got "${values["list-order"]}"`);
  process.exit(1);
}
const newestFirst = values["list-order"] === "newest-first";
if (!["auto", "en", "es", "ru"].includes(values.lang!)) {
  console.error(`--lang must be auto, en, es or ru, got "${values.lang}"`);
  process.exit(1);
}

/** Lists this executor knows exist (it created them or opened them), with the list view URL once seen. */
type State = { lists: Record<string, { url?: string }> };
type Issue = { name: string; reason: string };
type Resolved = { name: string; url: string; title: string; note?: string };

/** How many resolved places share this title (branches of a chain do). */
const countTitle = (resolved: Resolved[], title: string) => titleGroup(resolved, title, (p) => p.title).length;
type ListReport = {
  list: string;
  created: boolean;
  emojiSet: boolean | null;
  added: string[];
  alreadyPresent: string[];
  notesWritten: string[];
  /** Places whose existing note already says what the plan's note does (noteCovered); not appended. */
  notesSkipped: string[];
  unresolved: Issue[];
  failed: Issue[];
  verify: { ok: boolean; missing: string[]; notesMissing: string[]; orderOk: boolean | null; observed: ListItem[] } | null;
  warnings: string[];
};

async function loadState(): Promise<State> {
  try { return JSON.parse(await fs.readFile(values.state!, "utf8")); } catch { return { lists: {} }; }
}

// ── the automation tab ───────────────────────────────────────────────────────
// Maps' renderer keeps growing across page loads in one tab (reloads don't free it) and Chrome
// kills it after ~70 places ("Page crashed"). A new tab gets a new renderer process, so the tab is
// replaced every RECYCLE_EVERY places, and right away after a crash.
const RECYCLE_EVERY = 25;
let context: BrowserContext;
let tab: Page;
let tabCrashed = false;
let placesOnTab = 0;

/**
 * In the main Chrome every tab is new and closed afterwards, so the user's tabs are never touched.
 * In maps-lists' own window the first tab is reused (`reuse`), so there's no second tab next to
 * the one Chrome opened on launch.
 */
async function freshTab(reuse = false): Promise<Page> {
  const old = tab;
  tab = (reuse && connectedToOwnWindow && context.pages()[0]) || (await context.newPage());
  tab.setDefaultTimeout(15000); // any step without its own timeout fails in 15s instead of hanging
  tab.on("crash", () => { tabCrashed = true; });
  tabCrashed = false;
  placesOnTab = 0;
  await old?.close().catch(() => {});
  return tab;
}

/** The tab to open the next place in: a new one if this one crashed or has done its share. */
async function tabForNextPlace(): Promise<Page> {
  if (tabCrashed || ++placesOnTab > RECYCLE_EVERY) await freshTab();
  return tab;
}

async function runList(list: ListPlan, state: State): Promise<ListReport> {
  const r: ListReport = {
    list: list.name, created: false, emojiSet: null, added: [], alreadyPresent: [],
    notesWritten: [], notesSkipped: [], unresolved: [], failed: [], verify: null, warnings: [],
  };
  return dryRun ? dryRunList(list, state, r) : applyList(list, state, r);
}

/**
 * Opens a place and records it in `resolved`, or in the report as unresolved or a duplicate.
 * Leaves `tab` on it. A tab crash gets one more try in a fresh tab.
 */
async function resolvePlace(place: Place, resolved: Resolved[], r: ListReport): Promise<Resolved | null> {
  const open = async () => {
    const page = await tabForNextPlace();
    return retry(page, `resolve-${place.name}`, () => openPlace(page, place));
  };
  const res = await open()
    .catch((e: Error) => (tabCrashed ? open() : Promise.reject(e)))
    .catch((e: Error) => ({ ok: false as const, reason: e.message }));
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

/**
 * Resolves everything and checks each place's own Save-dialog checkbox while its page is open
 * (exact even for chain branches, which the list view can't tell apart). Writes nothing.
 */
async function dryRunList(list: ListPlan, state: State, r: ListReport): Promise<ListReport> {
  // A list recorded in state exists for sure; the Save menu has failed to show a just-created one.
  let exists: boolean | undefined = list.name in state.lists ? true : undefined;
  const resolved: Resolved[] = [];
  const unknown: Resolved[] = []; // list exists but isn't in this place's Save menu yet
  for (const place of list.places) {
    const p = await resolvePlace(place, resolved, r);
    if (!p) { await pause(); continue; }
    const page = tab;
    try {
      // Decided on the first resolved place's page, which is already open.
      exists ??= await retry(page, "check-list", () => listExists(page, list.name));
      const inList = exists ? await retry(page, `check-${p.title}`, () => isInList(page, list.name)) : false;
      if (inList === null) unknown.push(p);
      else (inList ? r.alreadyPresent : r.added).push(p.title);
    } catch (e) {
      r.failed.push({ name: p.title, reason: `checking the Save dialog: ${(e as Error).message}` });
    }
    await pause();
  }
  if (!resolved.length) return r;
  warnShared(resolved, r);

  // Fallback for places whose Save menu doesn't show the list yet: match by name in the list view.
  if (unknown.length) {
    const page = await freshTab();
    try {
      const url = await retry(page, "open-list", () => openList(page, list.name, state.lists[list.name]?.url));
      state.lists[list.name] = { url };
      const current = await readList(page);
      for (const p of unknown) {
        (current.some((i) => sameTitle(i.title, p.title)) ? r.alreadyPresent : r.added).push(p.title);
      }
      r.warnings.push(`Matched by name in the list view (Save menu didn't show the list yet): ${unknown.map((p) => p.title).join(", ")}.`);
    } catch (e) {
      for (const p of unknown) r.failed.push({ name: p.title, reason: `reading the existing list: ${(e as Error).message}` });
    }
  }
  r.warnings.push("dry run: nothing was written; `added` lists what WOULD be added");
  return r;
}

/**
 * One visit per place: resolve it and save it from the same page, then write all notes in one pass
 * over the list view (the only place Maps offers notes), then verify. `dry` is the up-front check.
 */
async function applyList(list: ListPlan, state: State, r: ListReport): Promise<ListReport> {
  // For newest-first display, rank 1 is saved last, so a ranked list is walked backwards.
  const backwards = list.ordered && newestFirst;
  const resolved: Resolved[] = [];
  // A list recorded in state exists for sure; the Save menu has failed to show a just-created one.
  let listReady = list.name in state.lists;
  for (const place of backwards ? [...list.places].reverse() : list.places) {
    const p = await resolvePlace(place, resolved, r);
    if (!p) { await pause(); continue; }
    // No skipping by name: branches of a chain share one. Each place's own checkbox in the Save
    // dialog (saveToList → "already") says whether this exact place is in the list.
    let page = tab;
    let onPage = true;
    let createdWithThis = false; // this place's Create click went through (it's saved by the create)
    try {
      await retry(page, `save-${p.title}`, async () => {
        if (tabCrashed) { page = await freshTab(); onPage = false; }
        if (!onPage) await openPlace(page, { name: p.name, url: p.url });
        onPage = false; // a retry starts from a fresh load
        // A create whose confirmation timed out may still have worked. Never create the list twice.
        if (!listReady && (await listExists(page, list.name))) listReady = true;
        if (!listReady) {
          await createListWithPlace(page, list.name, async () => {
            // Record it as soon as Create is clicked: if the confirmation then times out, the retry
            // takes the saveToList path (which waits out the Save-menu lag) instead of creating again.
            r.created = true; listReady = true; createdWithThis = true;
            state.lists[list.name] ??= {};
            await fs.writeFile(values.state!, JSON.stringify(state, null, 2));
          });
        } else if ((await saveToList(page, list.name)) === "already" && !createdWithThis) {
          r.alreadyPresent.push(p.title);
          return;
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
    // The notes pass and the hard reload get a tab with nothing built up.
    await finishList(await freshTab(), list, state, resolved, r);
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
    if (!row) return false;
    if (norm(row.note).includes(norm(p.note!))) return true;
    if (!noteCovered(row.note, p.note!)) return false;
    r.notesSkipped.push(p.title);
    return true;
  };
  // Same-title entries with one shared note (chain branches always get the same note): which row is
  // which branch doesn't matter, and rows carry no address to tell them apart, while Maps moves
  // every new or edited row to the top, so pairing by position goes wrong when some branches were
  // already in the list. Handle such groups as a whole: every row of the group gets the note.
  const shared = new Map<string, Resolved[]>();
  for (const p of resolved) {
    const group = titleGroup(resolved, p.title, (x) => x.title);
    if (group.length < 2 || group[0] !== p || !group.every((x) => x.note && norm(x.note) === norm(group[0]!.note!))) continue;
    shared.set(p.title, group);
  }
  const inShared = (p: Resolved) => [...shared.values()].some((g) => g.includes(p));
  for (const [title, group] of shared) {
    for (const row of titleGroup(before, title, (i) => i.title, titles)) {
      if (!norm(row.note).includes(norm(group[0]!.note!)) && noteCovered(row.note, group[0]!.note!)) r.notesSkipped.push(title);
    }
    // Write one row at a time and re-read: the edited row jumps to the top, so indices shift.
    for (let attempt = 0; attempt < group.length; attempt++) {
      const rows = titleGroup(await readList(page), title, (i) => i.title, titles);
      const nth = rows.findIndex((row) => !noteCovered(row.note, group[0]!.note!));
      if (nth < 0) break;
      try {
        const res = await retry(page, `note-${title}`, () => writeNote(page, title, group[0]!.note!, nth, titles));
        if (res === "written") r.notesWritten.push(title);
      } catch (e) {
        r.failed.push({ name: title, reason: `note: ${(e as Error).message}` });
        break;
      }
    }
  }
  // Editing a note moves its row to the top, so a ranked list writes notes from the bottom rank up.
  const toWrite = resolved.filter((x) => x.note && !inShared(x) && !hasNote(x));
  if (list.ordered && newestFirst) toWrite.reverse();
  if (list.ordered && toWrite.length && toWrite.length < resolved.length) {
    r.warnings.push("Only some places get a note written; those rows move to the top, so the ranking may be off.");
  }
  for (const p of toWrite) {
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
  const missing = resolved.filter((p) => !rowFor(p)).map((p) => p.title);
  const notesMissing = resolved
    .filter((p) => p.note && rowFor(p) && !inShared(p))
    .filter((p) => !norm(rowFor(p)!.note).includes(norm(p.note!).slice(0, 40)) && !noteCovered(rowFor(p)!.note, p.note!))
    .map((p) => p.title);
  for (const [title, group] of shared) {
    const withNote = titleGroup(observed, title, (i) => i.title, titles).filter((row) => noteCovered(row.note, group[0]!.note!));
    for (let i = withNote.length; i < group.length; i++) notesMissing.push(title);
  }
  let orderOk: boolean | null = null;
  if (list.ordered && r.created) {
    // Same pairing as above, so chain branches get distinct rows instead of all matching the first.
    const positions = resolved.map((p) => rowFor(p)).filter((x) => !!x).map((x) => observed.indexOf(x));
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
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error("No browser context — is Chrome running with --remote-debugging-port?");
  context = ctx;
  await freshTab(true);

  const reports: ListReport[] = [];
  let hl = "en";
  try {
    hl = await detectLanguage(tab, values.lang as LangOption);
    console.log(`Maps UI: ${hl}`);
    await ensureSignedIn(tab, values.account);
    for (const list of plan.lists) {
      // A crash in one list must not take the report (or the other lists) down with it.
      reports.push(await runList(list, state).catch((e: Error) => ({
        list: list.name, created: false, emojiSet: null, added: [], alreadyPresent: [], notesWritten: [], notesSkipped: [],
        unresolved: [], failed: [{ name: list.name, reason: `crashed: ${e.message}` }], verify: null,
        warnings: ["Crashed mid-run: check the list in Maps before re-running."],
      })));
    }
  } finally {
    await fs.writeFile(values.state!, JSON.stringify(state, null, 2));
    await fs.mkdir(ARTIFACTS, { recursive: true });
    await fs.writeFile(`${ARTIFACTS}/report.json`, JSON.stringify(reports.map((r) => ({ ...r, dryRun, mapsLanguage: hl })), null, 2));
    // In its own window, leave the tab on the finished list (verify ends there) for the user to see.
    if (!connectedToOwnWindow) await tab.close().catch(() => {});
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
