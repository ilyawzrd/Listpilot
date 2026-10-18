import fs from "node:fs/promises";
import type { Locator, Page } from "playwright-core";
import { S } from "./selectors.js";
import type { Place } from "./plan.js";

const MAPS = "https://www.google.com/maps";
export const ARTIFACTS = "artifacts";

/** Human-ish pacing between actions; keeps bulk edits from looking like a bot burst. */
export const pause = (min = 700, max = 1600) =>
  new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

export const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Loose name match: one normalized name contains the other ("Din Tai Fung" ⊂ "Din Tai Fung Xinyi"). */
export const sameName = (a: string, b: string) => {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
};

export const withHl = (url: string) => {
  const u = new URL(url);
  u.searchParams.set("hl", "en");
  return u.toString();
};

export async function screenshot(page: Page, label: string) {
  await fs.mkdir(ARTIFACTS, { recursive: true });
  const file = `${ARTIFACTS}/${Date.now()}-${label.replace(/[^\w-]+/g, "_").slice(0, 60)}.png`;
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  return file;
}

export async function retry<T>(page: Page, label: string, fn: () => Promise<T>, attempts = 2): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts) await pause(1500, 2500);
    }
  }
  const shot = await screenshot(page, `fail-${label}`);
  // The ARIA snapshot shows exact accessible names, which a screenshot can't.
  const aria = await page.locator("body").ariaSnapshot().catch((e: Error) => `ariaSnapshot failed: ${e.message}`);
  await fs.writeFile(shot.replace(/\.png$/, ".yaml"), aria).catch(() => {});
  throw new Error(`${label}: ${(last as Error)?.message ?? last} (screenshot: ${shot})`);
}

// ── session ──────────────────────────────────────────────────────────────────

export async function dismissConsent(page: Page) {
  const btn = S.consentRejectAll(page);
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click(); // privacy-preserving choice
    await page.waitForLoadState("domcontentloaded");
  }
}

export async function ensureSignedIn(page: Page) {
  await page.goto(withHl(MAPS), { waitUntil: "domcontentloaded" });
  await dismissConsent(page);
  await pause();
  if (await S.signInLink(page).isVisible({ timeout: 3000 }).catch(() => false)) {
    throw new Error("NOT_SIGNED_IN: sign into Google in the automation Chrome window, then re-run.");
  }
}

// ── resolving a place ────────────────────────────────────────────────────────

export type Resolved = { ok: true; url: string; title: string } | { ok: false; reason: string };

export async function openPlace(page: Page, place: Place): Promise<Resolved> {
  const target = place.url
    ? place.url
    : `${MAPS}/search/?api=1&query=${encodeURIComponent(place.query!)}`;
  await page.goto(withHl(target), { waitUntil: "domcontentloaded" });
  await dismissConsent(page);

  // A unique search hit redirects to /maps/place/…; a results list stays on /maps/search/.
  await page.waitForURL(/\/maps\/place\//, { timeout: 8000 }).catch(() => {});
  if (!/\/maps\/place\//.test(page.url())) {
    return { ok: false, reason: "search returned several results or none — resolve to a place URL" };
  }

  const title = (await S.placeTitle(page).textContent({ timeout: 8000 }).catch(() => ""))?.trim() ?? "";
  if (!title) return { ok: false, reason: "place page loaded without a title" };
  if (!place.url && !sameName(title, place.name)) {
    return { ok: false, reason: `search landed on "${title}", which doesn't match "${place.name}"` };
  }
  if (await S.permanentlyClosed(page).isVisible().catch(() => false)) {
    return { ok: false, reason: `"${title}" is permanently closed` };
  }
  return { ok: true, url: page.url(), title };
}

// ── saving into a list ───────────────────────────────────────────────────────

async function openSaveDialog(page: Page): Promise<Locator> {
  await S.saveButton(page).click({ timeout: 8000 });
  const dialog = S.saveDialog(page);
  await dialog.waitFor({ state: "visible", timeout: 8000 });
  return dialog;
}

const isChecked = async (opt: Locator) => (await opt.getAttribute("aria-checked")) === "true";

async function closeDialog(page: Page) {
  await page.keyboard.press("Escape");
  await pause(400, 800);
}

/** Does the list exist (as an option in the Save dialog of the current place page)? */
export async function listExists(page: Page, listName: string): Promise<boolean> {
  const dialog = await openSaveDialog(page);
  const exists = await S.listOption(dialog, listName).isVisible({ timeout: 2500 }).catch(() => false);
  await closeDialog(page);
  return exists;
}

/** Creates the list from the current place's Save dialog, which also saves this place into it. */
export async function createListWithPlace(page: Page, listName: string) {
  const dialog = await openSaveDialog(page);
  await S.newListOption(dialog).click();
  await S.newListNameInput(page).fill(listName);
  await S.newListCreateButton(page).click({ timeout: 8000 });
  await S.newListDialog(page).waitFor({ state: "hidden", timeout: 8000 }); // closes once created
  await pause(1200, 2000);
}

export type SaveResult = "added" | "already";

export async function saveToList(page: Page, listName: string): Promise<SaveResult> {
  // A list created moments ago takes a while to appear in this menu (seen: missing at +10s,
  // there minutes later). The caller knows the list exists, so reload and look again.
  let dialog = await openSaveDialog(page);
  let opt = S.listOption(dialog, listName);
  for (let i = 0; i < 6; i++) {
    if (await opt.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false)) break;
    await closeDialog(page);
    await pause(4000, 6000);
    await page.reload({ waitUntil: "domcontentloaded" });
    await pause(2000, 3000);
    dialog = await openSaveDialog(page);
    opt = S.listOption(dialog, listName);
  }
  await opt.waitFor({ state: "visible", timeout: 5000 });
  if (await isChecked(opt)) {
    await closeDialog(page);
    return "already";
  }
  await opt.click();
  // Wait for Maps to reflect the toggle before moving on — ordering depends on it.
  await page
    .waitForFunction(
      (el) => el?.getAttribute("aria-checked") === "true",
      await opt.elementHandle(),
      { timeout: 6000 },
    )
    .catch(() => {});
  await closeDialog(page);
  await pause();
  return "added";
}

// ── list view ────────────────────────────────────────────────────────────────

/** ☰ Menu → Saved. */
export async function openSavedPanel(page: Page) {
  // Right after a load, Maps ignores the Menu click (only its tooltip shows), so click until the menu opens.
  for (let i = 0; i < 4; i++) {
    await S.menuButton(page).click({ timeout: 8000 });
    if (await S.savedInMenu(page).isVisible().catch(() => false)) break;
    await pause(1500, 2500);
    if (await S.savedInMenu(page).isVisible().catch(() => false)) break;
  }
  await S.savedInMenu(page).click({ timeout: 8000 });
  await S.savedPanel(page).waitFor({ state: "visible", timeout: 10000 });
  await pause();
}

/** Opens the list view. Caches its URL so later runs skip the Saved-panel navigation. */
export async function openList(page: Page, listName: string, cachedUrl?: string): Promise<string> {
  if (cachedUrl) {
    await page.goto(withHl(cachedUrl), { waitUntil: "domcontentloaded" });
  } else {
    await page.goto(withHl(MAPS), { waitUntil: "domcontentloaded" });
    await dismissConsent(page);
    await pause(2000, 3000); // let Maps hydrate, as the probe does
    await openSavedPanel(page);
    await S.savedListLink(page, listName).click({ timeout: 8000 });
  }
  await S.listPanel(page).waitFor({ state: "visible", timeout: 10000 });
  const heading = (await S.listHeading(page).textContent())?.trim() ?? "";
  if (heading !== listName) throw new Error(`opened list "${heading}", expected "${listName}"`);
  await pause();
  return page.url();
}

/** True cache-bypassing reload via CDP — the "did it really persist?" check. */
export async function hardReload(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.reload", { ignoreCache: true });
  await page.waitForLoadState("domcontentloaded");
  await cdp.detach().catch(() => {});
  await S.listPanel(page).waitFor({ state: "visible", timeout: 30000 }); // a cold reload has taken >15s
  await pause(1500, 2500);
}

/** Strict title match for list rows: equal, or one is the other plus a suffix ("Thaiful" ≠ "Thai"). */
export const sameTitle = (a: string, b: string) => {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x === y || x.startsWith(y + " ") || y.startsWith(x + " "));
};

/**
 * Items titled `title`: exact matches if any, else `sameTitle` ones. Without this, "Septime" and
 * "Septime La Cave" form one group and the k-th-entry ↔ k-th-row pairing swaps their notes.
 * The fallback skips items that exactly match one of `others` (titles of other places in the plan),
 * so a missing "Ten Belles Bread" row can't borrow the "Ten Belles" one.
 */
export const titleGroup = <T>(items: T[], title: string, get: (i: T) => string, others: string[] = []): T[] => {
  const exact = items.filter((i) => norm(get(i)) === norm(title));
  if (exact.length) return exact;
  const taken = new Set(others.map(norm).filter((o) => o !== norm(title)));
  return items.filter((i) => sameTitle(get(i), title) && !taken.has(norm(get(i))));
};

export type ListItem = { title: string; note: string };
/** A row plus its note control: the nth "Add note" button or the nth "Note" textbox in the panel. */
type Row = ListItem & { ctrl: "add" | "box"; nth: number };

/** Unwraps a YAML scalar from an ARIA snapshot line ('…' with '' escapes, or "…" JSON). */
const unyaml = (s: string) => {
  const t = s.trim();
  if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  if (t.startsWith('"') && t.endsWith('"')) { try { return JSON.parse(t) as string; } catch { /* raw */ } }
  return t;
};

/**
 * Reads rows from the panel's ARIA snapshot, the same tree every probe verified. Rows are flat:
 *   - button "<title> 4.7 stars …":      ← has children; its first `text:` child is the title
 *       - text: <title>
 *   - button "Add note": Note            ← or: - textbox "Note": <existing note>
 * Each row is paired with the note control that follows it. No DOM access, no scrolling, so an
 * open (focused) note box stays open.
 */
async function scanRows(page: Page): Promise<Row[]> {
  return parseRows(await S.listPanel(page).ariaSnapshot());
}

/** Pure part of scanRows, exported for testing against saved snapshots. */
export function parseRows(snapshot: string): Row[] {
  const lines = snapshot.split("\n").map((l) => {
    const item = l.trim().replace(/^- /, "");
    // Items that YAML had to quote whole look like: 'button "A: B"': → unwrap.
    const q = item.match(/^'(.*)'(:?)$/);
    return q ? q[1]!.replace(/''/g, "'") + q[2] : item;
  });
  const rows: Row[] = [];
  let title: string | null = null;
  let adds = 0, boxes = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^button "Add note"/.test(l)) {
      if (title !== null) rows.push({ title, note: "", ctrl: "add", nth: adds });
      adds++; title = null;
    } else if (/^textbox "Note"(:|$)/.test(l)) {
      const note = l.replace(/^textbox "Note":?/, "");
      if (title !== null) rows.push({ title, note: unyaml(note), ctrl: "box", nth: boxes });
      boxes++; title = null;
    } else if (/^button ".*":$/.test(l)) {
      const child = lines[i + 1]?.match(/^text: (.*)$/);
      if (child) title = unyaml(child[1]!);
    } else {
      // A closed place's row has no children: button "Pho 19 Permanently closed".
      const closed = l.match(/^button "(.+) (?:Permanently|Temporarily) closed"$/);
      if (closed) title = unyaml(closed[1]!);
    }
  }
  return rows;
}

const noteControl = (page: Page, row: Row) =>
  (row.ctrl === "add" ? S.addNoteButtons(page) : S.noteBoxes(page)).nth(row.nth);

/** Scrolls the lazily-rendered list to the end and reads every row in display order. */
async function readRows(page: Page): Promise<Row[]> {
  let rows = await scanRows(page);
  // Maps loads the next batch slowly, especially after a hard reload (a single 1 s wait stopped at
  // 20 of ~80 rows), so only stop after several scrolls in a row bring nothing new.
  for (let i = 0, idle = 0; i < 80 && rows.length && idle < 4; i++) {
    await noteControl(page, rows[rows.length - 1]!).scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await pause(800 + idle * 700, 1200 + idle * 900);
    const next = await scanRows(page);
    idle = next.length > rows.length ? 0 : idle + 1;
    rows = next;
  }
  return rows;
}

export async function readList(page: Page): Promise<ListItem[]> {
  return (await readRows(page)).map(({ title, note }) => ({ title, note }));
}

/**
 * Writes a note on a row. Appends with " · " if a different note exists; never overwrites.
 * `nth` picks among rows sharing the title (branches of a chain look identical in the list view).
 */
export async function writeNote(
  page: Page, itemTitle: string, note: string, nth = 0, others: string[] = [],
): Promise<"written" | "unchanged"> {
  const find = (rows: Row[]) => titleGroup(rows, itemTitle, (r) => r.title, others)[nth];
  const pick = (rows: Row[]) => {
    const row = find(rows);
    if (!row) throw new Error(`row "${itemTitle}"${nth ? ` #${nth + 1}` : ""} not found in list view`);
    return row;
  };
  // Loaded rows stay rendered, so scroll through the whole list only if this one isn't loaded yet
  // (a full readRows per note bounced the panel up and down for ~10 s each).
  let row = find(await scanRows(page)) ?? pick(await readRows(page));
  let ctrl = noteControl(page, row);
  await ctrl.scrollIntoViewIfNeeded({ timeout: 5000 });
  if (row.ctrl === "add") {
    await ctrl.click({ timeout: 5000 });
    await pause(500, 900);
    // Re-read without scrolling: scrolling would blur the empty box and Maps would close it again.
    row = pick(await scanRows(page));
    if (row.ctrl !== "box") throw new Error(`note box for "${itemTitle}" didn't open`);
    ctrl = noteControl(page, row);
  }
  const existing = (await ctrl.inputValue().catch(async () => (await ctrl.textContent()) ?? "")).trim();
  if (existing && norm(existing).includes(norm(note))) return "unchanged";
  const next = existing ? `${existing} · ${note}` : note;
  await ctrl.fill(next, { timeout: 5000 });
  await page.keyboard.press("Tab"); // inline field; Maps saves on blur
  await pause(1200, 1800);
  return "written";
}

/**
 * Best effort; failures just report false. A list with an icon has "Edit icon" (→ menu → "Choose icon");
 * a list without one has a "Choose icon" button that opens the picker directly.
 */
export async function setListIcon(page: Page, emoji: string): Promise<boolean> {
  try {
    if (await S.chooseIconButton(page).isVisible().catch(() => false)) {
      await S.chooseIconButton(page).click({ timeout: 5000 });
    } else {
      await S.editIconButton(page).click({ timeout: 5000 });
      await pause();
      await S.chooseIconItem(page).click({ timeout: 5000 });
    }
    await S.emojiPicker(page).waitFor({ state: "visible", timeout: 5000 });
    const option = S.emojiOption(page, emoji);
    await option.scrollIntoViewIfNeeded({ timeout: 4000 });
    await option.click({ timeout: 4000 });
    await pause();
    return true;
  } catch {
    await page.keyboard.press("Escape").catch(() => {});
    return false;
  }
}
