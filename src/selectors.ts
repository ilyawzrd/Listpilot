import type { Locator, Page } from "playwright-core";

/**
 * Every Google Maps UI hook lives here, and nowhere else.
 *
 * Maps' CSS classes are obfuscated and rotate, so these use roles, aria-labels and visible
 * text. The English names match probe snapshots from Oct 2026, and the write actions (Create, emoji
 * click, note blur) have run end to end with verify passing. Re-run `npm run probe` whenever Maps changes.
 *
 * The UI language is detected when Maps first opens (`detectLanguage` in maps.ts), then `setLocale`
 * picks the matching table below. Spanish names cover both es-ES and es-419 wording; Russian names
 * are from a hl=ru probe.
 */
export type Locale = "en" | "es" | "ru";

type Name = string | RegExp;
type Text = {
  rejectAll: RegExp; signIn: RegExp; account: RegExp;
  actionsFor: RegExp; permanentlyClosed: Name; save: RegExp;
  saveDialog: Name; listSuffix: string; newList: Name; newListDialog: Name; listName: Name; create: Name;
  menu: Name; settings: Name; saved: Name; yourPlaces: Name;
  addPlace: Name; editIcon: Name; addNote: RegExp; note: RegExp; chooseIcon: Name; emojiPalette: Name;
  /** Lines of the list view's ARIA snapshot, for parseRows. */
  rowAddNote: RegExp; rowNote: RegExp; rowClosed: RegExp;
  /** A selected row's "Delete" button (matched only to skip it while parsing; never clicked). */
  rowDelete: RegExp;
};

// Never-click names: "Delete" / "Удалить" (row, on hover) and "Clear icon" / "Borrar icono" /
// "Удалить значок" (icon menu).
export const TEXT: Record<Locale, Text> = {
  en: {
    // The consent page follows the browser's language, not the account's, so both are matched.
    rejectAll: /^(Reject all|Rechazar todo|Отклонить все)$/i,
    signIn: /^Sign in$/i,
    /** Verified: button "Google Account: <Name> (<email>)". */
    account: /^Google Account: /,
    actionsFor: /^Actions for /,
    /** Verified on closed places (Oct 2026). The list view shows the same words in the row name. */
    permanentlyClosed: "Permanently closed",
    /** "Save" before saving, "Saved" in one list, "Saved (2)" in several (all verified). */
    save: /^(Save|Saved)( \(\d+\))?$/i,
    saveDialog: "Save in your lists",
    /** After the list name: "Private · 7 places", "Shared · 16 places", or just "Private". */
    listSuffix: "(Private|Shared|Public)( ·|$)",
    newList: "New list",
    newListDialog: "New list",
    listName: "List name",
    create: "Create",
    menu: "Menu",
    settings: "Settings",
    saved: "Saved",
    yourPlaces: "Your places",
    addPlace: "Add a place",
    editIcon: "Edit icon",
    addNote: /^Add note$/,
    note: /^Note$/,
    chooseIcon: "Choose icon",
    emojiPalette: "Emoji characters palette",
    rowAddNote: /^button "Add note"/,
    rowNote: /^textbox "Note"(?::|$)/,
    rowClosed: /^button "(.+) (?:Permanently|Temporarily) closed"$/,
    rowDelete: /^button "Delete"$/,
  },
  // Probe with hl=es (Oct 2026) verified the rest; ui-check (Oct 2026) saw signIn and permanentlyClosed.
  // Still best guesses: rowClosed (a closed place's list row), save's "Guardado (N)" (an already-saved place).
  // An apply with hl=es (create, save, "Añadir nota", icon, hard-reload verify) passed end to end.
  // Never click "Borrar icono" (= Clear icon).
  es: {
    rejectAll: /^(Reject all|Rechazar todo|Отклонить все)$/i,
    signIn: /^Iniciar sesión$/i,
    account: /^Cuenta de Google: /,
    actionsFor: /^Acciones para /,
    permanentlyClosed: /^Cerrado permanentemente$/i,
    save: /^(Guardar|Guardado|Guardada)( \(\d+\))?$/i,
    saveDialog: /^Guardar en tus listas$/,
    /** Verified: "Lista privada·71 sitios", "Compartida·183 sitios", "Lista privada" (no space before ·). */
    listSuffix: "(Lista privada|Lista pública|Compartida|Pública)( ?·|$)",
    newList: /^Nueva lista$/,
    newListDialog: /^Nueva lista$/,
    listName: /^Nombre de la lista$/, // prefilled "Lista sin título"
    create: /^Crear$/,
    menu: /^Menú$/,
    settings: /^Configuración$/,
    saved: /^Guardado$/,
    yourPlaces: /^Tus sitios$/,
    addPlace: /^Añadir un sitio$/,
    editIcon: /^Editar icono$/,
    addNote: /^(Añadir|Agregar) (una )?nota$/,
    note: /^Nota$/,
    chooseIcon: /^Elegir icono$/,
    // Verified: the picker stays English under hl=es (it follows Chrome's language), so match both.
    emojiPalette: /^(Emoji characters palette|Paleta de (caracteres )?emoji)/i,
    rowAddNote: /^button "(?:Añadir|Agregar) (?:una )?nota"/,
    rowNote: /^textbox "Nota"(?::|$)/,
    rowClosed: /^button "(.+) Cerrad[oa] (?:permanentemente|temporalmente)"$/,
    rowDelete: /^button "Eliminar"$/, // unverified
  },
  // Probe with hl=ru (Oct 2026) verified the rest; ui-check (Oct 2026) saw signIn and permanentlyClosed.
  // Still best guesses: rowClosed (a closed place's list row), save's "Сохранено (N)" (an already-saved place).
  // An apply with hl=ru (create, save, "Добавить примечание", icon, hard-reload verify) passed end to end.
  // Never click "Удалить" (row) or "Удалить значок" (= Clear icon).
  ru: {
    rejectAll: /^(Reject all|Rechazar todo|Отклонить все)$/i,
    signIn: /^Войти$/i,
    account: /^Аккаунт Google: /,
    /** Verified: region "Действия для места \"<name>\"". */
    actionsFor: /^Действия для места /,
    permanentlyClosed: /^Закрыто навсегда$/i,
    save: /^(Сохранить|Сохранено|Сохранен[оа]?)( \(\d+\))?$/i,
    saveDialog: /^Сохранить в списках$/i,
    /** Verified: "Личный·577 мест", "В совместном доступе·16 мест", "Личный". Only the privacy word is
     *  matched, because the count's plural varies (место / места / мест). Public is a guess. */
    listSuffix: "(Личный|В совместном доступе|Общедоступный|Открытый)( ?·|$)",
    newList: /^Новый список$/i,
    newListDialog: /^Новый список$/i,
    listName: /^Название списка$/i, // prefilled "Список без названия"
    create: /^Создать$/i,
    menu: /^Меню$/i,
    settings: /^Настройки$/i,
    saved: /^Сохранено$/i, // menuitem in the "Настройки" menu
    yourPlaces: /^Мои места$/i,
    addPlace: /^Добавить место$/i,
    editIcon: /^Изменить значок$/i,
    addNote: /^Добавить (примечание|заметку)$/i,
    note: /^Примечание$/i,
    chooseIcon: /^Выбрать значок$/i,
    // Verified: the picker stays English under hl=ru too (it follows Chrome's language), so match both.
    emojiPalette: /^(Emoji characters palette|Палитра (символов )?эмодзи)/i,
    rowAddNote: /^button "Добавить (?:примечание|заметку)"/,
    rowNote: /^textbox "Примечание"(?::|$)/,
    rowClosed: /^button "(.+) Закрыто (?:навсегда|временно)"$/,
    rowDelete: /^button "Удалить"$/,
  },
};

let current: Locale = "en";
export const setLocale = (l: Locale) => { current = l; };
export const locale = () => current;
const t = () => TEXT[current];

export const S = {
  // ── session ────────────────────────────────────────────────────────────────
  consentRejectAll: (p: Page) => p.getByRole("button", { name: t().rejectAll }),
  signInLink: (p: Page) => p.getByRole("link", { name: t().signIn }),
  accountButton: (p: Page) => p.getByRole("button", { name: t().account }).first(),

  // ── place page ─────────────────────────────────────────────────────────────
  /** The place's own h1. A place URL opened from a list also shows the list's h1 in a separate
   *  main, so scope to the main holding "Actions for <name>" (verified: two mains on such pages). */
  placeTitle: (p: Page) =>
    p.getByRole("main").filter({ has: p.getByRole("region", { name: t().actionsFor }) })
      .getByRole("heading", { level: 1 }).first(),
  permanentlyClosed: (p: Page) =>
    p.getByRole("main").filter({ has: p.getByRole("region", { name: t().actionsFor }) })
      .getByText(t().permanentlyClosed, { exact: true }).first(),
  /** Scoped to the action row. */
  saveButton: (p: Page) =>
    p.getByRole("region", { name: t().actionsFor })
      .getByRole("button", { name: t().save }).first(),

  // ── "Save in your lists" dialog ────────────────────────────────────────────
  // Verified: menu "Save in your lists" > menuitemradio "Example list Private · 7 places" [checked]
  saveDialog: (p: Page) => p.getByRole("menu", { name: t().saveDialog }),
  /** Item names carry a subtitle ("Private · 7 places", "Shared · 16 places", or just "Private"). */
  listOption: (dialog: Locator, listName: string) =>
    dialog.getByRole("menuitemradio", { name: listNameRe(listName) }).first(),
  newListOption: (dialog: Locator) => dialog.getByRole("button", { name: t().newList }),

  // ── "New list" form (verified: dialog "New list" > textbox "List name" + button "Create") ─
  /** Scoped to the dialog: it comes first in the DOM, so a page-wide .last() hit the place's "Save" behind it. */
  newListDialog: (p: Page) => p.getByRole("dialog", { name: t().newListDialog }),
  newListNameInput: (p: Page) => S.newListDialog(p).getByRole("textbox", { name: t().listName }),
  newListCreateButton: (p: Page) => S.newListDialog(p).getByRole("button", { name: t().create }),

  // ── navigation to a list (verified) ─────────────────────────────────────────
  /** Saved lists live behind the hamburger: menu "Settings" > menuitem "Saved". */
  menuButton: (p: Page) => p.getByRole("search").getByRole("button", { name: t().menu }),
  savedInMenu: (p: Page) => p.getByRole("menu", { name: t().settings }).getByRole("menuitem", { name: t().saved }),
  /** main "Your places" > tab "Lists" > button "Example list Private · 7 places". */
  savedPanel: (p: Page) => p.getByRole("main", { name: t().yourPlaces }),
  savedListLink: (p: Page, listName: string) =>
    S.savedPanel(p).getByRole("button", { name: listNameRe(listName) }).first(),

  // ── list view (verified) ───────────────────────────────────────────────────
  /** main (unnamed) holding heading <list>, "Add a place", then flat rows:
   *  button "<title> 4.7 stars …" + (button "Add note" | textbox "Note" with the note). */
  listPanel: (p: Page) => p.getByRole("main").filter({ has: p.getByRole("button", { name: t().addPlace }) }),
  listHeading: (p: Page) => S.listPanel(p).getByRole("heading", { level: 1 }),
  editIconButton: (p: Page) => S.listPanel(p).getByRole("button", { name: t().editIcon }),
  /** Per-row note controls (verified): button "Add note" (no note yet) or textbox "Note" (holds the note).
   *  Matched through the accessibility tree: a DOM <button> with text "Note" turned out to be a hidden twin. */
  addNoteButtons: (p: Page) => S.listPanel(p).getByRole("button", { name: t().addNote }),
  noteBoxes: (p: Page) => S.listPanel(p).getByRole("textbox", { name: t().note }),
  /** Verified: a list with no icon shows this header button instead of "Edit icon"; it opens the picker. */
  chooseIconButton: (p: Page) => S.listPanel(p).getByRole("button", { name: t().chooseIcon }),
  /** Verified: "Edit icon" opens menu > menuitemradio "Choose icon" | "Clear icon". Never click Clear. */
  chooseIconItem: (p: Page) => p.getByRole("menuitemradio", { name: t().chooseIcon }),
  /** Verified: dialog "Emoji characters palette" renders every emoji as option "<emoji>" (all categories at once). */
  emojiPicker: (p: Page) => p.getByRole("dialog", { name: t().emojiPalette }),
  emojiOption: (p: Page, emoji: string) =>
    S.emojiPicker(p).getByRole("option", { name: emoji, exact: true }).first(),
};

const listNameRe = (listName: string) =>
  new RegExp(`^${escapeRe(listName)} ${t().listSuffix}`);

export function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
