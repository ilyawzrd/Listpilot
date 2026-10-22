import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { MAX_LIST_NAME } from "./plan.js";

/**
 * Removes what runs leave behind and keeps only the final places files lists were populated from.
 *
 *   npm run clean               # maps-lists:run also runs it after a verified apply
 *   npm run clean -- --dry-run
 *   npm run clean -- --older-than 7   # start.sh: only leftovers untouched for 7 days, state file left alone
 *
 * Keeps research/*.places.md, anything git tracks, and the state file's real lists. Removes
 * artifacts/*, every untracked plan*.json (plan.json, plan.retry.json, dated backups, custom names
 * like plan.paris.json), every other file in research/, and deep-research's reports/ and
 * research_notes/. In .gmaps-state.json it drops only entries the executor can't match again: names
 * longer than MAX_LIST_NAME (plan validation rejects them now) and zz-* throwaway test lists.
 */

/** Names the executor can never match again: too long for plan validation, or a zz-* test list. */
export const isStaleListName = (name: string) => name.length > MAX_LIST_NAME || name.startsWith("zz-");

function trackedFiles(root: string): string[] {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\0").filter(Boolean);
  } catch {
    return []; // not a git checkout: nothing is protected by tracking
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Latest mtime of a file, or of anything inside a folder (editing a file doesn't touch its folder's mtime). */
async function newestMtime(abs: string): Promise<number> {
  const st = await fs.lstat(abs);
  if (!st.isDirectory()) return st.mtimeMs;
  const inside = await Promise.all((await list(abs)).map((name) => newestMtime(path.join(abs, name))));
  return Math.max(st.mtimeMs, ...inside);
}

const exists = (p: string) => fs.lstat(p).then(() => true, () => false);
const list = (p: string) => fs.readdir(p).catch(() => [] as string[]);

/** What to remove, relative to root, before the tracked-file check. */
async function candidates(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const name of await list(path.join(root, "artifacts"))) out.push(`artifacts/${name}`);
  for (const name of await list(root)) if (/^plan.*\.json$/.test(name)) out.push(name);
  for (const name of await list(path.join(root, "research"))) if (!name.endsWith(".places.md")) out.push(`research/${name}`);
  for (const dir of ["reports", "research_notes"]) if (await exists(path.join(root, dir))) out.push(dir);
  return out;
}

/** Drops stale entries from .gmaps-state.json; returns the names dropped. */
async function pruneState(root: string, dryRun: boolean): Promise<string[]> {
  const file = path.join(root, ".gmaps-state.json");
  const state = JSON.parse(await fs.readFile(file, "utf8").catch(() => "null")) as { lists?: Record<string, unknown> } | null;
  if (!state?.lists) return [];
  const stale = Object.keys(state.lists).filter(isStaleListName);
  if (!stale.length || dryRun) return stale;
  for (const name of stale) delete state.lists[name];
  await fs.writeFile(file, JSON.stringify(state, null, 2) + "\n");
  return stale;
}

/**
 * olderThanDays: remove only candidates (a whole folder counts as one) untouched for that many days,
 * and leave .gmaps-state.json alone, so an interrupted session can still be resumed.
 */
export async function clean(root: string, opts: { dryRun?: boolean; olderThanDays?: number } = {}): Promise<string[]> {
  const cutoff = opts.olderThanDays === undefined ? Infinity : Date.now() - opts.olderThanDays * DAY_MS;
  const tracked = trackedFiles(root);
  const removed: string[] = [];
  const remove = async (rel: string): Promise<void> => {
    if (tracked.includes(rel)) return;
    const abs = path.join(root, rel);
    const st = await fs.lstat(abs).catch(() => null);
    if (!st) return;
    // A folder with tracked files inside: remove only its untracked contents.
    if (st.isDirectory() && tracked.some((t) => t.startsWith(`${rel}/`))) {
      for (const name of await list(abs)) await remove(`${rel}/${name}`);
      return;
    }
    if (!opts.dryRun) await fs.rm(abs, { recursive: true, force: true }); // lstat + rm: symlinks go, targets stay
    removed.push(st.isDirectory() ? `${rel}/` : rel);
  };
  for (const rel of await candidates(root)) {
    if (cutoff !== Infinity && (await newestMtime(path.join(root, rel)).catch(() => Infinity)) > cutoff) continue;
    await remove(rel);
  }
  if (opts.olderThanDays !== undefined) return removed;
  for (const name of await pruneState(root, !!opts.dryRun)) removed.push(`.gmaps-state.json entry "${name}"`);
  return removed;
}

async function main() {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean" }, "older-than": { type: "string" } } });
  const days = values["older-than"] === undefined ? undefined : Number(values["older-than"]);
  if (days !== undefined && !(days >= 0)) throw new Error(`--older-than takes a number of days, got "${values["older-than"]}"`);
  const removed = await clean(process.cwd(), { dryRun: values["dry-run"], olderThanDays: days });
  if (!removed.length) { if (days === undefined) console.log("Nothing to clean"); return; }
  if (values["dry-run"]) for (const r of removed) console.log(`Would remove ${r}`);
  const kept = (await list("research")).filter((n) => n.endsWith(".places.md"));
  console.log(`${values["dry-run"] ? "Would clean" : "Cleaned"} ${removed.length} item${removed.length === 1 ? "" : "s"}` +
    (kept.length ? `; kept ${kept.map((n) => `research/${n}`).join(", ")}` : ""));
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) await main();
