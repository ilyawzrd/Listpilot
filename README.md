# maps-lists

Tell Claude what kind of places you're after, or give it a list you already have. It finds them and
saves them to a Google Maps list in your own Chrome, with a short note for each place.

**Describe** what you want → **Review** the suggestions → **Saved** to your Maps list

## What you need

- A Mac, Windows or Linux computer with [Google Chrome](https://www.google.com/chrome/) installed. It doesn't have to be your default
  browser or the one you use: if you browse with Safari or Firefox, Claude uses a Chrome window just for
  maps-lists (sign into Google there once), and your lists show up in any browser and on your phone.
- [Claude Code](https://claude.com/claude-code), signed in
- [Node.js](https://nodejs.org/) version 18 or newer. If it's missing, Claude offers to install it
  the first time (with Homebrew on a Mac, winget on Windows).

## Install

Open a terminal (Terminal on a Mac, PowerShell or Windows Terminal on Windows), run `claude`, and type:

```
/plugin marketplace add ilyawzrd/maps-lists
/plugin install maps-lists@maps-lists
```

Then turn on updates: type `/plugin`, open **Marketplaces** → **maps-lists** → **Enable auto-update**.
New versions then install by themselves and take effect the next time you start Claude.

That's all. Chrome needs a switch or two before Claude can save to Maps, and Claude walks you
through them the first time:

- **Chrome's remote debugging:** Claude opens `chrome://inspect/#remote-debugging`; you switch it on.
  You can switch it off again when you're done.
- **On a Mac only, Full Disk Access for your terminal app**, so Claude can find Chrome's connection details. Claude
  opens the right page in System Settings and tells you which app to switch on. Then quit the terminal
  completely (Cmd-Q, or macOS's **Quit & Reopen**), open it again, start `claude` and type
  `/maps-lists:run` to pick up where you left off.

### Using the Claude desktop app

The plugin also works in the **Code** tab of the Claude desktop app: install it there the same way, or
just use it, since the desktop app and the terminal share installed plugins. Start a session on your
Mac (not a cloud one).

On a Mac, the one difference is connecting to Chrome. macOS doesn't give the desktop app's Claude Code the
access it needs to use your normal Chrome, so the first time Claude offers:

- **A separate Chrome window (recommended):** Chrome opens a window just for maps-lists. Sign into
  Google there once, and it's remembered; your lists still go to your usual account and show up
  everywhere.
- **Your normal Chrome:** Claude shows you a path to add under Full Disk Access. This works, but has to
  be redone each time Claude Code updates, and switching on "Claude" alone isn't enough.
- **Running the Chrome step from the Terminal app** instead.

## Make a list

Start `claude` in your terminal and just ask, in any language:

```
Find natural wine bars with food in Gràcia, Barcelona, open late, and put them on a list "BCN Wine"
```

Or type `/maps-lists:start` and Claude asks what you want: research places for you, or use a file
you already have.

Before researching, Claude asks two things, with what each choice costs:

- **Deep or quick:** deep sends several research agents out at once (5–10 minutes, more places);
  quick is one pass (1–2 minutes, fewer places, much cheaper).
- **Which model:** keep the one you're on, or switch. Opus is the best at judging sources but uses
  your limits faster; Sonnet is cheaper and faster. To switch, Claude tells you to type
  `/model opus` (or `sonnet`) and say "continue".

Claude researches local guides, press, Telegram channels and Reddit. Famous places that locals still
rate stay in, marked as classics; tourist traps, viral spots and closed places are filtered out. Say
"include hidden gems" for more lesser-known places alongside a few classics, or "hidden gems only"
to leave the classics out.

When it's done, a **review page** opens in your browser:

- Everything starts ticked: untick what you don't want (the name is struck through) and edit any
  note. The note is what shows up in Maps; **Undo your edit** brings back Claude's.
- **Why it's here** under a place shows why it was picked, what to order and where it was mentioned.
- Each category folds open and closed and shows how many you kept; **Jump to** on the side (at the
  top on a phone) takes you between them.
- **Left out**, at the end, lists the places Claude filtered out with the reason (tourist trap,
  viral, closed…), in case you want some back.
- Nothing is saved yet. **Stop, don't save** ends it there.

Press **Continue**. Claude looks every place up on Google Maps, shows what it found, and asks
**Save to Maps** or **Stop**. Chrome then asks you to **Allow** the connection. Click it, and Claude
saves the places and checks that everything arrived.

**Just one or two places?** Name them: "add Mr. Holmes Bakehouse in San Francisco to my SF list".
Claude looks them up and saves them straight away, with no review page and no Save question. If a
name matches several places, it asks which one, with "all of them" as an option; add "with the note: …" to give it a note.

**Already have a list of places?** Type your request and drag the file into the terminal window
(dropping a file there pastes its location), for example:

```
Add the places in ~/Downloads/lisbon.pdf to my list "Lisbon Eats"
```

It can be a text or Markdown file, a PDF, a Word document, a saved web page or email, or a
screenshot. You can also paste the list straight into the chat. The same review page opens with the
places it found, so you can untick some and edit notes before anything goes to Maps. Your notes stay
in the language they're written in; ask if you want them translated. An existing list name adds to
that list; nothing already in it is removed.

## Your lists and files

Ask "what lists have I made?" or "show me my San Francisco list" (or type `/maps-lists:lists`). Claude
shows each list with a link to open it in Google Maps, and the places and notes you saved.

Everything is kept in one folder, `.maps-lists` in your home folder (ask Claude to "open the
folder"; on a Mac you can also press Cmd-Shift-G in Finder and type `~/.maps-lists`). Each list's places stay in `research/` there as a `*.places.md` file, so you
can share it or run it again later. Other leftover files are removed after a successful save, or after
a week if you closed a session midway.

## Good to know

- While it works, Clawd walks above the prompt with a map, and the spinner line says what's
  happening (researching, waiting for you on the review page, saving 4/12…).
- It never deletes places or lists, and never changes who a list is shared with. If a wrong place
  gets saved, remove it in Maps yourself.
- If a place already has a note, the new note is added after it, not written over it. A short note
  that only repeats what's already there is left out, and the report says so.
- If Claude can't tell for sure which place is meant, it skips it and tells you. It never guesses.
- List names can be at most 40 characters.
- Write to Claude in your language (Spanish, Catalan, Russian, Japanese…) and everything you read is
  in it: the questions, the review page, Claude's messages and the notes. No language setting needed.
- Your Google Maps can be in any language. Saving works best when your Google account is set to English,
  Spanish or Russian; with any other, Claude opens Maps in English for its own visit, and your list
  still shows up in your language.
- On a Mac, run it from the Terminal app or the Claude desktop app's Code tab, not from inside an
  editor like VS Code. Editors there can't reach Chrome's settings.

- The first research asks whether you have a Reddit account. You don't need one: without it,
  Claude still sees Reddit through search results. With one (signed in at reddit.com in your
  browser), it installs a small Reddit reader and reads whole threads (on a Mac, macOS asks once to allow
  "Chrome Safe Storage"). Either way it only reads Reddit, never posts or votes.

## If something goes wrong

- **"Connection rejected"**: the Allow prompt in Chrome wasn't clicked. Bring Chrome to the front,
  run it again and click **Allow**.
- **Claude asks permission for every `maps-lists` command**: choose "Yes, and don't ask again"
  for it once.
- **"EPERM" or "Operation not permitted"** (Mac): the app Claude runs in doesn't have Full Disk Access yet.
  Claude offers to open the setting; after switching it on, quit the app with Cmd-Q and reopen it. In
  the Claude desktop app, see "Using the Claude desktop app" above.
- **Chrome isn't connected**: Claude opens `chrome://inspect/#remote-debugging` for you. Switch it on
  and tell Claude to continue.

## More details

Options you can add, a separate Chrome profile, several Google accounts, and working on the code:
see [docs/advanced.md](docs/advanced.md).

## License

MIT, see [LICENSE](LICENSE).

maps-lists is an unofficial tool, not affiliated with or endorsed by Google. It drives the Google
Maps web UI in your own signed-in browser. Automating Maps may conflict with Google's Terms of
Service, so use it at your own risk and on your own account.
