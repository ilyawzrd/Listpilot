import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { ARTIFACTS } from "./maps.js";

/**
 * Resolve place names to /maps/place/ URLs without Chrome (see "Resolving places without Chrome"
 * in CLAUDE.md). Prints candidates only; deciding which one is meant is Claude's job.
 *
 *   npm run resolve -- queries.txt            # one query per line
 *   npm run resolve -- --query "Langer's Deli Los Angeles"
 */

export type Candidate = { name: string; address: string; id: string; url: string };

const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
  "accept-language": "en",
};

export const placeUrl = (name: string, id: string) =>
  `https://www.google.com/maps/place/${encodeURIComponent(name).replace(/%20/g, "+")}/data=!4m2!3m1!1s${id}`;

/** Candidates from a `/search?tbm=map` response, in result order, one per feature id. */
export function parseCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const re = /"(0x[0-9a-f]+:0x[0-9a-f]+)","((?:[^"\\]|\\.)+)"/g;
  for (let m; (m = re.exec(text)); ) {
    const id = m[1]!;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = JSON.parse(`"${m[2]}"`) as string;
    // The full address comes shortly after as "<name>, <street>, <city>, …, <country>".
    // Compare decoded strings: names arrive escaped ("&" as &).
    const tail = text.slice(m.index + m[0].length, m.index + 3000);
    let address = "";
    for (const s of tail.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      const str = JSON.parse(`"${s[1]}"`) as string;
      if (str.startsWith(`${name}, `)) { address = str.slice(name.length + 2); break; }
    }
    out.push({ name, address, id, url: placeUrl(name, id) });
  }
  return out;
}

export async function search(query: string): Promise<Candidate[]> {
  const page = await fetch(
    `https://www.google.com/maps/search/?api=1&hl=en&query=${encodeURIComponent(query)}`,
    { headers: HEADERS },
  );
  const link = (await page.text()).match(/\/search\?tbm=map[^"']+/)?.[0];
  if (!link) return [];
  const data = await fetch(`https://www.google.com${link.replace(/&amp;/g, "&")}`, { headers: HEADERS });
  return parseCandidates(await data.text());
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { query: { type: "string", multiple: true } },
  });
  const queries = [...(values.query ?? [])];
  for (const file of positionals) {
    queries.push(...(await fs.readFile(file, "utf8")).split("\n").map((l) => l.trim()).filter(Boolean));
  }
  if (!queries.length) {
    console.error('usage: npm run resolve -- <queries.txt> | --query "<place, city>"');
    process.exit(1);
  }

  const results: Record<string, Candidate[] | { error: string }> = {};
  for (const q of queries) {
    results[q] = await search(q).catch((e: Error) => ({ error: e.message }));
    const r = results[q]!;
    console.log(`## ${q}`);
    if ("error" in r) console.log(`  ERROR ${r.error}`);
    else if (!r.length) console.log("  (no results)");
    else for (const c of r.slice(0, 8)) console.log(`  ${c.name} | ${c.address} | ${c.id}`);
  }
  await fs.mkdir(ARTIFACTS, { recursive: true });
  await fs.writeFile(`${ARTIFACTS}/resolve.json`, JSON.stringify(results, null, 2));
  console.log(`\nFull results (with URLs): ${ARTIFACTS}/resolve.json`);
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) await main();
