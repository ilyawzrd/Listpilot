import type { Locator, Page } from "playwright-core";

/**
 * Every Google Maps UI hook lives here, and nowhere else.
 *
 * Maps' CSS classes are obfuscated and rotate, so these use roles, aria-labels and visible
 * text. Everything here matches probe snapshots from Oct 2026, and the write actions (Create, emoji
 * click, note blur) have run end to end with verify passing. Re-run `npm run probe` whenever Maps changes.
 *
 * English UI is assumed. If your Google account shows Maps in Spanish/Russian, either switch
 * it to English (?hl=en is added to every URL we open) or translate the regexes below.
 */
export const S = {
  // ── session ────────────────────────────────────────────────────────────────
  consentRejectAll: (p: Page) => p.getByRole("button", { name: /^Reject all$/i }),
  signInLink: (p: Page) => p.getByRole("link", { name: /^Sign in$/i }),
  /** Verified: button "Google Account: <Name> (<email>)". */
  accountButton: (p: Page) => p.getByRole("button", { name: /^Google Account: / }).first(),

  // ── place page ─────────────────────────────────────────────────────────────
  /** The place's own h1. A place URL opened from a list also shows the list's h1 in a separate
   *  main, so scope to the main holding "Actions for <name>" (verified: two mains on such pages). */
  placeTitle: (p: Page) =>
    p.getByRole("main").filter({ has: p.getByRole("region", { name: /^Actions for / }) })
      .getByRole("heading", { level: 1 }).first(),
  /** Verified on closed places (Oct 2026). The list view shows the same words in the row name. */
  permanentlyClosed: (p: Page) =>
    p.getByRole("main").filter({ has: p.getByRole("region", { name: /^Actions for / }) })
      .getByText("Permanently closed", { exact: true }).first(),
  /** "Save" before saving, "Saved" in one list, "Saved (2)" in several (all verified). Scoped to the action row. */
  saveButton: (p: Page) =>
    p.getByRole("region", { name: /^Actions for / })
      .getByRole("button", { name: /^(Save|Saved)( \(\d+\))?$/i }).first(),

  // ── "Save in your lists" dialog ────────────────────────────────────────────
  // Verified: menu "Save in your lists" > menuitemradio "Example list Private · 7 places" [checked]
  saveDialog: (p: Page) => p.getByRole("menu", { name: "Save in your lists" }),
  /** Item names carry a subtitle ("Private · 7 places", "Shared · 16 places", or just "Private"). */
  listOption: (dialog: Locator, listName: string) =>
    dialog
      .getByRole("menuitemradio", { name: new RegExp(`^${escapeRe(listName)} (Private|Shared|Public)( ·|$)`) })
      .first(),
  newListOption: (dialog: Locator) => dialog.getByRole("button", { name: "New list" }),

  // ── "New list" form (verified: dialog "New list" > textbox "List name" + button "Create") ─
  /** Scoped to the dialog: it comes first in the DOM, so a page-wide .last() hit the place's "Save" behind it. */
  newListDialog: (p: Page) => p.getByRole("dialog", { name: "New list" }),
  newListNameInput: (p: Page) => S.newListDialog(p).getByRole("textbox", { name: "List name" }),
  newListCreateButton: (p: Page) => S.newListDialog(p).getByRole("button", { name: "Create" }),

  // ── navigation to a list (verified) ─────────────────────────────────────────
  /** Saved lists live behind the hamburger: menu "Settings" > menuitem "Saved". */
  menuButton: (p: Page) => p.getByRole("search").getByRole("button", { name: "Menu" }),
  savedInMenu: (p: Page) => p.getByRole("menu", { name: "Settings" }).getByRole("menuitem", { name: "Saved" }),
  /** main "Your places" > tab "Lists" > button "Example list Private · 7 places". */
  savedPanel: (p: Page) => p.getByRole("main", { name: "Your places" }),
  savedListLink: (p: Page, listName: string) =>
    S.savedPanel(p)
      .getByRole("button", { name: new RegExp(`^${escapeRe(listName)} (Private|Shared|Public)( ·|$)`) })
      .first(),

  // ── list view (verified) ───────────────────────────────────────────────────
  /** main (unnamed) holding heading <list>, "Add a place", then flat rows:
   *  button "<title> 4.7 stars …" + (button "Add note" | textbox "Note" with the note). */
  listPanel: (p: Page) => p.getByRole("main").filter({ has: p.getByRole("button", { name: "Add a place" }) }),
  listHeading: (p: Page) => S.listPanel(p).getByRole("heading", { level: 1 }),
  editIconButton: (p: Page) => S.listPanel(p).getByRole("button", { name: "Edit icon" }),
  /** Per-row note controls (verified): button "Add note" (no note yet) or textbox "Note" (holds the note).
   *  Matched through the accessibility tree: a DOM <button> with text "Note" turned out to be a hidden twin. */
  addNoteButtons: (p: Page) => S.listPanel(p).getByRole("button", { name: "Add note", exact: true }),
  noteBoxes: (p: Page) => S.listPanel(p).getByRole("textbox", { name: "Note", exact: true }),
  /** Verified: a list with no icon shows this header button instead of "Edit icon"; it opens the picker. */
  chooseIconButton: (p: Page) => S.listPanel(p).getByRole("button", { name: "Choose icon" }),
  /** Verified: "Edit icon" opens menu > menuitemradio "Choose icon" | "Clear icon". Never click Clear. */
  chooseIconItem: (p: Page) => p.getByRole("menuitemradio", { name: "Choose icon" }),
  /** Verified: dialog "Emoji characters palette" renders every emoji as option "<emoji>" (all categories at once). */
  emojiPicker: (p: Page) => p.getByRole("dialog", { name: "Emoji characters palette" }),
  emojiOption: (p: Page, emoji: string) =>
    S.emojiPicker(p).getByRole("option", { name: emoji, exact: true }).first(),
};

export function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
