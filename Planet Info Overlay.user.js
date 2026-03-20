// ==UserScript==
// @name         Planets.nu - Planet Info Overlay
// @namespace    https://planets.nu/
// @version      1.0.0
// @description  Starmap overlays for Planets.nu - displays mineral, population, tax, structure, and starbase information
// @author       Leince (rewrite), Original concept by Dotman
// @match        https://planets.nu/*
// @match        https://play.planets.nu/*
// @match        https://test.planets.nu/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================================
    // CONSTANTS & CONFIGURATION
    // =========================================================================

    const PLUGIN_NAME = 'planetInfoOverlay';
    const PLUGIN_VERSION = '1.0.0';

    // Overlay type definitions with metadata
    const OVERLAY_TYPES = {
        // Minerals (0-3)
        NEUTRONIUM:   { id: 0,  label: 'N',  name: 'Neutronium',     category: 'minerals' },
        DURANIUM:     { id: 1,  label: 'D',  name: 'Duranium',       category: 'minerals' },
        TRITANIUM:    { id: 2,  label: 'T',  name: 'Tritanium',      category: 'minerals' },
        MOLYBDENUM:   { id: 3,  label: 'M',  name: 'Molybdenum',     category: 'minerals' },
        // General (4-5)
        PLANET_NAMES: { id: 4,  label: 'P',  name: 'Planet Names',   category: 'general' },
        FRIENDLY_CODE:{ id: 5,  label: 'FC', name: 'Friendly Codes', category: 'general' },
        // Population (6-9)
        COLONISTS:    { id: 6,  label: 'C',  name: 'Colonists',      category: 'population' },
        NATIVES:      { id: 7,  label: 'N',  name: 'Natives',        category: 'population' },
        COLONIST_TAX: { id: 8,  label: 'CT', name: 'Colonist Tax',   category: 'population' },
        NATIVE_TAX:   { id: 9,  label: 'NT', name: 'Native Tax',     category: 'population' },
        // Resources (10-11)
        SUPPLIES:     { id: 10, label: 'S',  name: 'Supplies',       category: 'resources' },
        MEGACREDITS:  { id: 11, label: 'MC', name: 'Megacredits',    category: 'resources' },
        // Structures (12-15)
        BUILD_METHOD: { id: 12, label: 'BM', name: 'Build Method',   category: 'structures' },
        FACTORIES:    { id: 13, label: 'F',  name: 'Factories',      category: 'structures' },
        MINES:        { id: 14, label: 'Mi', name: 'Mines',          category: 'structures' },
        DEFENSE:      { id: 15, label: 'DP', name: 'Defense Posts',  category: 'structures' },
        // Starbase (16-17)
        SB_BUILDING:  { id: 16, label: 'SB', name: 'SB Building',    category: 'starbase' },
        SB_TECH:      { id: 17, label: 'ST', name: 'SB Tech',        category: 'starbase' }
    };

    const OVERLAY_COUNT = 18;

    // Category colors for UI buttons
    const CATEGORY_COLORS = {
        minerals:   { normal: '#99dddd', hover: '#ffffff' },
        general:    { normal: '#ddaa77', hover: '#ffffff' },
        population: { normal: '#77dd77', hover: '#ffffff' },
        resources:  { normal: '#dddd77', hover: '#ffffff' },
        structures: { normal: '#dd7777', hover: '#ffffff' },
        starbase:   { normal: '#aa77dd', hover: '#ffffff' }
    };

    // Color thresholds for value-based coloring
    const COLORS = {
        GOOD: '#00FF00',
        WARN: '#FFFF00',
        BAD: '#F62817',
        ORANGE: '#FF6600',
        WHITE: '#FFFFFF',
        CYAN: '#00FFFF',
        MAGENTA: '#FF00FF',
        ORCHID: '#DA70D6',
        AQUA: '#00FFFF'
    };

    // =========================================================================
    // UTILITY FUNCTIONS
    // =========================================================================

    /**
     * Format number with thousands separators
     */
    function formatNumber(num) {
        if (num === null || num === undefined) return '0';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /**
     * Get color based on mineral surface amount
     */
    function getMineralSurfaceColor(amount) {
        if (amount > 500) return COLORS.GOOD;
        if (amount > 50) return COLORS.WARN;
        return COLORS.BAD;
    }

    /**
     * Get color based on mineral ground amount
     */
    function getMineralGroundColor(amount) {
        if (amount > 800) return COLORS.GOOD;
        if (amount > 400) return COLORS.WARN;
        return COLORS.BAD;
    }

    /**
     * Get color based on mineral density percentage
     */
    function getMineralDensityColor(density) {
        if (density > 75) return COLORS.GOOD;
        if (density > 25) return COLORS.WARN;
        return COLORS.BAD;
    }

    /**
     * Get color based on population growth
     */
    function getGrowthColor(growth, current, max) {
        if (growth < 0) return COLORS.BAD;
        if (current > max) return COLORS.ORANGE;
        return COLORS.GOOD;
    }

    /**
     * Get happiness change indicator symbol and color
     */
    function getHappinessIndicator(change) {
        if (change > 0) return { symbol: '▲', color: COLORS.GOOD };
        if (change < 0) return { symbol: '▼', color: COLORS.BAD };
        return { symbol: '►', color: COLORS.WARN };
    }

    /**
     * Get temperature color (blue=cold, green=optimal, red=hot)
     */
    function getTemperatureColor(temp) {
        const r = temp > 50 ? Math.min(255, (temp - 50) * 5) : 0;
        const g = 255 - Math.abs(temp - 50) * 5;
        const b = temp < 50 ? Math.min(255, (50 - temp) * 5) : 0;
        return `rgb(${Math.max(0, r)}, ${Math.max(0, Math.min(255, g))}, ${Math.max(0, b)})`;
    }

    /**
     * Get native race name
     */
    function getNativeRaceName(raceId) {
        const races = [
            'None', 'Humanoid', 'Bovinoid', 'Reptilian', 'Avian',
            'Amorphous', 'Insectoid', 'Amphibian', 'Ghipsoldal', 'Siliconoid'
        ];
        return races[raceId] || 'Unknown';
    }

    /**
     * Get native government name
     */
    function getNativeGovernmentName(govId) {
        const governments = [
            'None', 'Anarchy', 'Pre-Tribal', 'Early Tribal', 'Tribal',
            'Feudal', 'Monarchy', 'Representative', 'Participatory', 'Unity'
        ];
        return governments[govId] || 'Unknown';
    }

    /**
     * Get maximum colonist population for a planet (returns colonists, not clans)
     */
    function getMaxColonists(planet) {
        if (!planet || planet.temp === undefined) return 0;
        return vgap.colMaxPop(planet) * 100;
    }

    /**
     * Get maximum native population for a planet (returns population, not clans)
     */
    function getMaxNatives(planet) {
        if (!planet || !planet.nativeclans) return 0;
        return vgap.nativeMaxPop(planet) * 1000;
    }

    /**
     * Calculate colonist population growth per turn
     */
    function getColonistGrowth(planet) {
        if (!planet || !planet.clans) return 0;

        const temp = planet.temp;
        const clans = planet.clans;
        const maxClans = getMaxColonists(planet) / 100;

        // No growth if over max or unhappy
        if (clans >= maxClans || planet.colonisthappypoints < 70) {
            return clans >= maxClans ? 0 : -Math.floor(clans * 0.1);
        }

        // Temperature-based growth rate
        let growthRate;
        if (temp >= 50) {
            growthRate = Math.max(0, (100 - temp) / 100);
        } else {
            growthRate = Math.max(0, temp / 100);
        }

        // Crystalline race adjustment
        if (vgap.player && vgap.player.raceid === 7) {
            growthRate = Math.max(0, temp / 100);
        }

        const growth = Math.round(clans * growthRate * 0.05);
        return Math.min(growth, maxClans - clans);
    }

    /**
     * Calculate native population growth per turn
     */
    function getNativeGrowth(planet) {
        if (!planet || !planet.nativeclans || planet.nativetype === 0) return 0;

        const clans = planet.nativeclans;
        const maxClans = getMaxNatives(planet) / 1000;
        const govFactor = planet.nativegovernment || 1;

        // No growth if over max or unhappy
        if (clans >= maxClans || planet.nativehappypoints < 70) {
            return clans >= maxClans ? 0 : -Math.floor(clans * 0.1);
        }

        const growth = Math.round(clans * govFactor / 25);
        return Math.min(growth, maxClans - clans);
    }

    /**
     * Calculate tax income from colonists
     */
    function getColonistTaxIncome(planet) {
        if (!planet || !planet.clans) return 0;
        const taxRate = planet.colonisttaxrate || 0;
        return Math.floor(planet.clans * taxRate / 1000);
    }

    /**
     * Calculate tax income from natives
     */
    function getNativeTaxIncome(planet) {
        if (!planet || !planet.nativeclans || planet.nativetype === 0) return 0;
        if (planet.nativetype === 5) return 0; // Amorphous don't pay taxes

        const taxRate = planet.nativetaxrate || 0;
        const govFactor = planet.nativegovernment || 1;
        const clans = Math.min(planet.clans, planet.nativeclans);

        return Math.floor(clans * taxRate * govFactor / 1000);
    }

    /**
     * Calculate happiness change from tax rate
     */
    function getColonistHappinessChange(planet) {
        if (!planet) return 0;

        const taxRate = planet.colonisttaxrate || 0;
        const mines = planet.mines || 0;
        const factories = planet.factories || 0;

        // Base change from tax
        let change = Math.floor(10 - Math.sqrt(taxRate));

        // Industrial penalty
        change -= Math.floor((mines + factories) / 200);

        return change;
    }

    /**
     * Calculate native happiness change from tax rate
     */
    function getNativeHappinessChange(planet) {
        if (!planet || !planet.nativeclans) return 0;

        const taxRate = planet.nativetaxrate || 0;
        const mines = planet.mines || 0;
        const factories = planet.factories || 0;

        // Base change from tax
        let change = Math.floor(10 - Math.sqrt(taxRate));

        // Industrial penalty
        change -= Math.floor((mines + factories) / 200);

        return change;
    }

    /**
     * Calculate max structures of a type
     */
    function getMaxStructures(planet) {
        if (!planet || !planet.clans) return 0;
        return Math.min(planet.clans, 500);
    }

    /**
     * Create SVG icon data URI
     */
    function createIconSvg(text, color) {
        const fontSize = text.length > 2 ? 14 : (text.length > 1 ? 18 : 24);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 50 50">
            <circle cx="25" cy="25" r="23" fill="${color}"/>
            <text x="25" y="33" text-anchor="middle" font-size="${fontSize}" fill="white" font-weight="bold">${text}</text>
        </svg>`;
        return 'data:image/svg+xml,' + encodeURIComponent(svg);
    }

    // =========================================================================
    // STATE MANAGEMENT
    // =========================================================================

    class OverlayState {
        constructor() {
            // Current overlay state (for hover preview)
            this.current = new Array(OVERLAY_COUNT).fill(false);
            // Persistent overlay state (for click toggles)
            this.persistent = new Array(OVERLAY_COUNT).fill(false);
            // Whether overlay system is active
            this.active = true;
            // Whether menu is visible
            this.menuVisible = true;
        }

        /**
         * Set a single overlay active (for hover)
         */
        setHoverOverlay(index) {
            this.current = new Array(OVERLAY_COUNT).fill(false);
            if (index >= 0 && index < OVERLAY_COUNT) {
                this.current[index] = true;
            }
        }

        /**
         * Restore persistent state to current
         */
        restoreFromPersistent() {
            this.current = [...this.persistent];
        }

        /**
         * Toggle a persistent overlay
         */
        togglePersistent(index) {
            if (index >= 0 && index < OVERLAY_COUNT) {
                this.persistent[index] = !this.persistent[index];
                this.current[index] = this.persistent[index];
            }
        }

        /**
         * Check if any overlay is active
         */
        hasActiveOverlay() {
            return this.current.some(v => v);
        }

        /**
         * Get list of active overlay indices
         */
        getActiveOverlays() {
            return this.current
                .map((active, index) => active ? index : -1)
                .filter(index => index >= 0);
        }
    }

    // =========================================================================
    // TEXT RENDERERS
    // =========================================================================

    const TextRenderers = {
        /**
         * Render mineral overlay text
         */
        mineral(ctx, planet, mineralType, x, y) {
            const minerals = {
                0: { surface: 'neutronium', ground: 'groundneutronium', density: 'densityneutronium' },
                1: { surface: 'duranium', ground: 'groundduranium', density: 'densityduranium' },
                2: { surface: 'tritanium', ground: 'groundtritanium', density: 'densitytritanium' },
                3: { surface: 'molybdenum', ground: 'groundmolybdenum', density: 'densitymolybdenum' }
            };

            const m = minerals[mineralType];
            if (!m) return;

            const surface = planet[m.surface] || 0;
            const ground = planet[m.ground] || 0;
            const density = planet[m.density] || 0;

            // Planet ID
            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(`${planet.id}: `, x, y);
            x += ctx.measureText(`${planet.id}: `).width;

            // Surface amount
            ctx.fillStyle = getMineralSurfaceColor(surface);
            ctx.fillText(formatNumber(surface), x, y);
            x += ctx.measureText(formatNumber(surface)).width;

            // Separator
            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(' / ', x, y);
            x += ctx.measureText(' / ').width;

            // Ground amount
            ctx.fillStyle = getMineralGroundColor(ground);
            ctx.fillText(formatNumber(ground), x, y);
            x += ctx.measureText(formatNumber(ground)).width;

            // Density
            ctx.fillStyle = getMineralDensityColor(density);
            ctx.fillText(` (${density}%)`, x, y);
        },

        /**
         * Render planet name overlay
         */
        planetName(ctx, planet, x, y) {
            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(`${planet.id}: ${planet.name || 'Unknown'}`, x, y);
            x += ctx.measureText(`${planet.id}: ${planet.name || 'Unknown'}`).width;

            // Temperature
            ctx.fillStyle = getTemperatureColor(planet.temp);
            ctx.fillText(` (${planet.temp}°)`, x, y);
        },

        /**
         * Render friendly code overlay
         */
        friendlyCode(ctx, planet, x, y) {
            const fcode = (planet.friendlycode || '???').toUpperCase();

            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(`${planet.id}: `, x, y);
            x += ctx.measureText(`${planet.id}: `).width;

            // Color code special fcodes
            if (fcode === 'NUK' || fcode === 'ATT') {
                ctx.fillStyle = COLORS.BAD;
            } else if (fcode === 'BUM') {
                ctx.fillStyle = COLORS.ORCHID;
            } else if (fcode === 'DMP') {
                ctx.fillStyle = COLORS.MAGENTA;
            } else if (fcode.startsWith('PB')) {
                ctx.fillStyle = COLORS.AQUA;
            } else {
                ctx.fillStyle = getTemperatureColor(planet.temp);
            }
            ctx.fillText(fcode, x, y);
        },

        /**
         * Render colonist overlay
         */
        colonists(ctx, planet, x, y) {
            const clans = planet.clans || 0;
            const maxClans = getMaxColonists(planet) / 100;
            const growth = getColonistGrowth(planet);

            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(`${planet.id}: `, x, y);
            x += ctx.measureText(`${planet.id}: `).width;

            // Population
            ctx.fillStyle = getGrowthColor(growth, clans, maxClans);
            ctx.fillText(formatNumber(clans * 100), x, y);
            x += ctx.measureText(formatNumber(clans * 100)).width;

            // Max
            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(` / ${formatNumber(maxClans * 100)}`, x, y);
            x += ctx.measureText(` / ${formatNumber(maxClans * 100)}`).width;

            // Growth
            const indicator = getHappinessIndicator(growth);
            ctx.fillStyle = indicator.color;
            ctx.fillText(` (${growth >= 0 ? '+' : ''}${formatNumber(growth * 100)})`, x, y);
        },

        /**
         * Render natives overlay
         */
        natives(ctx, planet, x, y) {
            if (!planet.nativeclans || planet.nativetype === 0) {
                ctx.fillStyle = COLORS.WHITE;
                ctx.fillText(`${planet.id}: No Natives`, x, y);
                return;
            }

            const clans = planet.nativeclans;
            const maxClans = getMaxNatives(planet) / 1000;
            const growth = getNativeGrowth(planet);
            const raceName = getNativeRaceName(planet.nativetype);
            const govName = getNativeGovernmentName(planet.nativegovernment);

            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(`${planet.id}: `, x, y);
            x += ctx.measureText(`${planet.id}: `).width;

            // Race name
            ctx.fillStyle = COLORS.CYAN;
            ctx.fillText(raceName, x, y);
            x += ctx.measureText(raceName).width;

            // Government
            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(` (${govName}) `, x, y);
            x += ctx.measureText(` (${govName}) `).width;

            // Population
            ctx.fillStyle = getGrowthColor(growth, clans, maxClans);
            ctx.fillText(formatNumber(clans * 1000), x, y);
            x += ctx.measureText(formatNumber(clans * 1000)).width;

            // Max
            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(` / ${formatNumber(maxClans * 1000)}`, x, y);
        },

        /**
         * Render colonist tax overlay
         */
        colonistTax(ctx, planet, x, y) {
            const taxRate = planet.colonisttaxrate || 0;
            const happiness = planet.colonisthappypoints || 0;
            const happyChange = getColonistHappinessChange(planet);
            const income = getColonistTaxIncome(planet);

            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(`${planet.id}: `, x, y);
            x += ctx.measureText(`${planet.id}: `).width;

            // Tax rate
            ctx.fillStyle = taxRate > 20 ? COLORS.WARN : COLORS.GOOD;
            ctx.fillText(`${taxRate}%`, x, y);
            x += ctx.measureText(`${taxRate}%`).width;

            // Happiness
            ctx.fillStyle = happiness < 40 ? COLORS.BAD : (happiness < 70 ? COLORS.WARN : COLORS.GOOD);
            ctx.fillText(` H:${happiness}`, x, y);
            x += ctx.measureText(` H:${happiness}`).width;

            // Happiness change
            const indicator = getHappinessIndicator(happyChange);
            ctx.fillStyle = indicator.color;
            ctx.fillText(indicator.symbol, x, y);
            x += ctx.measureText(indicator.symbol).width;

            // Income
            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(` $${formatNumber(income)}`, x, y);
        },

        /**
         * Render native tax overlay
         */
        nativeTax(ctx, planet, x, y) {
            if (!planet.nativeclans || planet.nativetype === 0) {
                ctx.fillStyle = COLORS.WHITE;
                ctx.fillText(`${planet.id}: No Natives`, x, y);
                return;
            }

            const taxRate = planet.nativetaxrate || 0;
            const happiness = planet.nativehappypoints || 0;
            const happyChange = getNativeHappinessChange(planet);
            const income = getNativeTaxIncome(planet);

            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(`${planet.id}: `, x, y);
            x += ctx.measureText(`${planet.id}: `).width;

            // Tax rate
            ctx.fillStyle = taxRate > 20 ? COLORS.WARN : COLORS.GOOD;
            ctx.fillText(`${taxRate}%`, x, y);
            x += ctx.measureText(`${taxRate}%`).width;

            // Happiness
            ctx.fillStyle = happiness < 40 ? COLORS.BAD : (happiness < 70 ? COLORS.WARN : COLORS.GOOD);
            ctx.fillText(` H:${happiness}`, x, y);
            x += ctx.measureText(` H:${happiness}`).width;

            // Happiness change
            const indicator = getHappinessIndicator(happyChange);
            ctx.fillStyle = indicator.color;
            ctx.fillText(indicator.symbol, x, y);
            x += ctx.measureText(indicator.symbol).width;

            // Income
            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(` $${formatNumber(income)}`, x, y);
        },

        /**
         * Render supplies overlay
         */
        supplies(ctx, planet, x, y) {
            const supplies = planet.supplies || 0;
            const factories = planet.factories || 0;

            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(`${planet.id}: `, x, y);
            x += ctx.measureText(`${planet.id}: `).width;

            // Supplies
            ctx.fillStyle = supplies > 100 ? COLORS.GOOD : (supplies > 20 ? COLORS.WARN : COLORS.BAD);
            ctx.fillText(formatNumber(supplies), x, y);
            x += ctx.measureText(formatNumber(supplies)).width;

            // Factory production
            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(` (+${factories}/turn)`, x, y);
        },

        /**
         * Render megacredits overlay
         */
        megacredits(ctx, planet, x, y) {
            const mc = planet.megacredits || 0;
            const colIncome = getColonistTaxIncome(planet);
            const natIncome = getNativeTaxIncome(planet);
            const totalIncome = colIncome + natIncome;

            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(`${planet.id}: `, x, y);
            x += ctx.measureText(`${planet.id}: `).width;

            // MC
            ctx.fillStyle = mc > 1000 ? COLORS.GOOD : (mc > 100 ? COLORS.WARN : COLORS.BAD);
            ctx.fillText(`$${formatNumber(mc)}`, x, y);
            x += ctx.measureText(`$${formatNumber(mc)}`).width;

            // Income
            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(` (+$${formatNumber(totalIncome)}/turn)`, x, y);
        },

        /**
         * Render structure count overlay
         */
        structures(ctx, planet, structType, x, y) {
            const structInfo = {
                13: { name: 'Factories', prop: 'factories', built: 'builtfactories' },
                14: { name: 'Mines', prop: 'mines', built: 'builtmines' },
                15: { name: 'Defense', prop: 'defense', built: 'builtdefense' }
            };

            const info = structInfo[structType];
            if (!info) return;

            const count = planet[info.prop] || 0;
            const built = planet[info.built] || 0;
            const max = getMaxStructures(planet);

            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(`${planet.id}: `, x, y);
            x += ctx.measureText(`${planet.id}: `).width;

            // Current count
            ctx.fillStyle = count >= max ? COLORS.GOOD : (count > max * 0.5 ? COLORS.WARN : COLORS.BAD);
            ctx.fillText(formatNumber(count), x, y);
            x += ctx.measureText(formatNumber(count)).width;

            // Max
            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(` / ${formatNumber(max)}`, x, y);
            x += ctx.measureText(` / ${formatNumber(max)}`).width;

            // Built this turn
            if (built > 0) {
                ctx.fillStyle = COLORS.GOOD;
                ctx.fillText(` (+${built})`, x, y);
            }
        },

        /**
         * Render build method overlay (placeholder - shows N/A until PlaNEWtary Management plugin)
         */
        buildMethod(ctx, planet, x, y) {
            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(`${planet.id}: `, x, y);
            x += ctx.measureText(`${planet.id}: `).width;

            // Check for built structures this turn
            const builtF = planet.builtfactories || 0;
            const builtM = planet.builtmines || 0;
            const builtD = planet.builtdefense || 0;

            if (builtF > 0 || builtM > 0 || builtD > 0) {
                ctx.fillStyle = COLORS.GOOD;
                const parts = [];
                if (builtF > 0) parts.push(`+${builtF}F`);
                if (builtM > 0) parts.push(`+${builtM}M`);
                if (builtD > 0) parts.push(`+${builtD}D`);
                ctx.fillText(parts.join(' '), x, y);
            } else {
                ctx.fillStyle = COLORS.WARN;
                ctx.fillText('No builds', x, y);
            }
        },

        /**
         * Render starbase building overlay
         */
        starbaseBuilding(ctx, planet, x, y) {
            const starbase = vgap.getStarbase(planet.id);
            if (!starbase) {
                ctx.fillStyle = COLORS.WHITE;
                ctx.fillText(`${planet.id}: No Starbase`, x, y);
                return;
            }

            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(`${planet.id}: `, x, y);
            x += ctx.measureText(`${planet.id}: `).width;

            // Ship being built
            if (starbase.isbuilding && starbase.buildhullid > 0) {
                const hull = vgap.getHull(starbase.buildhullid);
                const hullName = hull ? hull.name : `Hull #${starbase.buildhullid}`;
                ctx.fillStyle = COLORS.CYAN;
                ctx.fillText(hullName, x, y);
            } else {
                ctx.fillStyle = COLORS.WARN;
                ctx.fillText('Idle', x, y);
            }
        },

        /**
         * Render starbase tech overlay
         */
        starbaseTech(ctx, planet, x, y) {
            const starbase = vgap.getStarbase(planet.id);
            if (!starbase) {
                ctx.fillStyle = COLORS.WHITE;
                ctx.fillText(`${planet.id}: No Starbase`, x, y);
                return;
            }

            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(`${planet.id}: `, x, y);
            x += ctx.measureText(`${planet.id}: `).width;

            // Tech levels
            const techColor = (level) => level >= 10 ? COLORS.GOOD : (level >= 5 ? COLORS.WARN : COLORS.BAD);

            ctx.fillStyle = techColor(starbase.hulltechlevel);
            ctx.fillText(`H${starbase.hulltechlevel}`, x, y);
            x += ctx.measureText(`H${starbase.hulltechlevel}`).width;

            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText('/', x, y);
            x += ctx.measureText('/').width;

            ctx.fillStyle = techColor(starbase.enginetechlevel);
            ctx.fillText(`E${starbase.enginetechlevel}`, x, y);
            x += ctx.measureText(`E${starbase.enginetechlevel}`).width;

            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText('/', x, y);
            x += ctx.measureText('/').width;

            ctx.fillStyle = techColor(starbase.beamtechlevel);
            ctx.fillText(`B${starbase.beamtechlevel}`, x, y);
            x += ctx.measureText(`B${starbase.beamtechlevel}`).width;

            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText('/', x, y);
            x += ctx.measureText('/').width;

            ctx.fillStyle = techColor(starbase.torptechlevel);
            ctx.fillText(`T${starbase.torptechlevel}`, x, y);
            x += ctx.measureText(`T${starbase.torptechlevel}`).width;

            // Defense/Fighters
            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(` D:${starbase.defense} F:${starbase.fighters}`, x, y);
        }
    };

    // =========================================================================
    // UI MANAGER
    // =========================================================================

    class UIManager {
        constructor(state) {
            this.state = state;
            this.container = null;
            this.menuBar = null;
            this.expanderBtn = null;
            this.buttons = {};
            this.icons = { normal: {}, hover: {} };
        }

        /**
         * Initialize icon images
         */
        initIcons() {
            Object.values(OVERLAY_TYPES).forEach(overlay => {
                const colors = CATEGORY_COLORS[overlay.category];
                this.icons.normal[overlay.id] = createIconSvg(overlay.label, colors.normal);
                this.icons.hover[overlay.id] = createIconSvg(overlay.label, colors.hover);
            });
        }

        /**
         * Create the overlay menu UI
         */
        createMenu() {
            // Remove existing menu if present
            this.destroy();

            // Create container
            this.container = document.createElement('div');
            this.container.id = 'pio-container';
            this.container.style.cssText = `
                position: absolute;
                left: 6px;
                top: 68px;
                z-index: 1000;
            `;

            // Create menu bar
            this.menuBar = document.createElement('div');
            this.menuBar.id = 'pio-menu';
            this.menuBar.style.cssText = `
                width: 58px;
                background: rgba(20, 20, 20, 0.85);
                border: 1px solid #444;
                border-radius: 4px;
                padding: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            `;

            // Create expander button
            this.expanderBtn = document.createElement('div');
            this.expanderBtn.id = 'pio-expander';
            this.expanderBtn.innerHTML = '≡';
            this.expanderBtn.style.cssText = `
                position: absolute;
                left: 4px;
                top: 68px;
                width: 24px;
                height: 24px;
                background: rgba(20, 20, 20, 0.85);
                border: 1px solid #444;
                border-radius: 4px;
                color: white;
                text-align: center;
                line-height: 24px;
                cursor: pointer;
                font-size: 16px;
                display: none;
                z-index: 1001;
            `;
            this.expanderBtn.addEventListener('click', () => this.toggleMenu());

            // Add title
            const title = document.createElement('div');
            title.style.cssText = `
                color: #aaa;
                font-size: 10px;
                text-align: center;
                padding: 2px 0 4px 0;
                border-bottom: 1px solid #333;
                margin-bottom: 4px;
            `;
            title.textContent = 'Overlays';
            this.menuBar.appendChild(title);

            // Add category groups
            this.addCategoryGroup('General', ['PLANET_NAMES', 'FRIENDLY_CODE']);
            this.addCategoryGroup('Minerals', ['NEUTRONIUM', 'DURANIUM', 'TRITANIUM', 'MOLYBDENUM']);
            this.addCategoryGroup('Population', ['COLONISTS', 'NATIVES', 'COLONIST_TAX', 'NATIVE_TAX']);
            this.addCategoryGroup('Resources', ['SUPPLIES', 'MEGACREDITS']);
            this.addCategoryGroup('Structures', ['BUILD_METHOD', 'FACTORIES', 'MINES', 'DEFENSE']);
            this.addCategoryGroup('Starbase', ['SB_BUILDING', 'SB_TECH']);

            this.container.appendChild(this.menuBar);

            // Add to game container
            const gameContainer = document.getElementById('MapContainer') || document.body;
            gameContainer.appendChild(this.container);
            gameContainer.appendChild(this.expanderBtn);

            // Update button states
            this.updateButtonStates();
        }

        /**
         * Add a category group with buttons
         */
        addCategoryGroup(label, overlayKeys) {
            const group = document.createElement('div');
            group.style.cssText = `
                margin-bottom: 4px;
                padding-bottom: 4px;
                border-bottom: 1px solid #333;
            `;

            // Category label
            const labelDiv = document.createElement('div');
            labelDiv.style.cssText = `
                color: #666;
                font-size: 9px;
                text-align: center;
                margin-bottom: 2px;
            `;
            labelDiv.textContent = label;
            group.appendChild(labelDiv);

            // Button container
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = `
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 2px;
            `;

            overlayKeys.forEach(key => {
                const overlay = OVERLAY_TYPES[key];
                if (!overlay) return;

                const btn = this.createButton(overlay);
                btnContainer.appendChild(btn);
                this.buttons[overlay.id] = btn;
            });

            group.appendChild(btnContainer);
            this.menuBar.appendChild(group);
        }

        /**
         * Create an overlay button
         */
        createButton(overlay) {
            const btn = document.createElement('div');
            btn.style.cssText = `
                width: 24px;
                height: 24px;
                cursor: pointer;
                opacity: 0.7;
                transition: opacity 0.15s;
            `;
            btn.title = overlay.name;
            btn.dataset.overlayId = overlay.id;

            const img = document.createElement('img');
            img.src = this.icons.normal[overlay.id];
            img.style.cssText = 'width: 100%; height: 100%;';
            btn.appendChild(img);

            // Event handlers
            btn.addEventListener('mouseenter', () => {
                this.state.setHoverOverlay(overlay.id);
                img.src = this.icons.hover[overlay.id];
                btn.style.opacity = '1';
                this.requestRedraw();
            });

            btn.addEventListener('mouseleave', () => {
                this.state.restoreFromPersistent();
                if (!this.state.persistent[overlay.id]) {
                    img.src = this.icons.normal[overlay.id];
                    btn.style.opacity = '0.7';
                }
                this.requestRedraw();
            });

            btn.addEventListener('click', () => {
                this.state.togglePersistent(overlay.id);
                this.updateButtonStates();
                this.requestRedraw();
            });

            return btn;
        }

        /**
         * Update all button visual states
         */
        updateButtonStates() {
            Object.entries(this.buttons).forEach(([id, btn]) => {
                const overlayId = parseInt(id);
                const img = btn.querySelector('img');
                if (this.state.persistent[overlayId]) {
                    img.src = this.icons.hover[overlayId];
                    btn.style.opacity = '1';
                } else {
                    img.src = this.icons.normal[overlayId];
                    btn.style.opacity = '0.7';
                }
            });
        }

        /**
         * Toggle menu visibility
         */
        toggleMenu() {
            this.state.menuVisible = !this.state.menuVisible;
            this.menuBar.style.display = this.state.menuVisible ? 'block' : 'none';
            this.expanderBtn.style.display = this.state.menuVisible ? 'none' : 'block';
        }

        /**
         * Request map redraw
         */
        requestRedraw() {
            if (vgap && vgap.map && vgap.map.draw) {
                vgap.map.draw();
            }
        }

        /**
         * Clean up UI
         */
        destroy() {
            if (this.container && this.container.parentNode) {
                this.container.parentNode.removeChild(this.container);
            }
            if (this.expanderBtn && this.expanderBtn.parentNode) {
                this.expanderBtn.parentNode.removeChild(this.expanderBtn);
            }
            this.buttons = {};
        }
    }

    // =========================================================================
    // DRAWING ENGINE
    // =========================================================================

    class DrawingEngine {
        constructor(state) {
            this.state = state;
            this.fontSizeCache = {};
        }

        /**
         * Calculate font size based on zoom level
         */
        getFontSize() {
            const zoom = vgap.map.zoom || 1;
            if (zoom >= 2) return 12;
            if (zoom >= 1) return 11;
            return 10;
        }

        /**
         * Draw all active overlays
         */
        draw() {
            if (!this.state.active || !this.state.hasActiveOverlay()) return;
            if (!vgap || !vgap.map || !vgap.map.ctx) return;

            const ctx = vgap.map.ctx;
            const planets = vgap.myplanets || [];
            const fontSize = this.getFontSize();
            const activeOverlays = this.state.getActiveOverlays();

            // Save context state
            ctx.save();
            ctx.font = `bold ${fontSize}px Arial, sans-serif`;
            ctx.textBaseline = 'middle';

            // Process each visible planet
            for (const planet of planets) {
                if (!this.isPlanetVisible(planet)) continue;
                if (planet.molybdenum < 0) continue; // Planet not scanned

                const { x, y, side } = this.calculateTextPosition(planet, planets);

                // Render active overlays
                for (const overlayId of activeOverlays) {
                    this.renderOverlay(ctx, planet, overlayId, x, y);
                }
            }

            ctx.restore();
        }

        /**
         * Check if planet is visible on screen
         */
        isPlanetVisible(planet) {
            if (!vgap.map.isVisible) return true;
            const radius = vgap.map.planetRad ? vgap.map.planetRad(planet) : 10;
            return vgap.map.isVisible(planet.x, planet.y, radius);
        }

        /**
         * Calculate text position avoiding collisions
         */
        calculateTextPosition(planet, allPlanets) {
            const screenX = vgap.map.screenX(planet.x);
            const screenY = vgap.map.screenY(planet.y);
            const radius = vgap.map.planetRad ? vgap.map.planetRad(planet) : 10;

            // Default: right side of planet
            let x = screenX + radius + 4;
            let y = screenY;
            let side = 'right';

            // Simple collision check - if another planet is close on the right, flip to left
            for (const other of allPlanets) {
                if (other.id === planet.id) continue;

                const otherX = vgap.map.screenX(other.x);
                const otherY = vgap.map.screenY(other.y);

                // Check if other planet is to the right and close
                if (otherX > screenX && otherX < screenX + 150 &&
                    Math.abs(otherY - screenY) < 20) {
                    x = screenX - radius - 4;
                    side = 'left';
                    break;
                }
            }

            return { x, y, side };
        }

        /**
         * Render a specific overlay for a planet
         */
        renderOverlay(ctx, planet, overlayId, x, y) {
            switch (overlayId) {
                case 0: TextRenderers.mineral(ctx, planet, 0, x, y); break;
                case 1: TextRenderers.mineral(ctx, planet, 1, x, y); break;
                case 2: TextRenderers.mineral(ctx, planet, 2, x, y); break;
                case 3: TextRenderers.mineral(ctx, planet, 3, x, y); break;
                case 4: TextRenderers.planetName(ctx, planet, x, y); break;
                case 5: TextRenderers.friendlyCode(ctx, planet, x, y); break;
                case 6: TextRenderers.colonists(ctx, planet, x, y); break;
                case 7: TextRenderers.natives(ctx, planet, x, y); break;
                case 8: TextRenderers.colonistTax(ctx, planet, x, y); break;
                case 9: TextRenderers.nativeTax(ctx, planet, x, y); break;
                case 10: TextRenderers.supplies(ctx, planet, x, y); break;
                case 11: TextRenderers.megacredits(ctx, planet, x, y); break;
                case 12: TextRenderers.buildMethod(ctx, planet, x, y); break;
                case 13: TextRenderers.structures(ctx, planet, 13, x, y); break;
                case 14: TextRenderers.structures(ctx, planet, 14, x, y); break;
                case 15: TextRenderers.structures(ctx, planet, 15, x, y); break;
                case 16: TextRenderers.starbaseBuilding(ctx, planet, x, y); break;
                case 17: TextRenderers.starbaseTech(ctx, planet, x, y); break;
            }
        }
    }

    // =========================================================================
    // MAIN PLUGIN
    // =========================================================================

    class PlanetInfoOverlay {
        constructor() {
            this.state = new OverlayState();
            this.ui = new UIManager(this.state);
            this.engine = new DrawingEngine(this.state);
        }

        /**
         * Initialize plugin
         */
        init() {
            this.ui.initIcons();
        }

        /**
         * Create vgap plugin interface
         */
        createPluginInterface() {
            const self = this;

            return {
                processload() {
                    self.init();
                },

                showmap() {
                    self.ui.createMenu();
                },

                showdashboard() {
                    self.ui.destroy();
                },

                draw() {
                    self.engine.draw();
                }
            };
        }
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    function initPlugin() {
        // Check if vgap is available
        if (typeof vgap === 'undefined' || vgap.version < 3.0) {
            console.warn('[Planet Info Overlay] vgap not available or version too old');
            return;
        }

        // Create and register plugin
        const plugin = new PlanetInfoOverlay();
        const pluginInterface = plugin.createPluginInterface();

        vgap.registerPlugin(pluginInterface, PLUGIN_NAME);

        console.log(`[Planet Info Overlay] v${PLUGIN_VERSION} loaded`);
    }

    // Use wrapper injection pattern for Greasemonkey/Tampermonkey
    function wrapper() {
        if (typeof vgap === 'undefined') {
            // Wait for vgap to be available
            setTimeout(wrapper, 100);
            return;
        }
        initPlugin();
    }

    // Inject into page context
    if (typeof unsafeWindow !== 'undefined') {
        // Greasemonkey/Tampermonkey environment
        const script = document.createElement('script');
        script.textContent = '(' + wrapper.toString() + ')();';
        document.body.appendChild(script);
    } else {
        // Direct browser environment
        wrapper();
    }

})();
