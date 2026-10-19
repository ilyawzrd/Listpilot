# listpilot

Tell Claude what kind of places you're after, or give it a list you already have. It finds them and
saves them to a Google Maps list in your own Chrome, with a short note for each place.

**Describe** what you want → **Review** the suggestions → **Saved** to your Maps list

## What you need

- A Mac with [Google Chrome](https://www.google.com/chrome/)
- [Claude Code](https://claude.com/claude-code), signed in
- [Node.js](https://nodejs.org/) version 18 or newer

## One-time setup

1. **Download this project**, open the Terminal app in its folder and run `./start.sh`.
   It checks your setup and installs whatever else it needs.
2. **Let your terminal read Chrome's settings.** Open System Settings → Privacy & Security →
   Full Disk Access, and switch on the terminal app you use (for example Terminal or iTerm).
3. **Let Claude use Chrome.** In Chrome, open `chrome://inspect/#remote-debugging` and switch it on.
   You can switch it off again when you're done.

## Make a list

In the project folder, run:

```bash
./start.sh
```

Pick **research places**, then answer five short questions:

```
1/5 What (kind of place + preferences, no city): natural wine bars with food, open late
2/5 Where (city, or neighbourhood + city): Gràcia, Barcelona
3/5 Google Maps list name (new or existing) [Gràcia natural wine bars with]: BCN Wine
4/5 Depth: deep (several minutes, more places) or quick? [deep]
5/5 Model: opus (best research) or sonnet (cheaper)? [opus]
```

Claude researches local guides, press, Telegram channels and Reddit, and skips tourist traps, viral spots
and closed places.
When it's done, a **review page** opens in your browser:

- Tick the places you want and edit their notes. The note is what shows up in Maps.
- Click a place to see why it was picked, what to order and where it was mentioned.
- Places that were filtered out are at the bottom, in case you want some of them back.

Press **Continue**. Claude looks every place up on Google Maps and asks whether to **Apply** (save them
to your list) or do a **Dry run** (just show what would change). Chrome then asks you to **Allow** the
connection. Click it, and Claude saves the places and checks that everything arrived.

**Already have a list of places?** If it's in a text file (`.md`), pick the file option in `./start.sh`
instead. You can drag the file into the terminal window. There's no review page in this mode.

## Good to know

- It never deletes places or lists, and never changes who a list is shared with. If a wrong place
  gets saved, remove it in Maps yourself.
- If a place already has a note, the new note is added after it, not written over it.
- If Claude can't tell for sure which place is meant, it skips it and tells you. It never guesses.
- List names can be at most 40 characters.
- `./start.sh` first asks for your language: English or Русский. In Russian, the questions, the review
  page, Claude's messages and the notes are all in Russian.
- Google Maps in English, Spanish or Russian all work. The language is picked up from your Google account.
- Run it from the Terminal app, not from inside an editor like VS Code. Editors can't reach Chrome's settings.

## If something goes wrong

- **"Connection rejected"**: the Allow prompt in Chrome wasn't clicked. Bring Chrome to the front,
  run it again and click **Allow**.
- **"EPERM"**: your terminal doesn't have Full Disk Access yet (setup step 2). Restart the terminal
  after switching it on.
- **Chrome isn't connected**: Claude opens `chrome://inspect/#remote-debugging` for you. Switch it on
  and tell Claude to continue.

## More details

Running steps by hand, a separate Chrome profile, multiple Google accounts, flags and development:
see [docs/advanced.md](docs/advanced.md).

## License

MIT, see [LICENSE](LICENSE).

listpilot is an unofficial tool, not affiliated with or endorsed by Google. It drives the Google
Maps web UI in your own signed-in browser. Automating Maps may conflict with Google's Terms of
Service, so use it at your own risk and on your own account.
