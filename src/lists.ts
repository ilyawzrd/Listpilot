import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * What the user has made: every list in .gmaps-state.json (with its Maps link) joined with the
 * research/*.places.md files that populated it, minus zz-* test lists. Read-only; the
 * maps-lists:lists skill formats it.
 *
 *   maps-lists lists        # JSON array, newest first
 */

export type ListInfo = {
  name: string;
  /** Google Maps link recorded when the executor created or opened the list. */
  url?: string;
  /** Places files whose `# ` title is this list, oldest first (a list updated twice has two). */
  files: { path: string; date?: string; places: number }[];
  /** Places across all files; a place in two files counts twice. */
  places: number;
};

/** `# Title` and the number of `- **Name**` bullets in a places file. */
export function parsePlacesFile(text: string): { title?: string; places: number } {
  const title = text.match(/^# (.+)$/m)?.[1]?.trim();
  const places = text.split("\n").filter((l) => /^- \*\*.+?\*\*/.test(l)).length;
  return { title, places };
}

const fileDate = (name: string) => name.match(/-(\d{4})(\d{2})(\d{2})\.places\.md$/)?.slice(1).join("-");

export async function listLists(root: string): Promise<ListInfo[]> {
  const state = JSON.parse(await fs.readFile(path.join(root, ".gmaps-state.json"), "utf8").catch(() => "{}")) as {
    lists?: Record<string, { url?: string }>;
  };
  const byName = new Map<string, ListInfo>();
  const get = (name: string) => {
    if (!byName.has(name)) byName.set(name, { name, files: [], places: 0 });
    return byName.get(name)!;
  };
  for (const [name, entry] of Object.entries(state.lists ?? {})) get(name).url = entry?.url;

  const dir = path.join(root, "research");
  const names = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(".places.md")).sort();
  for (const n of names) {
    const { title, places } = parsePlacesFile(await fs.readFile(path.join(dir, n), "utf8"));
    const info = get(title ?? n.replace(/(-\d{8})?\.places\.md$/, ""));
    info.files.push({ path: `research/${n}`, date: fileDate(n), places });
    info.places += places;
  }

  const newest = (l: ListInfo) => l.files.map((f) => f.date ?? "").sort().at(-1) ?? "";
  return [...byName.values()]
    .filter((l) => !l.name.startsWith("zz-"))
    .sort((a, b) => newest(b).localeCompare(newest(a)) || a.name.localeCompare(b.name));
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  console.log(JSON.stringify(await listLists(process.cwd()), null, 2));
}
