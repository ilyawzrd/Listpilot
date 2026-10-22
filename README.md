# maps-lists

Tell Claude what kind of places you're after, or give it a list you already have. It finds them and
saves them to a Google Maps list in your own Chrome, with a short note for each place.

**Describe** what you want → **Review** the suggestions → **Saved** to your Maps list

## What you need

- A Mac with [Google Chrome](https://www.google.com/chrome/)
- [Claude Code](https://claude.com/claude-code), signed in
- [Node.js](https://nodejs.org/) version 18 or newer

## One-time setup

1. **Install the plugin.** Open the Terminal app, run `claude`, and type these two commands:
   ```
   /plugin marketplace add ilyawzrd/maps-lists
   /plugin install maps-lists@maps-lists
   ```
   Then turn on updates: type `/plugin`, open **Marketplaces** → **maps-lists** → **Enable auto-update**.
   New versions then install by themselves (they take effect the next time you start Claude).
2. **Let your terminal read Chrome's settings.** Open System Settings → Privacy & Security →
   Full Disk Access, and switch on the terminal app you use (for example Terminal or iTerm).
3. **Let Claude use Chrome.** In Chrome, open `chrome://inspect/#remote-debugging` and switch it on.
   You can switch it off again when you're done.

## Make a list

Start `claude` in the Terminal app and just ask, in English or Russian:

```
Find natural wine bars with food in Gràcia, Barcelona, open late, and put them on a list "BCN Wine"
```

Or type `/maps-lists:start` and Claude asks what you want: research places for you, or use a file
you already have. It then asks a few short questions (what, where, the list name, deep or quick).

Claude researches local guides, press, Telegram channels and Reddit, and skips tourist traps, viral spots
and closed places.
When it's done, a **review page** opens in your browser:

- Tick the places you want and edit their notes. The note is what shows up in Maps.
- Click a place to see why it was picked, what to order and where it was mentioned.
- Places that were filtered out are at the bottom, in case you want some of them back.

Press **Continue**. Claude looks every place up on Google Maps and asks whether to **Apply** (save them
to your list) or do a **Dry run** (just show what would change). Chrome then asks you to **Allow** the
connection. Click it, and Claude saves the places and checks that everything arrived.

**Already have a list of places?** If it's in a text file (`.md`), say so ("add the places in
~/Downloads/lisbon.md to a Maps list"), or pick the file option in `/maps-lists:start`. You can drag
the file into the terminal window. The same review page opens with the places
from your file, so you can untick some and edit notes before anything goes to Maps.

## Good to know

- It never deletes places or lists, and never changes who a list is shared with. If a wrong place
  gets saved, remove it in Maps yourself.
- If a place already has a note, the new note is added after it, not written over it.
- If Claude can't tell for sure which place is meant, it skips it and tells you. It never guesses.
- List names can be at most 40 characters.
- Everything it writes stays in one folder, `~/.maps-lists` (open it in Finder with Cmd-Shift-G).
  Each list's final places file stays in `research/` there (`*.places.md`), so you can run it again later.
  Other leftover files are removed after a successful save, or after a week if you closed a session midway.
- Write to Claude in Russian and everything is in Russian: the questions, the review page,
  Claude's messages and the notes. No language setting needed.
- Google Maps in English, Spanish or Russian all work. The language is picked up from your Google account.
- Run it from the Terminal app, not from inside an editor like VS Code. Editors can't reach Chrome's settings.

## If something goes wrong

- **"Connection rejected"**: the Allow prompt in Chrome wasn't clicked. Bring Chrome to the front,
  run it again and click **Allow**.
- **Claude asks permission for every `maps-lists` command**: choose "Yes, and don't ask again"
  for it once.
- **"EPERM"**: your terminal doesn't have Full Disk Access yet (setup step 2). Restart the terminal
  after switching it on.
- **Chrome isn't connected**: Claude opens `chrome://inspect/#remote-debugging` for you. Switch it on
  and tell Claude to continue.

## More details

Using it from a downloaded copy of this project (`./start.sh`), running steps by hand, a separate Chrome profile, multiple Google accounts, flags and development:
see [docs/advanced.md](docs/advanced.md).

## License

MIT, see [LICENSE](LICENSE).

maps-lists is an unofficial tool, not affiliated with or endorsed by Google. It drives the Google
Maps web UI in your own signed-in browser. Automating Maps may conflict with Google's Terms of
Service, so use it at your own risk and on your own account.
