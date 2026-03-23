# Reference Snapshots

These files are local reference snapshots of the live Planets.nu game client. They are gitignored, but you can easily add them yourself in order to make them
available for Claude Code (or other coding agents).

## Files

### `vgap-object-snapshot.txt`
A dump of all `vgap` properties and functions with argument counts. Used to discover available API functions before asking the user or implementing formulas manually.

**How to extract:** In the browser console on any game page, type `vgap`, then right-click the output object and select "Copy object".

### `game-css.txt`
All active CSS rules from the game client. Used when styling plugin UI to understand inherited styles and avoid conflicts (e.g. the game sets `span { display: block }`).

**How to extract:** In the browser console, type `document.styleSheets`, then right-click and "Copy object".

### `nudata.json`
Full dump of the `nudata` global object. Contains game data definitions: native types, native governments, player races, hull specs, advantages, and UI strings.

**How to extract:** In the browser console on any game page, type `nudata`, then right-click the output object and select "Copy object".
