# PlaNEWtary Management Plugin Suite

## Project Goal

This project is about writing a new and better version of the "Planetary Management Plugin", a Greasemonkey/Tampermonkey userscript for [Planets.nu](https://planets.nu), a web-based strategy game. The plugin adds planetary management features including map overlays, resource displays, and building management tools.

What we want to do is to rewrite the original script by Dotman as a suite of smaller, maintainable plugins for [Planets.nu](https://planets.nu). The original is very outdated and had lots of issues with the current version of the game web client. We have already fixed the larger part of them in the `_old_references/Planetsnu - PlaNEWtary Management.user.js` file. Still, we want to re-write it now into several, smaller plugins.

## Original Plugin Analysis

The original is a monolithic userscript that mixes:
- UI rendering (jQuery + HTML string building)
- Game logic (tax calculations, building algorithms)
- Canvas drawing (map overlays)
- Data persistence (planets.nu note system)
- Configuration management

All in one 6800-line object literal with no module system.

## Complete Feature Inventory

### 1. Starmap Overlays (18 types)
Text overlays displayed next to planets on the map:

**Minerals (4)**:
- Neutronium: surface / ground / density%
- Duranium: surface / ground / density%
- Tritanium: surface / ground / density%
- Molybdenum: surface / ground / density%

**General (2)**:
- Planet Names + Temperature
- Friendly Codes (color-coded by type)

**Population (4)**:
- Colonists: count / max / growth
- Natives: race + tax value + count / max / growth
- Colonist Tax: method + rate + happiness + change + income
- Native Tax: method + rate + happiness + change + income

**Resources (2)**:
- Supplies: count + combined total
- Megacredits: count + combined total

**Structures (4)**:
- Build Method: assigned method + built this turn
- Factories: count / max + built
- Mines: count / max + built
- Defense Posts: count / max + built

**Starbase (2)**:
- SB Building: ship in queue + components
- SB Tech Levels: hull/engine/beam/torp tech + defense/fighters/damage

### 2. Dashboard Views (5 views)

**PlaNEWtary Management View**:
- Planet list with inline method selectors
- 10 filter types (all, manual only, with natives, without natives, >1M colonists, no build method, no colonist tax, no native tax, completed builds, has starbase, can build starbase)
- Global method application (apply method to all filtered planets)
- One-click execution button

**Planet Detail View**:
- Extended planet information
- "What-if" mining calculations (20/50/100/200 mines scenarios)
- Turns to mine out each mineral

**Build Methods View**:
- List existing methods
- Wizard for creating methods (step-by-step)
- Direct entry with build code syntax
- Remove methods

**Taxation Methods View**:
- List existing methods
- Wizard for creating tax strategies
- Remove methods

**Help View**:
- Documentation text
- Embedded YouTube tutorials
- Reset all methods button

### 3. Planet Predictor
50-turn simulation showing:
- Turns until starbase capability
- Turns until max colonists
- Turns until max natives
- Turns until each mineral mined out
- Turn-by-turn table of projected values

### 4. Automation Systems

**Build Methods** - Custom building rules:
- Syntax: `y-f-14-m-19-d-20` (yes burn supplies, 14 factories, 19 mines, 20 defense)
- Sequential building phases
- Ratio building: `rfm-400-150-7` (up to 400 factories + 150 mines at 7:1 ratio)
- Supply-to-MC conversion toggle

**Tax Methods** - Custom taxation strategies:
- **Growth**: Tax to min happiness, recover to max happiness, repeat
- **Safe**: Maintain happiness at threshold
- **Riot**: (rioting strategy)
- **No Tax**: 0% for maximum growth
- **Auto Tax**: Automatic calculation
- Separate rules for: normal population, >6.6M population, at max population
- Minimum clan threshold before taxing

### 5. Data Persistence
All settings stored in planets.nu's note system via `saveObjectAsNote()`. Survives across sessions and syncs with game data.

### 6. Integration Points

**vgap Plugin API hooks used**:
- `processload`: Initialize plugin, load saved data
- `loaddashboard`: Add menu entry
- `showdashboard`: Clean up map UI
- `showsummary`: Add dashboard icon
- `loadmap`: Map initialization
- `showmap`: Display overlay menu
- `draw`: Render overlays on map
- `loadplanet`: Add controls to planet screen
- `loadstarbase`: Starbase screen hooks
- `loadship`: Ship screen hooks

## Rewrite Plan

### Plugin Architecture

Split into independent userscripts that can be installed separately:

| Plugin | Features | Priority |
|--------|----------|----------|
| `Planet Info Overlay` | All 18 starmap overlays | 1 (start here) |
| `Economy Management` | Dashboard + building + taxation automation | 2 |
| `Planet Predictor` | 50-turn simulation | 3 (optional) |
| `FC Randomizer` | Randomize non-special friendly codes each turn | 4 (small) |

**Why this split:**
- **Planet Info Overlay** is truly standalone - pure visualization, no dependencies
- **Economy Management** combines dashboard, building methods, and taxation methods because they're tightly coupled: the dashboard displays method selectors, methods need the dashboard UI to be configured, and execution happens from the dashboard. Separating these would require complex inter-plugin communication for little benefit.
- **Planet Predictor** could be standalone or bundled with PlaNEWtary Management - it reads planet data but doesn't depend on the automation systems
- **FC Randomizer** is tiny and fully independent — randomizes friendly codes (skipping special codes like NUK, ATT, BUM, DMP, PB*, MF*) using `vgap.randomFC()`. No relation to economy logic.

### Implementation principles

- Make plugin mechanics transparent to the user through the UI
- Always prefer getting dynamically calculated values (max population, tax income, happiness change, ...) through the API. Only re-implement a formula if there's no better option. Never implement fallback calculations, there should be only one source of truth for these things.
- **API discovery**: Claude cannot inspect the game client. When a value might be available through the vgap API, first check the snapshots in `inputs/` (see below), then ask the user to verify in the browser console. Never guess at formulas when an API call might exist.

### Reference Snapshots (in `inputs/`)

- `inputs/vgap-object-snapshot.txt` — Dump of all `vgap` properties and functions with argument counts. Use this to find API functions before asking the user or implementing formulas.
- `inputs/game-css.txt` — All active CSS rules from the game client. Check this when styling plugin UI to understand inherited styles and avoid conflicts (e.g. the game sets `span { display: block }`).

These are static snapshots and may become outdated. When in doubt, ask the user to re-extract or verify in the browser console.

### Code Quality Goals

- Modern JavaScript (ES6+)
- Clear separation of concerns
- Documented vgap API interactions
- Permissive license (MIT or similar)

## Documentation & Tracking Workflow

There are three places where project knowledge lives:

| Location | Purpose | Who edits |
|----------|---------|-----------|
| `CLAUDE.md` | Stable project context (goals, architecture, technical notes) | Both |
| `~/.claude/plans/economy-management-plugin.md` | Implementation plan, open bugs, feature ideas - the single source of truth for "what to do" | Both (Claude asks before editing) |
| `.claude/projects/.../memory/` | Claude's internal implementation knowledge (gotchas, patterns, "how X works") | Claude only |

**Rules:**
- Bugs, missing features, and new ideas go into the **plan file** as `- [ ]` items under the relevant phase.
- Claude's **memory files** are only for implementation knowledge that helps avoid re-learning things across sessions (e.g. API quirks, field semantics). Never for task tracking.
- Claude reads the plan at the start of sessions to know what's open.
- Claude may add newly discovered bugs to the plan, but asks before reorganizing or removing items.
- Claude must **never** check off plan items (`- [x]`) without the user explicitly confirming the change works (e.g. after in-game testing).

## Technical Notes

### vgap Global Object
The game client exposes `vgap` with:
- `vgap.planets`: Array of all planets
- `vgap.myplanets`: Array of owned planets
- `vgap.map`: Map object with `ctx` (canvas), `draw()`, coordinate conversion
- `vgap.player`: Current player info
- `vgap.plugins`: Plugin registry
- `vgap.getStarbase(id)`: Get starbase by planet ID
- `vgap.getPlanet(id)`: Get planet by ID
- Various tax/happiness calculation helpers

### Canvas Overlay Pattern
```javascript
draw: function() {
    var ctx = vgap.map.ctx;
    for (var planet of vgap.planets) {
        if (vgap.map.isVisible(planet.x, planet.y, radius)) {
            var screenX = vgap.map.screenX(planet.x);
            var screenY = vgap.map.screenY(planet.y);
            ctx.fillText(text, screenX, screenY);
        }
    }
}
```

### Data Persistence Pattern
Uses planets.nu's note API - needs investigation for the rewrite.

### Method IDs
Build and tax methods are stored as dicts keyed by stable string IDs (`b1`, `b2`... for build; `t1`, `t2`... for tax). Default methods are copied into game data on first use; after that, the user can edit, rename, or delete any method. New methods (user-created) continue the same numbering. The next available IDs are tracked in a comment above `DEFAULT_BUILD_METHODS` in the source.

### Vanilla Client Automation Features

The planets.nu client has built-in automation features that were introduced after the original plugin was created:

**Auto-Build** (structures):
- User can set target values for factories, mines, defense
- Detection: `planet.targetfactories > 0 || planet.targetmines > 0 || planet.targetdefense > 0`

**Native Auto-Tax**:
- User can enable automatic native taxation with happiness thresholds
- Detection: `planet.nativeautotax != null` (object with `name`, `minhappy`, `maxhappy` properties)

**Colonist Auto-Tax**:
- Does NOT exist in the vanilla UI
- The `planet.colchange` property is used internally but not exposed as a user feature
