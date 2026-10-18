/**
 * Calibration run. Read-only: opens a place, opens (then closes) its Save dialog, opens your
 * Saved panel, and dumps ARIA snapshots to ./artifacts. Paste those back to Claude to fix
 * src/selectors.ts against the real UI.
 *
 *   npm run probe -- 'https://www.google.com/maps/place/...' ['List name'] [--cdp auto]
 */
import fs from "node:fs/promises";
import type { Page } from "playwright-core";
import { connect } from "./connect.js";
import { S } from "./selectors.js";
import { ARTIFACTS, dismissConsent, pause, readList, screenshot, withHl } from "./maps.js";

const args = process.argv.slice(2);
const cdpIdx = args.indexOf("--cdp");
const cdp = cdpIdx >= 0 ? args.splice(cdpIdx, 2)[1]! : "http://127.0.0.1:9222";
const [placeUrl, listName] = args;
if (!placeUrl) {
  console.error("usage: npm run probe -- '<maps place url>' ['List name'] [--cdp auto]");
  process.exit(1);
}

async function dump(page: Page, label: string) {
  const aria = await page.locator("body").ariaSnapshot().catch((e: Error) => `ariaSnapshot failed: ${e.message}`);
  await fs.writeFile(`${ARTIFACTS}/aria-${label}.yaml`, aria);
  await screenshot(page, label);
  console.log(`  wrote aria-${label}.yaml`);
}

const browser = await connect(cdp);
const page = await browser.contexts()[0]!.newPage();
await fs.mkdir(ARTIFACTS, { recursive: true });
try {
  await page.goto(withHl(placeUrl), { waitUntil: "domcontentloaded" });
  await dismissConsent(page);
  await pause(2000, 3000);
  await dump(page, "1-place");

  await S.saveButton(page).click({ timeout: 8000 });
  await pause(1500, 2000);
  await dump(page, "2-save-dialog");

  // Peek at the "New list" form, then cancel: nothing is typed, created or toggled.
  try {
    await S.newListOption(S.saveDialog(page)).click({ timeout: 5000 });
    await pause(1500, 2000);
    await dump(page, "2b-new-list-form");
    await page.keyboard.press("Escape");
    await pause(500, 900);
  } catch (e) {
    console.error(`  new-list form not reached: ${(e as Error).message}`);
  }
  await page.keyboard.press("Escape"); // nothing is toggled

  await page.goto("https://www.google.com/maps?hl=en", { waitUntil: "domcontentloaded" });
  await pause(2000, 3000);
  await S.menuButton(page).click({ timeout: 8000 });
  await pause(1500, 2000);
  await dump(page, "3-menu");

  await S.savedInMenu(page).click({ timeout: 8000 });
  await pause(2000, 3000);
  await dump(page, "4-saved-panel");

  if (listName) {
    await S.savedListLink(page, listName).click({ timeout: 8000 });
    await pause(2500, 3500);
    await dump(page, "5-list-view");
    console.log(`  list URL: ${page.url()}`);

    // How the executor reads this list (titles, notes, display order):
    const rows = await readList(page);
    await fs.writeFile(`${ARTIFACTS}/rows.json`, JSON.stringify(rows, null, 2));
    console.log(`  read ${rows.length} rows → rows.json`);
    for (const [i, r] of rows.entries()) console.log(`   ${i + 1}. ${r.title}${r.note ? `  — note: ${r.note}` : ""}`);

    // Peek at the icon menu, then the emoji picker behind "Choose icon". Cancel after (nothing is changed).
    // A list without an icon has a "Choose icon" button that opens the picker directly.
    if (await S.chooseIconButton(page).isVisible().catch(() => false)) {
      await S.chooseIconButton(page).click({ timeout: 5000 });
    } else {
      await S.editIconButton(page).click({ timeout: 5000 });
      await pause(1500, 2000);
      await dump(page, "6-icon-menu");
      await S.chooseIconItem(page).click({ timeout: 5000 });
    }
    await pause(1500, 2000);
    await dump(page, "6b-emoji-picker");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  }
} catch (e) {
  console.error(`probe stopped: ${(e as Error).message}`);
  await dump(page, "error");
} finally {
  await page.close().catch(() => {});
  await browser.close();
}
