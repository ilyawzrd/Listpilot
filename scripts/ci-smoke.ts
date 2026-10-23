/**
 * CI smoke run (.github/workflows/test.yml): what a new user's first minute needs on each OS,
 * without a Google sign-in. Expects the separate Chrome from `maps-lists chrome` on CDP_PORT, then
 * connects the way the executor does and opens one place page through openPlace.
 *
 *   CDP_PORT=9333 tsx scripts/ci-smoke.ts
 */
import { connect } from "../src/connect.js";
import { openPlace } from "../src/maps.js";
import { S } from "../src/selectors.js";

// Tartine Bakery, San Francisco: open since 2002, so its page should stay put.
const PLACE = {
  name: "Tartine Bakery",
  url: "https://www.google.com/maps/place/Tartine+Bakery/data=!4m2!3m1!1s0x808f7e1807365605:0x601f7a97f0ce6c6b",
};

const browser = await connect(`http://127.0.0.1:${process.env.CDP_PORT ?? "9333"}`);
const page = await browser.contexts()[0]!.newPage();
try {
  const r = await openPlace(page, PLACE);
  if (!r.ok) throw new Error(`openPlace: ${r.reason}`);
  if (!r.title.includes(PLACE.name)) throw new Error(`title is "${r.title}", expected ${PLACE.name}`);
  await S.saveButton(page).waitFor({ timeout: 8000 });
  console.log(`ok: "${r.title}" opened, Save button found`);
} catch (e) {
  await page.screenshot({ path: "ci-smoke-fail.png" }).catch(() => {});
  console.error(`smoke failed: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
