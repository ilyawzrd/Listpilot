import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { listLists, parsePlacesFile } from "./lists.js";

const SF = `# San Francisco

## Bakeries

- **Arsicault Bakery** (all branches): Butter croissant.
- **Tartine** (Mission): Morning bun, go before 9.

## Coffee

- **Saint Frank Coffee** (Russian Hill): Cortado.
`;

test("parsePlacesFile reads the title and counts place bullets", () => {
  assert.deepEqual(parsePlacesFile(SF), { title: "San Francisco", places: 3 });
  assert.deepEqual(parsePlacesFile("no title\n- plain bullet\n"), { title: undefined, places: 0 });
});

test("listLists joins state links with places files, newest first", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lists-"));
  await fs.mkdir(path.join(root, "research"));
  await fs.writeFile(
    path.join(root, ".gmaps-state.json"),
    JSON.stringify({ lists: { "San Francisco": { url: "https://maps/sf" }, Paris: { url: "https://maps/paris" } } }),
  );
  await fs.writeFile(path.join(root, "research/sf-bakeries-20261019.places.md"), SF);
  await fs.writeFile(path.join(root, "research/sf-more-20261021.places.md"), "# San Francisco\n\n- **Jane** (Geary): Loaf.\n");
  await fs.writeFile(path.join(root, "research/lisbon-20261020.places.md"), "# Lisbon Bakeries\n\n- **Manteigaria**: Nata.\n");
  await fs.writeFile(path.join(root, "research/lisbon-20261020.json"), "{}"); // not a places file
  await fs.writeFile(path.join(root, "research/test-20261022.places.md"), "# zz-plugin-test\n\n- **X**: y.\n"); // test list

  const lists = await listLists(root);
  assert.deepEqual(lists.map((l) => l.name), ["San Francisco", "Lisbon Bakeries", "Paris"]);
  const sf = lists[0]!;
  assert.equal(sf.url, "https://maps/sf");
  assert.equal(sf.places, 4);
  assert.deepEqual(sf.files.map((f) => [f.path, f.date, f.places]), [
    ["research/sf-bakeries-20261019.places.md", "2026-10-19", 3],
    ["research/sf-more-20261021.places.md", "2026-10-21", 1],
  ]);
  assert.equal(lists[1]!.url, undefined); // places file, but no state entry
  assert.deepEqual(lists[2], { name: "Paris", url: "https://maps/paris", files: [], places: 0 }); // link only
});

test("listLists copes with an empty data folder", async () => {
  assert.deepEqual(await listLists(await fs.mkdtemp(path.join(os.tmpdir(), "lists-"))), []);
});
