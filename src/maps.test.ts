import assert from "node:assert/strict";
import { test } from "node:test";
import { localeFromLang, norm, noteCovered, parseRows, placeId, sameName, sameTitle, titleGroup } from "./maps.js";
import { TEXT } from "./selectors.js";
import { PlanSchema } from "./plan.js";

// Hand-written in the shape of real list-view snapshots (real ones contain the account email).
const SNAPSHOT = `
- heading "Paris" [level=1]
- button "Add a place"
- button "Septime 4.6 stars 2,345 reviews":
  - text: Septime
  - img "4.6 stars"
- textbox "Note": Book 3 weeks ahead
- button "Septime La Cave 4.5 stars":
  - text: Septime La Cave
- button "Add note": Note
- 'button "Le Bistrot: Paul''s 4.4 stars"':
  - text: 'Le Bistrot: Paul''s'
- textbox "Note": 'Ask for: the duck'
- button "Pho 19 Permanently closed"
- button "Add note": Note
- button "Ten Belles 4.3 stars":
  - text: Ten Belles
- textbox "Note"
`;

test("parseRows reads titles, notes and note controls in order", () => {
  assert.deepEqual(parseRows(SNAPSHOT), [
    { title: "Septime", note: "Book 3 weeks ahead", ctrl: "box", nth: 0 },
    { title: "Septime La Cave", note: "", ctrl: "add", nth: 0 },
    { title: "Le Bistrot: Paul's", note: "Ask for: the duck", ctrl: "box", nth: 1 },
    { title: "Pho 19", note: "", ctrl: "add", nth: 1 },
    { title: "Ten Belles", note: "", ctrl: "box", nth: 2 },
  ]);
});

// The same list in the Spanish UI (row shapes from a hl=es probe, Oct 2026).
const SNAPSHOT_ES = `
- heading "Paris" [level=1]
- button "Añadir un sitio"
- button "Septime 4,6 estrellas 2.345 reseñas":
  - text: Septime
- textbox "Nota": Reservar con 3 semanas
- button "Septime La Cave 4,5 estrellas":
  - text: Septime La Cave
- button "Agregar nota": Nota
- button "Pho 19 Cerrado permanentemente"
- button "Añadir nota": Nota
- button "Ten Belles 4,3 estrellas":
  - text: Ten Belles
- textbox "Nota"
`;

test("parseRows reads a Spanish list view with the es table", () => {
  assert.deepEqual(parseRows(SNAPSHOT_ES, TEXT.es), [
    { title: "Septime", note: "Reservar con 3 semanas", ctrl: "box", nth: 0 },
    { title: "Septime La Cave", note: "", ctrl: "add", nth: 0 },
    { title: "Pho 19", note: "", ctrl: "add", nth: 1 },
    { title: "Ten Belles", note: "", ctrl: "box", nth: 1 },
  ]);
  assert.deepEqual(parseRows(SNAPSHOT_ES, TEXT.en), []);
});

// The same list in the Russian UI (row shapes from a hl=ru probe, Oct 2026).
const SNAPSHOT_RU = `
- heading "Москва" [level=1]
- button "Добавить место"
- 'button "Кофемания 4,6-звездочные Отзывов: 2 345"':
  - text: Кофемания
- textbox "Примечание": Бронировать заранее
- button "Кофемания на Покровке 4,5-звездочные":
  - text: Кофемания на Покровке
- button "Добавить примечание": Примечание
- button "Пельменная №1 Закрыто навсегда"
- button "Добавить примечание": Примечание
- button "Ёлки-Палки 4,3-звездочные":
  - text: Ёлки-Палки
- textbox "Примечание"
`;

test("parseRows reads a Russian list view with the ru table", () => {
  assert.deepEqual(parseRows(SNAPSHOT_RU, TEXT.ru), [
    { title: "Кофемания", note: "Бронировать заранее", ctrl: "box", nth: 0 },
    { title: "Кофемания на Покровке", note: "", ctrl: "add", nth: 0 },
    { title: "Пельменная №1", note: "", ctrl: "add", nth: 1 },
    { title: "Ёлки-Палки", note: "", ctrl: "box", nth: 1 },
  ]);
  assert.deepEqual(parseRows(SNAPSHOT_RU, TEXT.en), []);
});

test("localeFromLang maps Maps' <html lang> to a selector table", () => {
  assert.equal(localeFromLang("es"), "es");
  assert.equal(localeFromLang("es-419"), "es");
  assert.equal(localeFromLang("ru"), "ru");
  assert.equal(localeFromLang("ru-RU"), "ru");
  assert.equal(localeFromLang("en-GB"), "en");
  assert.equal(localeFromLang("fr"), "en");
  assert.equal(localeFromLang(null), "en");
});

test("parseRows counts a note control even when its row title wasn't recognised", () => {
  const rows = parseRows(`- button "Add note": Note\n- button "A 4.0 stars":\n  - text: A\n- button "Add note": Note`);
  assert.deepEqual(rows, [{ title: "A", note: "", ctrl: "add", nth: 1 }]);
});

test("norm strips diacritics, case and punctuation", () => {
  assert.equal(norm("  Café-Crème, L'Été! "), "cafe creme l ete");
});

test("sameName is a loose containment match", () => {
  assert.ok(sameName("Din Tai Fung", "Din Tai Fung Xinyi"));
  assert.ok(!sameName("", "x"));
});

test("sameTitle needs equality or a word-boundary prefix", () => {
  assert.ok(sameTitle("Septime", "septime"));
  assert.ok(sameTitle("Septime", "Septime La Cave"));
  assert.ok(!sameTitle("Thai", "Thaiful"));
});

test("titleGroup prefers exact titles over prefix matches", () => {
  const rows = ["Septime La Cave", "Septime", "Septime"].map((title) => ({ title }));
  assert.equal(titleGroup(rows, "Septime", (r) => r.title).length, 2);
  assert.deepEqual(titleGroup(rows, "Septime La Cave", (r) => r.title), [rows[0]]);
});

test("titleGroup fallback can't borrow a row that belongs to another plan entry", () => {
  const rows = [{ title: "Ten Belles" }];
  const get = (r: { title: string }) => r.title;
  assert.deepEqual(titleGroup(rows, "Ten Belles Bread", get), rows);
  assert.deepEqual(titleGroup(rows, "Ten Belles Bread", get, ["Ten Belles", "Ten Belles Bread"]), []);
});

test("placeId extracts the feature id", () => {
  assert.equal(placeId("https://www.google.com/maps/place/X/data=!4m2!3m1!1s0x47e6:0xAB12?hl=en"), "0x47e6:0xAB12");
  assert.equal(placeId("https://www.google.com/maps/place/X/"), undefined);
});

test("PlanSchema validates places and lists", () => {
  const place = { name: "A", url: "https://www.google.com/maps/place/A/" };
  const plan = PlanSchema.parse({ version: 1, lists: [{ name: "L", places: [place] }] });
  assert.equal(plan.lists[0]!.ordered, false);
  const bad = (lists: unknown) => assert.ok(!PlanSchema.safeParse({ version: 1, lists }).success);
  bad([{ name: "L", places: [{ name: "A" }] }]); // neither url nor query
  bad([{ name: "L", places: [{ name: "A", url: "https://example.com/maps/place/A" }] }]);
  bad([{ name: "L", places: [place] }, { name: "L", places: [place] }]); // duplicate list name
  bad([{ name: "Where to Eat & Drink in Los Angeles (October 2026)", places: [place] }]); // > 40 chars
  PlanSchema.parse({ version: 1, lists: [{ name: "x".repeat(40), places: [place] }] });
});

test("noteCovered: skips notes the existing one already says, keeps anything new", () => {
  const tartine = "Morning bun is the thing to order; go mid-morning on a weekday to skip the longest line.";
  assert.equal(noteCovered(tartine, "get the morning bun"), true); // the real duplicate (Oct 2026)
  assert.equal(noteCovered(tartine, "Morning buns!"), true); // plural, punctuation
  assert.equal(noteCovered(tartine, "skip the longest line"), true); // contained
  assert.equal(noteCovered(tartine, "get the croissant"), false); // new information
  assert.equal(noteCovered(tartine, "cash only"), false);
  assert.equal(noteCovered("", "get the morning bun"), false); // no note yet: write it
  assert.equal(noteCovered("Croissant de mantequilla", "croissant de mantequilla"), true); // any language
  // A long note needs the exact text, even if its words appear somewhere.
  assert.equal(noteCovered(tartine, "morning bun line weekday order thing skip longest"), false);
});

test("parseRows: a place without reviews is a bare row, and joins its title group by prefix", () => {
  const snap = [
    '- button "Tartine Manufactory 4.5 stars 4,503 Reviews $20 to $30 Bakery":',
    "  - text: Tartine Manufactory",
    '- textbox "Note": get the morning bun',
    '- button "Tartine Bakery Bakery"',
    '- button "Add note": Note',
    '- button "Tartine Bakery 4.5 stars 5,992 Reviews $10 to $20 Bakery":',
    "  - text: Tartine Bakery",
    '- textbox "Note": Morning bun is the thing to order',
    '- button "Share"',
  ].join("\n");
  const rows = parseRows(snap, TEXT.en);
  assert.deepEqual(rows.map((r) => [r.title, r.note, !!r.bare]), [
    ["Tartine Manufactory", "get the morning bun", false],
    ["Tartine Bakery Bakery", "", true],
    ["Tartine Bakery", "Morning bun is the thing to order", false],
  ]);
  const plan = ["Tartine Bakery", "Tartine Manufactory", "Tartine"];
  assert.deepEqual(titleGroup(rows, "Tartine Bakery", (r) => r.title, plan).map((r) => r.title), ["Tartine Bakery Bakery", "Tartine Bakery"]);
  assert.deepEqual(titleGroup(rows, "Tartine", (r) => r.title, plan).map((r) => r.title), []); // longer title wins
  assert.deepEqual(titleGroup(rows, "Tartine Manufactory", (r) => r.title, plan).length, 1);
});
