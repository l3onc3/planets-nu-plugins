// ==UserScript==
// @name         Planets.nu - Economy Management
// @namespace    https://planets.nu/
// @version      0.1.0
// @description  Building and taxation automation for Planets.nu
// @author       Leonce
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

    const PLUGIN_NAME = 'economyManagement';
    const PLUGIN_VERSION = '0.1.0';

    // Note type for data persistence (original plugin uses -174481, but data formats are incompatible)
    const NOTE_TYPE = 72;

    // Note IDs for different data types
    const NOTE_IDS = {
        BUILD_ASSIGNMENTS: 0,      // Planet -> build method index mapping
        NATIVE_TAX_ASSIGNMENTS: 1, // Planet -> native tax method index mapping
        COLONIST_TAX_ASSIGNMENTS: 2, // Planet -> colonist tax method index mapping
        BUILD_METHODS: 4,          // Build method definitions
        TAX_METHODS: 5             // Tax method definitions
    };

    // Default build methods
    // Next available IDs: b14, t6 — new methods (default or user-created) continue from here
    const DEFAULT_BUILD_METHODS = {
        b1: { name: 'Max Factories, No Mines', code: 'y-f-999' },
        b2: { name: 'Ratio 2:1 Max Factories, 100 Mines', code: 'y-rfm-999-100-2' },
        b3: { name: 'Ratio 2:1 Max Factories, 200 Mines', code: 'y-rfm-999-200-2' },
        b4: { name: 'Safe Max Factories, No Mines', code: 'y-f-15-d-S-f-999' },
        b5: { name: 'Safe Ratio 2:1 Max Factories, 100 Mines', code: 'y-f-15-m-20-d-S-rfm-999-100-2' },
        b6: { name: 'Safe Ratio 2:1 Max Factories, 200 Mines', code: 'y-f-15-m-20-d-S-rfm-999-200-2' },
        b7: { name: 'Safe Max Factories, then 100 Mines', code: 'y-f-15-d-S-f-999-m-100' },
        b8: { name: 'Safe Max Factories, then 200 Mines', code: 'y-f-15-d-S-f-999-m-200' },
        b9: { name: 'Max out at Ratio 2:1', code: 'y-rfm-999-999-2' },
        b10: { name: 'Safe Max out at Ratio 2:1', code: 'y-f-15-m-20-d-S-rfm-999-999-2' },
        b11: { name: 'Max Out, Factories first', code: 'y-f-999-m-999' },
        b12: { name: 'Safe Max Out, Factories first', code: 'y-f-15-d-S-f-999-m-999' },
        b13: { name: '200 Mines, then Max Factories, then 100 defense', code: 'y-m-200-f-999-d-100' }
    };

    // Default tax methods
    const DEFAULT_TAX_METHODS = {
        t1: {
            name: 'Growth 70-100',
            method: 'Growth',
            taxType: 'CN',
            minHappy: 70,
            maxHappy: 100,
            minClans: 0,
            midsame: true,
            maxsame: false,
            maxmethod: 'Safe',
            maxMinHappy: 40,
            maxMaxHappy: 100
        },
        t2: {
            name: 'Safe 100',
            method: 'Safe',
            taxType: 'CN',
            minHappy: 100,
            maxHappy: 100,
            minClans: 0,
            midsame: true,
            maxsame: true
        },
        t3: {
            name: 'Safe 70',
            method: 'Safe',
            taxType: 'CN',
            minHappy: 70,
            maxHappy: 100,
            minClans: 0,
            midsame: true,
            maxsame: true
        },
        t4: {
            name: 'Safe 40',
            method: 'Safe',
            taxType: 'CN',
            minHappy: 40,
            maxHappy: 100,
            minClans: 0,
            midsame: true,
            maxsame: true
        },
        t5: {
            name: 'No Tax',
            method: 'NoTax',
            taxType: 'CN',
            minHappy: 100,
            maxHappy: 100,
            minClans: 0,
            midsame: true,
            maxsame: true
        }
    };

    // =========================================================================
    // DATA STORE - Persistence Layer
    // =========================================================================

    class DataStore {
        constructor() {
            // Planet -> method index mappings ('m' = manual)
            this.buildAssignments = {};
            this.colonistTaxAssignments = {};
            this.nativeTaxAssignments = {};

            // Method definitions (keyed by unique ID)
            this.buildMethods = {};
            this.taxMethods = {};
            this.nextBuildId = 1;
            this.nextTaxId = 1;

            // Safe defense level (15 = 99% protection, 16 = 100%)
            this.safeDefenseLevel = 16;

            // UI dismissal flags
            this.buildInfoDismissed = false;

            this.loaded = false;
        }

        /**
         * Load all data from planets.nu note system
         */
        load() {
            console.log('[Economy Management] Loading data from notes...');

            // Load build methods
            const buildMethodsData = this.getObjectFromNote(NOTE_IDS.BUILD_METHODS);
            if (buildMethodsData && buildMethodsData[1]) {
                if (buildMethodsData[2] != null) {
                    this.safeDefenseLevel = buildMethodsData[2];
                }
                if (buildMethodsData[3] != null) {
                    this.buildInfoDismissed = buildMethodsData[3];
                }
                if (Array.isArray(buildMethodsData[1])) {
                    // Migrate from old array format
                    this.buildMethods = this.migrateArrayToDict(buildMethodsData[1], 'b');
                } else {
                    this.buildMethods = buildMethodsData[1];
                }
                this.nextBuildId = this.calcNextId(this.buildMethods);
                this.saveBuildMethods();
            } else {
                this.buildMethods = structuredClone(DEFAULT_BUILD_METHODS);
                this.nextBuildId = this.calcNextId(this.buildMethods);
                this.saveBuildMethods();
            }

            // Load tax methods
            const taxMethodsData = this.getObjectFromNote(NOTE_IDS.TAX_METHODS);
            if (taxMethodsData && taxMethodsData[1]) {
                if (Array.isArray(taxMethodsData[1])) {
                    // Migrate from old array format
                    this.taxMethods = this.migrateArrayToDict(taxMethodsData[1], 't');
                } else {
                    this.taxMethods = taxMethodsData[1];
                }
                this.nextTaxId = this.calcNextId(this.taxMethods);
                this.saveTaxMethods();
            } else {
                this.taxMethods = structuredClone(DEFAULT_TAX_METHODS);
                this.nextTaxId = this.calcNextId(this.taxMethods);
                this.saveTaxMethods();
            }

            // Load build assignments
            const buildAssignData = this.getObjectFromNote(NOTE_IDS.BUILD_ASSIGNMENTS);
            if (buildAssignData && buildAssignData[1]) {
                this.buildAssignments = buildAssignData[1];
                this.migrateAssignments(this.buildAssignments, this.buildMethods);
                this.saveBuildAssignments();
            } else {
                this.initializeAssignments();
            }

            // Load colonist tax assignments
            const colTaxData = this.getObjectFromNote(NOTE_IDS.COLONIST_TAX_ASSIGNMENTS);
            if (colTaxData && colTaxData[1]) {
                this.colonistTaxAssignments = colTaxData[1];
                this.migrateAssignments(this.colonistTaxAssignments, this.taxMethods);
                this.saveColonistTaxAssignments();
            }

            // Load native tax assignments
            const natTaxData = this.getObjectFromNote(NOTE_IDS.NATIVE_TAX_ASSIGNMENTS);
            if (natTaxData && natTaxData[1]) {
                this.nativeTaxAssignments = natTaxData[1];
                this.migrateAssignments(this.nativeTaxAssignments, this.taxMethods);
                this.saveNativeTaxAssignments();
            }

            this.loaded = true;
            console.log('[Economy Management] Data loaded:', {
                buildMethods: Object.keys(this.buildMethods).length,
                taxMethods: Object.keys(this.taxMethods).length,
                buildAssignments: Object.keys(this.buildAssignments).length
            });
        }

        /**
         * Migrate an old array of methods to a dict keyed by prefix + index.
         * E.g. [{name: 'Foo'}] with prefix 'b' becomes {b1: {name: 'Foo'}}
         */
        migrateArrayToDict(arr, prefix) {
            const dict = {};
            arr.forEach((m, i) => { dict[`${prefix}${i + 1}`] = m; });
            return dict;
        }

        /**
         * Calculate the next auto-increment ID for a methods dict.
         * Extracts the numeric suffix from all keys (regardless of prefix)
         * and returns highest + 1.
         */
        calcNextId(dict) {
            let max = 0;
            for (const key of Object.keys(dict)) {
                const n = parseInt(key.replace(/\D+/g, ''), 10);
                if (n > max) max = n;
            }
            return max + 1;
        }

        /**
         * Generate next unique ID for a method type and increment counter.
         */
        generateBuildId() { return `b${this.nextBuildId++}`; }
        generateTaxId() { return `t${this.nextTaxId++}`; }

        /**
         * Migrate old numeric-index assignments to string IDs.
         * Old format stored array indices (0, 1, 2...) — convert to dict keys.
         * Assignments that already use string keys or 'm' are left as-is.
         * Assignments pointing to nonexistent methods are reset to 'm'.
         */
        migrateAssignments(assignments, methodsDict) {
            const methodKeys = Object.keys(methodsDict);
            for (const [planetId, val] of Object.entries(assignments)) {
                if (typeof val === 'number') {
                    // Old array index — map to the corresponding dict key
                    if (val >= 0 && val < methodKeys.length) {
                        assignments[planetId] = methodKeys[val];
                    } else {
                        assignments[planetId] = 'm';
                    }
                } else if (typeof val === 'string' && val !== 'm' && !(val in methodsDict)) {
                    // String key that no longer exists in the dict
                    assignments[planetId] = 'm';
                }
                // Objects (custom build codes) and 'm' are left as-is
            }
        }

        /**
         * Initialize assignments for all owned planets to 'manual'
         */
        initializeAssignments() {
            if (!vgap.myplanets) return;

            for (const planet of vgap.myplanets) {
                if (this.buildAssignments[planet.id] === undefined) {
                    this.buildAssignments[planet.id] = 'm';
                }
                if (this.colonistTaxAssignments[planet.id] === undefined) {
                    this.colonistTaxAssignments[planet.id] = 'm';
                }
                if (this.nativeTaxAssignments[planet.id] === undefined) {
                    this.nativeTaxAssignments[planet.id] = 'm';
                }
            }

            this.saveBuildAssignments();
            this.saveColonistTaxAssignments();
            this.saveNativeTaxAssignments();
        }

        /**
         * Save build assignments to note
         */
        saveBuildAssignments() {
            this.saveObjectAsNote(NOTE_IDS.BUILD_ASSIGNMENTS, [PLUGIN_VERSION, this.buildAssignments]);
        }

        /**
         * Save colonist tax assignments to note
         */
        saveColonistTaxAssignments() {
            this.saveObjectAsNote(NOTE_IDS.COLONIST_TAX_ASSIGNMENTS, [PLUGIN_VERSION, this.colonistTaxAssignments]);
        }

        /**
         * Save native tax assignments to note
         */
        saveNativeTaxAssignments() {
            this.saveObjectAsNote(NOTE_IDS.NATIVE_TAX_ASSIGNMENTS, [PLUGIN_VERSION, this.nativeTaxAssignments]);
        }

        /**
         * Save build methods to note
         */
        saveBuildMethods() {
            this.saveObjectAsNote(NOTE_IDS.BUILD_METHODS, [PLUGIN_VERSION, this.buildMethods, this.safeDefenseLevel, this.buildInfoDismissed]);
        }

        /**
         * Save tax methods to note
         */
        saveTaxMethods() {
            this.saveObjectAsNote(NOTE_IDS.TAX_METHODS, [PLUGIN_VERSION, this.taxMethods]);
        }

        /**
         * Get object from planets.nu note system
         */
        getObjectFromNote(noteId) {
            try {
                const note = vgap.getNote(noteId, NOTE_TYPE);
                if (note && note.body) {
                    return JSON.parse(note.body);
                }
            } catch (e) {
                console.warn('[Economy Management] Error reading note:', noteId, e);
            }
            return null;
        }

        /**
         * Save object to planets.nu note system
         */
        saveObjectAsNote(noteId, obj) {
            try {
                let note = vgap.getNote(noteId, NOTE_TYPE);
                if (!note) {
                    note = vgap.addNote(noteId, NOTE_TYPE);
                }
                note.body = JSON.stringify(obj);
                note.changed = 1;
            } catch (e) {
                console.error('[Economy Management] Error saving note:', noteId, e);
            }
        }

        /**
         * Get build method for a planet
         */
        getBuildMethod(planetId) {
            const assignment = this.buildAssignments[planetId];
            if (assignment === 'm' || assignment === undefined) {
                return null;
            }
            if (typeof assignment === 'object' && assignment.code) {
                return { name: 'Custom', code: assignment.code };
            }
            return this.buildMethods[assignment] || null;
        }

        /**
         * Get colonist tax method for a planet
         */
        getColonistTaxMethod(planetId) {
            const assignment = this.colonistTaxAssignments[planetId];
            if (assignment === 'm' || assignment === undefined) {
                return null;
            }
            return this.taxMethods[assignment] || null;
        }

        /**
         * Get native tax method for a planet
         */
        getNativeTaxMethod(planetId) {
            const assignment = this.nativeTaxAssignments[planetId];
            if (assignment === 'm' || assignment === undefined) {
                return null;
            }
            return this.taxMethods[assignment] || null;
        }

        /**
         * Set build method assignment for a planet
         */
        setBuildAssignment(planetId, methodIndex) {
            this.buildAssignments[planetId] = methodIndex;
            this.saveBuildAssignments();
        }

        /**
         * Set colonist tax method assignment for a planet
         */
        setColonistTaxAssignment(planetId, methodIndex) {
            this.colonistTaxAssignments[planetId] = methodIndex;
            this.saveColonistTaxAssignments();
        }

        /**
         * Set native tax method assignment for a planet
         */
        setNativeTaxAssignment(planetId, methodIndex) {
            this.nativeTaxAssignments[planetId] = methodIndex;
            this.saveNativeTaxAssignments();
        }

        /**
         * Find planets using a given build method ID.
         * Returns array of planet objects.
         */
        getPlanetsUsingBuildMethod(methodId) {
            const planetIds = Object.entries(this.buildAssignments)
                .filter(([, val]) => val === methodId)
                .map(([id]) => parseInt(id, 10));
            return planetIds.map(id => vgap.getPlanet(id)).filter(Boolean);
        }

        /**
         * Find planets using a given tax method ID (colonist or native).
         * Returns array of planet objects (deduplicated).
         */
        getPlanetsUsingTaxMethod(methodId) {
            const ids = new Set();
            for (const [id, val] of Object.entries(this.colonistTaxAssignments)) {
                if (val === methodId) ids.add(parseInt(id, 10));
            }
            for (const [id, val] of Object.entries(this.nativeTaxAssignments)) {
                if (val === methodId) ids.add(parseInt(id, 10));
            }
            return [...ids].map(id => vgap.getPlanet(id)).filter(Boolean);
        }
    }

    // =========================================================================
    // VANILLA DETECTOR - Detect built-in auto-build/tax features
    // =========================================================================

    class VanillaDetector {
        /**
         * Check if planet has built-in auto-build enabled
         */
        hasAutoBuild(planet) {
            return (
                (planet.targetfactories && planet.targetfactories > 0) ||
                (planet.targetmines && planet.targetmines > 0) ||
                (planet.targetdefense && planet.targetdefense > 0)
            );
        }

        /**
         * Check if planet has built-in native auto-tax enabled
         */
        hasNativeAutoTax(planet) {
            return planet.nativeautotax != null;
        }

        /**
         * Check if we can apply build methods to this planet
         */
        canApplyBuildMethod(planet) {
            return !this.hasAutoBuild(planet);
        }

        /**
         * Check if we can apply native tax methods to this planet
         */
        canApplyNativeTax(planet) {
            return !this.hasNativeAutoTax(planet);
        }

        /**
         * Get warnings for a planet
         */
        getWarnings(planet) {
            const warnings = [];

            if (this.hasAutoBuild(planet)) {
                warnings.push({
                    type: 'autobuild',
                    message: 'Using built-in auto-build (disable in Buildings tab to use this plugin instead)'
                });
            }

            if (this.hasNativeAutoTax(planet) && planet.nativeclans > 0) {
                warnings.push({
                    type: 'nativetax',
                    message: 'Using built-in native auto-tax (disable in Natives tab to use this plugin instead)'
                });
            }

            return warnings;
        }
    }

    // =========================================================================
    // BUILD ENGINE - Structure building logic
    // =========================================================================

    class BuildEngine {
        constructor(dataStore) {
            this.dataStore = dataStore;
        }

        /**
         * Parse a build code string into a build plan
         * Format: y-f-15-m-20-d-16 or n-rfm-400-150-7
         * @param {string} code - The build code
         * @returns {object|null} Parsed build plan or null if invalid
         */
        parseBuildCode(code) {
            if (!code || typeof code !== 'string') return null;

            // Expand 'S' variable to current safe defense level, then lowercase
            const safeLevel = String(this.dataStore.safeDefenseLevel);
            const parts = code.replace(/\bS\b/g, safeLevel).toLowerCase().split('-');

            // First part: y (burn supplies) or n (don't burn supplies)
            if (parts[0] !== 'y' && parts[0] !== 'n') return null;
            const burnSupplies = parts[0] === 'y';

            const instructions = [];
            let i = 1;

            while (i < parts.length) {
                const type = parts[i];

                if (type === 'rfm') {
                    // Ratio building: rfm-maxFactories-maxMines-ratio
                    if (i + 3 >= parts.length) break;
                    instructions.push({
                        type: 'ratio',
                        maxFactories: parseInt(parts[i + 1], 10),
                        maxMines: parseInt(parts[i + 2], 10),
                        ratio: parseInt(parts[i + 3], 10)
                    });
                    i += 4;
                } else if (type === 'f' || type === 'm' || type === 'd') {
                    // Simple building: f-15, m-20, d-16
                    if (i + 1 >= parts.length) break;
                    instructions.push({
                        type: type === 'f' ? 'factories' : type === 'm' ? 'mines' : 'defense',
                        target: parseInt(parts[i + 1], 10)
                    });
                    i += 2;
                } else {
                    i++;
                }
            }

            return {
                burnSupplies,
                instructions
            };
        }

        /**
         * Validate a build code
         */
        isValidBuildCode(code) {
            return this.parseBuildCode(code) !== null;
        }

        /**
         * Get human-readable description of a build code
         */
        getBuildCodeDescription(code) {
            const plan = this.parseBuildCode(code);
            if (!plan) return 'Invalid build code';

            const parts = [];
            parts.push(plan.burnSupplies ? 'Burn supplies if needed' : 'Don\'t burn supplies');

            for (const instr of plan.instructions) {
                if (instr.type === 'ratio') {
                    parts.push(`Build up to ${instr.maxFactories}F/${instr.maxMines}M at ${instr.ratio}:1 ratio`);
                } else {
                    const suffix = { factories: 'F', mines: 'M', defense: 'D' }[instr.type];
                    parts.push(`Build up to ${instr.target}${suffix}`);
                }
            }

            return parts.join(', then ');
        }

        /**
         * Calculate maximum of a structure type based on population
         * Formula: if clans <= baseAmount: max = clans
         *          else: max = floor(baseAmount + sqrt(clans - baseAmount))
         * @param {object} planet - The planet object
         * @param {number} baseAmount - Base amount (100 for factories, 200 for mines, 50 for defense)
         * @returns {number} Maximum structures
         */
        maxBuilding(planet, baseAmount) {
            const clans = planet.clans || 0;
            if (clans <= baseAmount) {
                return clans;
            }
            return Math.floor(baseAmount + Math.sqrt(clans - baseAmount));
        }

        /**
         * Calculate maximum structures that can be built on a planet
         */
        getMaxStructures(planet) {
            return {
                factories: this.maxBuilding(planet, 100),
                mines: this.maxBuilding(planet, 200),
                defense: this.maxBuilding(planet, 50)
            };
        }

        /**
         * Build costs for each structure type
         */
        getBuildCosts() {
            return {
                factories: { supplies: 1, mc: 3 },  // Total 4 if converting supplies
                mines: { supplies: 1, mc: 4 },      // Total 5 if converting supplies
                defense: { supplies: 1, mc: 10 }    // Total 11 if converting supplies
            };
        }

        /**
         * Calculate how many structures can be built with available resources
         * @param {number} mc - Available megacredits
         * @param {number} supplies - Available supplies
         * @param {string} type - Structure type ('factories', 'mines', 'defense')
         * @param {boolean} burnSupplies - Whether to convert supplies to MC
         * @returns {number} Number that can be built
         */
        getAffordableCount(mc, supplies, type, burnSupplies) {
            const costs = this.getBuildCosts()[type];
            const totalCost = costs.supplies + costs.mc;

            if (burnSupplies) {
                // Can use supplies as MC substitute
                return Math.floor((mc + supplies) / totalCost);
            } else {
                // Must have supplies and MC separately
                const bySupplies = Math.floor(supplies / costs.supplies);
                const byMC = Math.floor(mc / costs.mc);
                return Math.min(bySupplies, byMC);
            }
        }

        /**
         * Build a number of structures on a planet
         * @param {object} planet - The planet object (will be modified)
         * @param {string} type - Structure type ('factories', 'mines', 'defense')
         * @param {number} count - Number to build
         * @param {boolean} burnSupplies - Whether to convert supplies to MC
         * @param {boolean} markChanged - If true, set persistence flags (planet.changed, etc.)
         * @returns {object} Result with actual number built and resources used
         */
        buildStructure(planet, type, count, burnSupplies, markChanged = true) {
            if (count <= 0) {
                return { built: 0, suppliesUsed: 0, mcUsed: 0, suppliesSold: 0 };
            }

            const costs = this.getBuildCosts()[type];
            const baseAmounts = { factories: 100, mines: 200, defense: 50 };
            const maxAllowed = this.maxBuilding(planet, baseAmounts[type]);
            const currentCount = planet[type] || 0;

            // Check if already at or over max
            if (currentCount >= maxAllowed) {
                return { built: 0, suppliesUsed: 0, mcUsed: 0, suppliesSold: 0 };
            }

            // Cap at max
            let toBuild = Math.min(count, maxAllowed - currentCount);

            // Cap by available supplies (always need 1 supply per structure)
            toBuild = Math.min(toBuild, planet.supplies);

            // Cap by total resources
            const totalCost = costs.supplies + costs.mc;
            if (burnSupplies) {
                toBuild = Math.min(toBuild, Math.floor((planet.megacredits + planet.supplies) / totalCost));
            } else {
                toBuild = Math.min(toBuild, Math.floor(planet.megacredits / costs.mc));
            }

            if (toBuild <= 0) {
                return { built: 0, suppliesUsed: 0, mcUsed: 0, suppliesSold: 0 };
            }

            // Calculate resources used
            let suppliesUsed = toBuild * costs.supplies;
            let mcUsed = toBuild * costs.mc;
            let suppliesSold = 0;

            // If we don't have enough MC, sell supplies
            if (planet.megacredits < mcUsed && burnSupplies) {
                suppliesSold = mcUsed - planet.megacredits;
            }

            // Always apply changes to planet (caller passes a copy for preview mode)
            planet.supplies -= suppliesUsed;
            planet.megacredits -= mcUsed;

            if (suppliesSold > 0) {
                planet.megacredits += suppliesSold;
                planet.supplies -= suppliesSold;
                if (markChanged) {
                    planet.suppliessold = (planet.suppliessold || 0) + suppliesSold;
                }
            }

            planet[type] += toBuild;
            if (markChanged) {
                const builtField = 'built' + type;
                planet[builtField] = (planet[builtField] || 0) + toBuild;
                planet.changed = 1;
            }

            return {
                built: toBuild,
                suppliesUsed: suppliesUsed + suppliesSold,
                mcUsed,
                suppliesSold
            };
        }

        /**
         * Calculate ratio build (factories and mines at a ratio)
         * @param {number} numFactories - Target number of factories to add
         * @param {number} numMines - Target number of mines to add
         * @param {number} ratio - Factory:Mine ratio (e.g., 7 means 7:1)
         * @param {boolean} burnSupplies - Whether to burn supplies for MC
         * @param {number} mc - Available megacredits
         * @param {number} supplies - Available supplies
         * @returns {object} {facts, mines} - Number of each to build
         */
        calcRatioBuild(numFactories, numMines, ratio, burnSupplies, mc, supplies) {
            const result = { facts: 0, mines: 0 };

            let supTemp = supplies;
            let mcTemp = mc;
            let cnt = 0;

            for (let i = 0; i < numFactories; i++) {
                // Try to build a factory
                if (supTemp >= 1 && mcTemp >= 3) {
                    result.facts++;
                    supTemp -= 1;
                    mcTemp -= 3;
                } else if (burnSupplies && mcTemp < 3 && supTemp >= (4 - mcTemp)) {
                    // Burn supplies to build
                    result.facts++;
                    supTemp -= (4 - mcTemp);
                    mcTemp = 0;
                } else {
                    break; // Can't build more factories
                }

                // Build a mine every 'ratio' factories
                if (cnt % ratio === 0 && result.mines < numMines) {
                    if (supTemp >= 1 && mcTemp >= 4) {
                        result.mines++;
                        supTemp -= 1;
                        mcTemp -= 4;
                    } else if (burnSupplies && mcTemp < 4 && supTemp >= (5 - mcTemp)) {
                        result.mines++;
                        supTemp -= (5 - mcTemp);
                        mcTemp = 0;
                    }
                }
                cnt++;
            }

            return result;
        }

        /**
         * Reset any structures built this turn on a planet.
         * Restores the planet to its start-of-turn state for structures and resources,
         * so a new build method can be applied cleanly.
         * @param {object} planet - The planet object (will be modified)
         * @returns {boolean} True if any builds were reset
         */
        resetBuilds(planet) {
            const costs = this.getBuildCosts();
            let anyReset = false;

            for (const type of ['factories', 'mines', 'defense']) {
                const builtField = 'built' + type;
                const built = planet[builtField] || 0;
                if (built > 0) {
                    planet[type] -= built;
                    planet.supplies += built * costs[type].supplies;
                    planet.megacredits += built * costs[type].mc;
                    planet[builtField] = 0;
                    anyReset = true;
                }
            }

            // Reverse only supply-to-MC conversions done by the build engine
            // (suppliessold may include player-initiated sales from before the build)
            const preBuildSold = planet._preBuildSuppliessold ?? 0;
            const buildSold = (planet.suppliessold || 0) - preBuildSold;
            if (buildSold > 0) {
                planet.supplies += buildSold;
                planet.megacredits -= buildSold;
                planet.suppliessold -= buildSold;
                anyReset = true;
            }
            delete planet._preBuildSuppliessold;

            if (anyReset) {
                planet.changed = 1;
            }

            return anyReset;
        }

        /**
         * Execute build method on a planet
         * @param {object} planet - The planet object
         * @param {object} method - The build method
         * @param {boolean} preview - If true, calculate but don't apply
         * @returns {object} Result with what was/would be built
         */
        execute(planet, method, preview = false) {
            const plan = this.parseBuildCode(method.code);
            if (!plan) {
                return { success: false, error: 'Invalid build code' };
            }

            const result = {
                success: true,
                factoriesBuilt: 0,
                minesBuilt: 0,
                defenseBuilt: 0,
                suppliesUsed: 0,
                mcUsed: 0,
                suppliesSold: 0
            };

            // Create a working copy if preview mode
            const workPlanet = preview ? { ...planet } : planet;

            // Remember pre-build suppliessold so resetBuilds can distinguish
            // build-engine sales from player-initiated sales.
            // Only set on first invocation — if already set, a previous execute()
            // stored the true baseline and resetBuilds will use it.
            if (workPlanet._preBuildSuppliessold == null) {
                workPlanet._preBuildSuppliessold = workPlanet.suppliessold || 0;
            }

            // Reset any previous builds from this turn before applying new method
            this.resetBuilds(workPlanet);

            for (const instr of plan.instructions) {
                if (instr.type === 'ratio') {
                    // Ratio building: build factories and mines at a ratio
                    const numFactories = Math.max(0, instr.maxFactories - workPlanet.factories);
                    const numMines = Math.max(0, instr.maxMines - workPlanet.mines);

                    const ratioBuild = this.calcRatioBuild(
                        numFactories,
                        numMines,
                        instr.ratio,
                        plan.burnSupplies,
                        workPlanet.megacredits,
                        workPlanet.supplies
                    );

                    // markChanged is true only when not in preview mode
                    const markChanged = !preview;

                    // Build the calculated factories
                    if (ratioBuild.facts > 0) {
                        const factResult = this.buildStructure(
                            workPlanet, 'factories', ratioBuild.facts,
                            plan.burnSupplies, markChanged
                        );
                        result.factoriesBuilt += factResult.built;
                        result.suppliesUsed += factResult.suppliesUsed;
                        result.mcUsed += factResult.mcUsed;
                        result.suppliesSold += factResult.suppliesSold;
                    }

                    // Build the calculated mines
                    if (ratioBuild.mines > 0) {
                        const mineResult = this.buildStructure(
                            workPlanet, 'mines', ratioBuild.mines,
                            plan.burnSupplies, markChanged
                        );
                        result.minesBuilt += mineResult.built;
                        result.suppliesUsed += mineResult.suppliesUsed;
                        result.mcUsed += mineResult.mcUsed;
                        result.suppliesSold += mineResult.suppliesSold;
                    }

                    // Build remaining mines if any target left
                    const remainingMines = Math.max(0, instr.maxMines - workPlanet.mines);
                    if (remainingMines > 0) {
                        const extraMineResult = this.buildStructure(
                            workPlanet, 'mines', remainingMines,
                            plan.burnSupplies, markChanged
                        );
                        result.minesBuilt += extraMineResult.built;
                        result.suppliesUsed += extraMineResult.suppliesUsed;
                        result.mcUsed += extraMineResult.mcUsed;
                        result.suppliesSold += extraMineResult.suppliesSold;
                    }
                } else {
                    // Simple building: factories, mines, or defense
                    const current = workPlanet[instr.type] || 0;
                    const toBuild = Math.max(0, instr.target - current);

                    if (toBuild > 0) {
                        const buildResult = this.buildStructure(
                            workPlanet, instr.type, toBuild,
                            plan.burnSupplies, !preview
                        );

                        if (instr.type === 'factories') {
                            result.factoriesBuilt += buildResult.built;
                        } else if (instr.type === 'mines') {
                            result.minesBuilt += buildResult.built;
                        } else if (instr.type === 'defense') {
                            result.defenseBuilt += buildResult.built;
                        }

                        result.suppliesUsed += buildResult.suppliesUsed;
                        result.mcUsed += buildResult.mcUsed;
                        result.suppliesSold += buildResult.suppliesSold;
                    }
                }
            }

            return result;
        }
    }

    // =========================================================================
    // TAX ENGINE - Taxation logic
    // =========================================================================

    class TaxEngine {
        constructor(dataStore) {
            this.dataStore = dataStore;
        }

        /**
         * Calculate happiness change for a given tax rate
         * @param {object} planet - The planet object
         * @param {number} rate - Tax rate (0-100)
         * @param {boolean} isNative - True for native tax, false for colonist
         * @returns {number} Happiness change
         */
        calculateHappinessChange(planet, rate, isNative) {
            if (isNative) {
                const originalRate = planet.nativetaxrate;
                planet.nativetaxrate = rate;
                const change = vgap.nativeTaxChange(planet);
                planet.nativetaxrate = originalRate;
                return change;
            }

            const originalRate = planet.colonisttaxrate;
            planet.colonisttaxrate = rate;
            const change = vgap.colonistTaxChange(planet);
            planet.colonisttaxrate = originalRate;
            return change;
        }

        /**
         * Find optimal tax rate for target happiness change
         * BUG FIX: Iterate from 100 to 0 to find highest valid rate
         * @param {object} planet - The planet object
         * @param {number} targetMinHappy - Minimum acceptable happiness after change
         * @param {boolean} isNative - True for native tax
         * @returns {number} Optimal tax rate
         */
        findOptimalRate(planet, targetMinHappy, isNative) {
            const currentHappy = isNative ? planet.nativehappypoints : planet.colonisthappypoints;

            // Find highest rate where happiness stays above target
            let maxRate = 0;
            for (let rate = 100; rate >= 0; rate--) {
                const change = this.calculateHappinessChange(planet, rate, isNative);
                const resultingHappy = currentHappy + change;

                if (resultingHappy >= targetMinHappy) {
                    maxRate = rate;
                    break;
                }
            }

            // For native tax: don't tax higher than needed for max income.
            // Native income is capped by colonist clans, so higher rates just
            // waste happiness without producing more MC.
            if (isNative && maxRate > 0) {
                const maxIncome = this.calcNativeTaxIncome(planet, maxRate);
                for (let rate = 0; rate <= maxRate; rate++) {
                    if (this.calcNativeTaxIncome(planet, rate) >= maxIncome) {
                        // Check if the cap is eating more than we gain. If so,
                        // drop one rate — the happiness cost isn't worth it.
                        // Exception: if happiness still hits 100 at this rate,
                        // there's no real cost, so take the income.
                        const possibleIncome = this.calcNativeTaxIncome(planet, rate, true);
                        if (rate > 0 && possibleIncome > maxIncome) {
                            const resultingHappy = currentHappy + this.calculateHappinessChange(planet, rate, true);
                            if (resultingHappy < 100) {
                                const prevIncome = this.calcNativeTaxIncome(planet, rate - 1);
                                const gained = maxIncome - prevIncome;
                                const lost = possibleIncome - maxIncome;
                                if (gained < lost) return rate - 1;
                            }
                        }
                        return rate;
                    }
                }
            }

            return maxRate;
        }

        /**
         * Determine population tier for tax method selection
         * @param {object} planet - The planet object
         * @param {boolean} isNative - True for native population
         * @returns {string} 'normal', 'mid', or 'max'
         */
        getPopulationTier(planet, isNative) {
            const clans = isNative ? planet.nativeclans : planet.clans;
            const maxClans = this.getMaxPopulation(planet, isNative);

            if (clans >= maxClans) {
                return 'max';
            }

            // 6.6M clans = 66000 * 100 = mid threshold
            if (!isNative && clans >= 66000) {
                return 'mid';
            }

            return 'normal';
        }

        /**
         * Get maximum population for a planet (in clans)
         */
        getMaxPopulation(planet, isNative) {
            if (isNative) {
                return vgap.nativeMaxPop(planet);
            }
            return vgap.colMaxPop(planet);
        }

        /**
         * Execute tax method on a planet
         * @param {object} planet - The planet object
         * @param {object} method - The tax method
         * @param {string} taxType - 'colonist' or 'native'
         * @param {boolean} preview - If true, calculate but don't apply
         * @returns {object} Result with calculated rate and projected income
         */
        execute(planet, method, taxType, preview = false) {
            const isNative = taxType === 'native';

            // Check minimum clans requirement
            const clans = isNative ? planet.nativeclans : planet.clans;
            if (method.minClans && clans < method.minClans) {
                return { success: true, rate: 0, income: 0, reason: 'Below minimum clans' };
            }

            // Determine which tier settings to use
            const tier = this.getPopulationTier(planet, isNative);
            let activeMethod = method.method;
            let minHappy = method.minHappy;
            let maxHappy = method.maxHappy;

            if (tier === 'mid' && !method.midsame) {
                activeMethod = method.midmethod || method.method;
                minHappy = method.midMinHappy || method.minHappy;
                maxHappy = method.midMaxHappy || method.maxHappy;
            } else if (tier === 'max' && !method.maxsame) {
                activeMethod = method.maxmethod || method.method;
                minHappy = method.maxMinHappy || method.minHappy;
                maxHappy = method.maxMaxHappy || method.maxHappy;
            }

            // Growth makes no sense at max population (no growth possible),
            // so fall back to Safe behavior. At mid tier (>6.6M), growth is
            // halved but still happens, so Growth remains valid there.
            if (activeMethod === 'Growth' && tier === 'max') {
                activeMethod = 'Safe';
            }

            let rate = 0;
            const currentHappy = isNative ? planet.nativehappypoints : planet.colonisthappypoints;

            switch (activeMethod) {
                case 'Growth':
                    // Tax down to minHappy, then recover to maxHappy
                    if (currentHappy >= maxHappy) {
                        rate = this.findOptimalRate(planet, minHappy, isNative);
                    } else {
                        // Recovery phase: normally 0% tax to let happiness rise.
                        // But if 0% would push happiness above 100 (the hard cap),
                        // tax just enough to land at exactly 100 — no wasted recovery.
                        const recoveryChange = this.calculateHappinessChange(planet, 0, isNative);
                        if (currentHappy + recoveryChange > 100) {
                            rate = this.findOptimalRate(planet, 100, isNative);
                        } else {
                            rate = 0;
                        }
                    }
                    break;

                case 'Safe':
                    // Maintain happiness at minHappy level
                    rate = this.findOptimalRate(planet, minHappy, isNative);
                    break;

                case 'Riot':
                    rate = 100;
                    break;

                case 'NoTax':
                    rate = 0;
                    break;

                case 'Auto':
                    // Let built-in handle it
                    return { success: true, rate: null, income: null, reason: 'Using built-in auto-tax' };

                default:
                    rate = 0;
            }

            // Cyborg: cap native tax at 20% (higher rates yield no additional
            // income but still reduce happiness due to assimilation mechanics)
            if (isNative && vgap.player && vgap.player.raceid === 6) {
                rate = Math.min(rate, 20);
            }

            // Calculate projected income (capped at 5000 MC, the game limit)
            const income = Math.min(5000, isNative
                ? this.calcNativeTaxIncome(planet, rate)
                : this.calcColonistTaxIncome(planet, rate));

            // Apply if not preview
            if (!preview) {
                if (isNative) {
                    planet.nativetaxrate = rate;
                } else {
                    planet.colonisttaxrate = rate;
                }
                planet.changed = 1;
            }

            return {
                success: true,
                rate,
                income,
                tier,
                method: activeMethod,
                minHappy
            };
        }

        /**
         * Calculate colonist tax income for a given rate.
         * Temporarily sets the rate, queries the vgap API, then restores.
         */
        calcColonistTaxIncome(planet, rate) {
            const originalRate = planet.colonisttaxrate;
            planet.colonisttaxrate = rate;
            const income = vgap.colonistTaxAmount(planet);
            planet.colonisttaxrate = originalRate;
            return income;
        }

        /**
         * Calculate native tax income for a given rate.
         * Temporarily sets the rate, queries the vgap API, then restores.
         * @param {boolean} [possible=false] - false = actual income (capped by
         *   colonist clans), true = hypothetical uncapped income
         */
        calcNativeTaxIncome(planet, rate, possible = false) {
            const originalRate = planet.nativetaxrate;
            planet.nativetaxrate = rate;
            const income = vgap.nativeTaxAmount(planet, possible);
            planet.nativetaxrate = originalRate;
            return income;
        }
    }

    // =========================================================================
    // DASHBOARD UI HELPERS - Pure calculation helpers for planet stat display
    // =========================================================================

    function calcColonistHappyChange(planet) {
        return vgap.colonistTaxChange(planet);
    }

    function calcNativeHappyChange(planet) {
        if (!planet.nativeclans || planet.nativetype === 0) return 0;
        return vgap.nativeTaxChange(planet);
    }

    function calcColonistIncome(planet) {
        return vgap.colonistTaxAmount(planet);
    }

    function calcNativeIncome(planet) {
        if (!planet.nativeclans || planet.nativetype === 0 || planet.nativetype === 5) return 0;
        return vgap.nativeTaxAmount(planet, false);
    }

    function getDisplayRaceName(planet) {
        const races = ['None', 'Humanoid', 'Bovinoid', 'Reptilian', 'Avian',
            'Amorphous', 'Insectoid', 'Amphibian', 'Ghipsoldal', 'Siliconoid'];
        return races[planet.nativetype] || 'Unknown';
    }

    function planetTagsHtml(planet) {
        let tags = '';
        if (vgap.homeworld && vgap.homeworld.id === planet.id) tags += '<span class="homeworld">HW</span>';
        if (vgap.getStarbase(planet.id)) tags += '<span class="sb-tag">SB</span>';
        else if (planet.buildingstarbase) tags += '<span class="building-sb-tag">Building SB</span>';
        return tags ? `<div class="econPlanetTags">${tags}</div>` : '';
    }

    // =========================================================================
    // DASHBOARD UI - Main user interface
    // =========================================================================

    class DashboardUI {
        constructor(controller) {
            this.controller = controller;
            this.currentView = 'management';
            this.currentFilter = 'all';

            // Filter definitions
            this.filters = {
                all: { label: 'All', fn: () => true },
                withNatives: { label: 'With Natives', fn: p => p.nativeclans > 0 },
                withoutNatives: { label: 'Without Natives', fn: p => !p.nativeclans || p.nativeclans === 0 },
                highPop: { label: '>1M Colonists', fn: p => (p.clans || 0) >= 10000 },
                noBuild: { label: 'No Build Method', fn: p => {
                    const assignment = this.controller.dataStore.buildAssignments[p.id];
                    return assignment === 'm' || assignment === undefined;
                }},
                noColTax: { label: 'No Col Tax', fn: p => {
                    const assignment = this.controller.dataStore.colonistTaxAssignments[p.id];
                    return assignment === 'm' || assignment === undefined;
                }},
                noNatTax: { label: 'No Nat Tax', fn: p => {
                    if (!p.nativeclans || p.nativeclans === 0) return false;
                    if (p.nativetype === 5) return false; // Amorphous can't be taxed
                    const assignment = this.controller.dataStore.nativeTaxAssignments[p.id];
                    return assignment === 'm' || assignment === undefined;
                }},
                hasStarbase: { label: 'Has Starbase', fn: p => vgap.getStarbase(p.id) != null },
                canBuildSB: { label: 'Can Build SB', fn: p => {
                    return vgap.pl.canBuildStarbase(p);
                }},
                vanillaEnabled: { label: 'Using Built-in', fn: p => {
                    return this.controller.vanillaDetector.getWarnings(p).length > 0;
                }}
            };
        }

        /**
         * Get filtered list of planets
         */
        getFilteredPlanets() {
            const planets = vgap.myplanets || [];
            const filterFn = this.filters[this.currentFilter]?.fn || (() => true);
            return planets.filter(filterFn);
        }

        /**
         * Add menu entry to dashboard
         */
        addMenuEntry() {
            const menuHtml = `<li id="econMgmtMenu" style="color:#FFF000">Economy Management »</li>`;

            // Find dashboard menu and add our entry
            const dashMenu = document.querySelector('.DashboardMenu, #DashboardMenu');
            if (dashMenu) {
                const li = document.createElement('li');
                li.id = 'econMgmtMenu';
                li.style.color = '#FFF000';
                li.textContent = 'Economy Management »';
                li.onclick = () => this.render();
                dashMenu.appendChild(li);
            }
        }

        /**
         * Add icon to dashboard home
         */
        addHomeIcon() {
            // Check if already added
            if (document.getElementById('econMgmtHomeIcon')) return;

            // Find the TurnSummary container
            const turnSummary = document.getElementById('TurnSummary');
            if (!turnSummary) return;

            // Create icon container matching the game's icon style
            const iconSpan = document.createElement('span');
            iconSpan.id = 'econMgmtHomeIcon';
            iconSpan.style.color = '#FFF000';
            iconSpan.style.cursor = 'pointer';
            iconSpan.innerHTML = '<div class="iconholder"><img src="https://mobile.planets.nu/img/icons/blacksquares/planets.png"/></div>Economy Management';
            iconSpan.onclick = () => this.render();

            turnSummary.appendChild(iconSpan);
        }

        /**
         * Render the main dashboard view
         */
        render() {
            console.log('[Economy Management] Rendering dashboard...');

            // Get dashboard content area
            if (!vgap.dash || !vgap.dash.content) {
                console.warn('[Economy Management] Dashboard content area not available');
                return;
            }

            vgap.dash.content.empty();

            const html = `
                <div id="econMgmtDash" style="padding: 10px;">
                    <h2 style="color: #FFF000; margin-bottom: 15px;">Economy Management v${PLUGIN_VERSION}</h2>

                    <div id="econMgmtTabs" style="margin-bottom: 15px;">
                        <button class="econTab active" data-view="management">Planet Management</button>
                        <button class="econTab" data-view="buildMethods">Build Methods</button>
                        <button class="econTab" data-view="taxMethods">Tax Methods</button>
                        <button class="econTab" data-view="help">Help</button>
                    </div>

                    <div id="econMgmtContent">
                        <!-- Content will be inserted here -->
                    </div>
                </div>
            `;

            vgap.dash.content.html(html);

            // Add tab click handlers
            document.querySelectorAll('.econTab').forEach(tab => {
                tab.onclick = () => {
                    document.querySelectorAll('.econTab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this.currentView = tab.dataset.view;
                    this.renderCurrentView();
                };
            });

            // Add basic styles
            this.addStyles();

            // Render initial view
            this.renderCurrentView();
        }

        /**
         * Add CSS styles
         */
        addStyles() {
            if (document.getElementById('econMgmtStyles')) return;

            const css = `
                #econMgmtDash {
                    font-family: Arial, sans-serif;
                    color: #FFFFFF;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                }
                #econMgmtContent {
                    flex: 1;
                    overflow-y: auto;
                    max-height: calc(100vh - 200px);
                }
                .econTab {
                    background: #333;
                    color: #FFF;
                    border: 1px solid #666;
                    padding: 8px 16px;
                    margin-right: 5px;
                    cursor: pointer;
                }
                .econTab:hover {
                    background: #555;
                }
                .econTab.active {
                    background: #FFF000;
                    color: #000;
                }
                .econPlanetTable {
                    width: 100%;
                    border-collapse: collapse;
                }
                .econPlanetTable th, .econPlanetTable td {
                    padding: 8px;
                    text-align: left;
                    border-bottom: 1px solid #444;
                }
                .econPlanetTable th {
                    background: #333;
                    color: #FFF000;
                }
                .econPlanetTable tr:hover {
                    background: #2a2a2a;
                }
                .econSelect {
                    background: #333;
                    color: #FFF;
                    border: 1px solid #666;
                    padding: 4px;
                }
                .econButton {
                    background: #FFF000;
                    color: #000;
                    border: none;
                    padding: 10px 20px;
                    cursor: pointer;
                    font-weight: bold;
                    margin: 10px 5px 10px 0;
                }
                .econButton:hover {
                    background: #FFD700;
                }
                .econButton:disabled {
                    background: #666;
                    color: #999;
                    cursor: not-allowed;
                }
                .econPlanetName {
                    color: #00FFFF;
                    cursor: pointer;
                    text-decoration: none;
                }
                .econPlanetName:hover {
                    text-decoration: underline;
                }
                .econPlanetTags {
                    font-size: 0.75em;
                    margin-top: 2px;
                }
                .econPlanetTags span {
                    display: inline;
                    padding: 1px 4px;
                    border-radius: 3px;
                    margin-right: 4px;
                    font-weight: bold;
                }
                .econPlanetTags .homeworld {
                    color: #00cc00;
                    border: 1px solid #00cc00;
                }
                .econPlanetTags .sb-tag {
                    color: #00cccc;
                    border: 1px solid #00cccc;
                }
                .econPlanetTags .building-sb-tag {
                    color: #ee8800;
                    border: 1px solid #ee8800;
                }
                .econTierTag {
                    display: inline;
                    font-size: 0.85em;
                    padding: 0px 3px;
                    border-radius: 3px;
                    margin-left: 4px;
                    font-weight: bold;
                }
                .econTierTag.overpop {
                    color: #FF4444;
                    border: 1px solid #FF4444;
                }
                .econTierTag.max {
                    color: #FFF000;
                    border: 1px solid #FFF000;
                }
                .econTierTag.high {
                    color: #FFF000;
                    border: 1px solid #FFF000;
                }
                .econInfoBox {
                    background: #1a2a3a;
                    border: 1px solid #4488aa;
                    border-radius: 4px;
                    padding: 10px 15px;
                    margin-bottom: 15px;
                    color: #aaccdd;
                }
                .econDisabled {
                    color: #666;
                    font-style: italic;
                }
                .econFilterBar {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 5px;
                    margin-bottom: 15px;
                }
                .econFilter {
                    background: #333;
                    color: #AAA;
                    border: 1px solid #555;
                    padding: 4px 8px;
                    cursor: pointer;
                    font-size: 12px;
                }
                .econFilter:hover {
                    background: #444;
                    color: #FFF;
                }
                .econFilter.active {
                    background: #FFF000;
                    color: #000;
                    border-color: #FFF000;
                }
                .econFilterCount {
                    color: #888;
                    font-size: 11px;
                    margin-left: 3px;
                }
                .econCellContent {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 3px;
                }
                .econCellStats {
                    font-size: 11px;
                    color: #FFF;
                    white-space: nowrap;
                }
                .econCellStats span {
                    display: inline !important;
                }
                .econCellStats .econHappyLine {
                    display: block !important;
                }
            `;

            const style = document.createElement('style');
            style.id = 'econMgmtStyles';
            style.textContent = css;
            document.head.appendChild(style);
        }

        /**
         * Render current view based on selected tab
         */
        renderCurrentView() {
            const content = document.getElementById('econMgmtContent');
            if (!content) return;

            switch (this.currentView) {
                case 'management':
                    this.renderManagementView(content);
                    break;
                case 'buildMethods':
                    this.renderBuildMethodsView(content);
                    break;
                case 'taxMethods':
                    this.renderTaxMethodsView(content);
                    break;
                case 'help':
                    this.renderHelpView(content);
                    break;
            }
        }

        /**
         * Return inline color style for a resulting happiness value.
         */
        _happyColor(resulting) {
            if (resulting < 40) return 'color:#FF4444';
            if (resulting < 70) return 'color:#FFAA44';
            return '';
        }

        /**
         * Render structure stats: M:19/45  F:14+5/45  D:5/45
         * planet.factories already includes builtfactories, so current = factories - built.
         * The +N suffix is omitted when nothing is being built.
         */
        _structStatsHtml(planet, maxStructures) {
            const bf = planet.builtfactories || 0;
            const bm = planet.builtmines || 0;
            const bd = planet.builtdefense || 0;
            const fCurrent = planet.factories - bf;
            const mCurrent = planet.mines - bm;
            const dCurrent = planet.defense - bd;
            const fStr = bf > 0 ? `F:${fCurrent}+${bf}/${maxStructures.factories}` : `F:${planet.factories}/${maxStructures.factories}`;
            const mStr = bm > 0 ? `M:${mCurrent}+${bm}/${maxStructures.mines}` : `M:${planet.mines}/${maxStructures.mines}`;
            const dStr = bd > 0 ? `D:${dCurrent}+${bd}/${maxStructures.defense}` : `D:${planet.defense}/${maxStructures.defense}`;
            return `${mStr} &nbsp; ${fStr} &nbsp; ${dStr}`;
        }

        /**
         * Render mining output: N:12  D:5  T:8  M:3
         */
        _miningStatsHtml(planet) {
            if (!planet.mines) return '';
            const n = vgap.miningAmount(planet, planet.groundneutronium || 0, planet.densityneutronium || 0, planet.mines);
            const d = vgap.miningAmount(planet, planet.groundduranium || 0, planet.densityduranium || 0, planet.mines);
            const t = vgap.miningAmount(planet, planet.groundtritanium || 0, planet.densitytritanium || 0, planet.mines);
            const mo = vgap.miningAmount(planet, planet.groundmolybdenum || 0, planet.densitymolybdenum || 0, planet.mines);
            return `Mining: N:${n} &nbsp; D:${d} &nbsp; T:${t} &nbsp; M:${mo}`;
        }

        /**
         * Return a short, color-coded population tier tag, or empty string for normal tier.
         */
        _popTierTag(planet, isNative) {
            const te = this.controller.taxEngine;
            const tier = te.getPopulationTier(planet, isNative);
            if (tier === 'max') {
                const clans = isNative ? planet.nativeclans : planet.clans;
                const maxClans = te.getMaxPopulation(planet, isNative);
                if (clans > maxClans) {
                    return ' <span class="econTierTag overpop">overpop</span>';
                }
                return ' <span class="econTierTag max">max</span>';
            }
            if (tier === 'mid') {
                return ' <span class="econTierTag high">high</span>';
            }
            return '';
        }

        /**
         * Render colonist stats as a single line: 5040C H:85(+3) 50MC
         * The delta and income are colored via inline style based on resulting happiness.
         */
        _colonistStatsHtml(planet) {
            const clans = planet.clans || 0;
            const happy = planet.colonisthappypoints || 0;
            const delta = calcColonistHappyChange(planet);
            const income = calcColonistIncome(planet);
            const sign = delta >= 0 ? '+' : '';
            const color = this._happyColor(happy + delta);
            const style = color ? ` style="${color}"` : '';
            const tierTag = this._popTierTag(planet, false);
            return `${clans}C${tierTag} <span class="econHappyLine"${style}>H:${happy}(${sign}${delta}) ${income}MC</span>`;
        }

        /**
         * Render native stats: Avian 2000C  H:72(-2) 30MC
         * The delta and income are colored via inline style based on resulting happiness.
         */
        _nativeStatsHtml(planet) {
            if (!planet.nativeclans || planet.nativetype === 0) return '';
            const raceName = getDisplayRaceName(planet);
            const clans = planet.nativeclans;
            const happy = planet.nativehappypoints || 0;
            const delta = calcNativeHappyChange(planet);
            const income = calcNativeIncome(planet);
            const sign = delta >= 0 ? '+' : '';
            const color = this._happyColor(happy + delta);
            const style = color ? ` style="${color}"` : '';
            const tierTag = this._popTierTag(planet, true);
            return `${raceName} ${clans}C${tierTag} <span class="econHappyLine"${style}>H:${happy}(${sign}${delta}) ${income}MC</span>`;
        }

        /**
         * Render planet management view
         */
        renderManagementView(container) {
            const ds = this.controller.dataStore;
            const vd = this.controller.vanillaDetector;
            const allPlanets = vgap.myplanets || [];
            const filteredPlanets = this.getFilteredPlanets();

            // Count planets with built-in features enabled
            const builtInCount = allPlanets.filter(p => vd.getWarnings(p).length > 0).length;

            // Build filter buttons HTML
            let filterHtml = '<div class="econFilterBar">';
            for (const [key, filter] of Object.entries(this.filters)) {
                const count = allPlanets.filter(filter.fn).length;
                const isActive = this.currentFilter === key;
                filterHtml += `<button class="econFilter ${isActive ? 'active' : ''}" data-filter="${key}">
                    ${filter.label}<span class="econFilterCount">(${count})</span>
                </button>`;
            }
            filterHtml += '</div>';

            let html = `
                <div style="margin-bottom: 15px;">
                    <button class="econButton" id="econApplyAll">Apply All Methods</button>
                    <button class="econButton" id="econApplyFiltered" style="background: #888;">Apply to Filtered (${filteredPlanets.length})</button>
                </div>

                ${filterHtml}

                ${builtInCount > 0 ? `
                <div class="econInfoBox">
                    <strong>Info: ${builtInCount} planet${builtInCount > 1 ? 's use' : ' uses'} built-in automation</strong><br>
                    These planets have built-in auto-build or native auto-tax enabled, so the corresponding
                    Economy Management controls are disabled. You can mix both systems across your planets,
                    or disable built-in features in the planet's Buildings/Natives tab to use this plugin instead.
                </div>
                ` : ''}

                <div style="margin-bottom: 10px; color: #888;">
                    Showing ${filteredPlanets.length} of ${allPlanets.length} planets
                </div>

                <table class="econPlanetTable">
                    <thead>
                        <tr>
                            <th>Planet</th>
                            <th>Build Method</th>
                            <th>Colonist Tax</th>
                            <th>Native Tax</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            // Build method options
            const buildOptions = '<option value="m">Manual</option>' +
                Object.entries(ds.buildMethods).map(([id, m]) => `<option value="${id}">${m.name}</option>`).join('') +
                '<option value="custom">Custom...</option>';

            // Tax method options (filter by type)
            const colTaxOptions = '<option value="m">Manual</option>' +
                Object.entries(ds.taxMethods)
                    .filter(([, m]) => m.taxType === 'C' || m.taxType === 'CN')
                    .map(([id, m]) => `<option value="${id}">${m.name}</option>`)
                    .join('');

            const natTaxOptions = '<option value="m">Manual</option>' +
                Object.entries(ds.taxMethods)
                    .filter(([, m]) => m.taxType === 'N' || m.taxType === 'CN')
                    .map(([id, m]) => `<option value="${id}">${m.name}</option>`)
                    .join('');

            for (const planet of filteredPlanets) {
                const buildDisabled = !vd.canApplyBuildMethod(planet);
                const natTaxDisabled = !vd.canApplyNativeTax(planet);
                const hasNatives = planet.nativeclans > 0;

                const buildAssign = ds.buildAssignments[planet.id] ?? 'm';
                const isCustomBuild = typeof buildAssign === 'object' && buildAssign.code;
                const buildVal = isCustomBuild ? 'custom' : buildAssign;
                const colTaxVal = ds.colonistTaxAssignments[planet.id] ?? 'm';
                const natTaxVal = ds.nativeTaxAssignments[planet.id] ?? 'm';

                const maxStructures = this.controller.buildEngine.getMaxStructures(planet);
                const structStats = this._structStatsHtml(planet, maxStructures);
                const miningStats = this._miningStatsHtml(planet);
                const colStats = this._colonistStatsHtml(planet);
                const natStats = hasNatives ? this._nativeStatsHtml(planet) : '';

                html += `
                    <tr data-planet-id="${planet.id}">
                        <td><span class="econPlanetName" data-planet-id="${planet.id}">${planet.id}: ${planet.name}</span>${planetTagsHtml(planet)}</td>
                        <td>
                            <div class="econCellContent">
                                ${buildDisabled
                                    ? '<span class="econDisabled">Using built-in</span>'
                                    : `<select class="econSelect econBuildSelect" data-planet-id="${planet.id}">
                                        ${buildOptions.replace(`value="${buildVal}"`, `value="${buildVal}" selected`)}
                                    </select>
                                    ${isCustomBuild ? `<input type="text" class="econSelect econCustomBuildCode" data-planet-id="${planet.id}" value="${buildAssign.code}" style="width: 100%; margin-top: 3px; font-size: 11px;">` : ''}`
                                }
                                <span class="econCellStats">${structStats}</span>
                                <span class="econCellStats">${miningStats}</span>
                            </div>
                        </td>
                        <td>
                            <div class="econCellContent">
                                <select class="econSelect econColTaxSelect" data-planet-id="${planet.id}">
                                    ${colTaxOptions.replace(`value="${colTaxVal}"`, `value="${colTaxVal}" selected`)}
                                </select>
                                <span class="econCellStats">${colStats}</span>
                            </div>
                        </td>
                        <td>
                            <div class="econCellContent">
                                ${!hasNatives
                                    ? '<span class="econDisabled">No natives</span>'
                                    : natTaxDisabled
                                        ? '<span class="econDisabled">Using built-in</span>'
                                        : `<select class="econSelect econNatTaxSelect" data-planet-id="${planet.id}">
                                            ${natTaxOptions.replace(`value="${natTaxVal}"`, `value="${natTaxVal}" selected`)}
                                        </select>`
                                }
                                ${natStats ? `<span class="econCellStats">${natStats}</span>` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }

            html += `
                    </tbody>
                </table>
            `;

            container.innerHTML = html;

            // Add event handlers
            this.attachManagementHandlers();
        }

        /**
         * Attach event handlers for management view
         */
        attachManagementHandlers() {
            const ds = this.controller.dataStore;

            // Build method selectors
            document.querySelectorAll('.econBuildSelect').forEach(select => {
                select.onchange = () => {
                    const planetId = parseInt(select.dataset.planetId, 10);
                    if (select.value === 'custom') {
                        // Pre-populate with code from previously selected method
                        const prevAssign = ds.buildAssignments[planetId];
                        let code = '';
                        if (typeof prevAssign === 'object' && prevAssign.code) {
                            code = prevAssign.code;
                        } else if (typeof prevAssign === 'string' && ds.buildMethods[prevAssign]) {
                            code = ds.buildMethods[prevAssign].code;
                        }
                        ds.setBuildAssignment(planetId, { code });
                        this.renderManagementView(document.getElementById('econMgmtContent'));
                    } else {
                        ds.setBuildAssignment(planetId, select.value);
                    }
                };
            });

            // Custom build code inputs
            document.querySelectorAll('.econCustomBuildCode').forEach(input => {
                input.onchange = () => {
                    const planetId = parseInt(input.dataset.planetId, 10);
                    ds.setBuildAssignment(planetId, { code: input.value.trim() });
                };
            });

            // Colonist tax selectors
            document.querySelectorAll('.econColTaxSelect').forEach(select => {
                select.onchange = () => {
                    const planetId = parseInt(select.dataset.planetId, 10);
                    ds.setColonistTaxAssignment(planetId, select.value);
                };
            });

            // Native tax selectors
            document.querySelectorAll('.econNatTaxSelect').forEach(select => {
                select.onchange = () => {
                    const planetId = parseInt(select.dataset.planetId, 10);
                    ds.setNativeTaxAssignment(planetId, select.value);
                };
            });

            // Apply All button
            const applyBtn = document.getElementById('econApplyAll');
            if (applyBtn) {
                applyBtn.onclick = () => this.controller.applyAllMethods();
            }

            // Apply to Filtered button
            const applyFilteredBtn = document.getElementById('econApplyFiltered');
            if (applyFilteredBtn) {
                applyFilteredBtn.onclick = () => {
                    const filteredPlanets = this.getFilteredPlanets();
                    this.controller.applyMethodsToPlanets(filteredPlanets);
                };
            }

            // Filter buttons
            document.querySelectorAll('.econFilter').forEach(btn => {
                btn.onclick = () => {
                    this.currentFilter = btn.dataset.filter;
                    this.renderCurrentView();
                };
            });

            // Planet name click - navigate to starmap
            document.querySelectorAll('.econPlanetName').forEach(span => {
                span.onclick = () => {
                    const planetId = parseInt(span.dataset.planetId, 10);
                    vgap.map.selectPlanet(planetId);
                };
            });
        }

        /**
         * Render build methods configuration view
         */
        renderBuildMethodsView(container) {
            const ds = this.controller.dataStore;
            const be = this.controller.buildEngine;
            const editFormHtml = (id, m, prefix) => `
                <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 4px;">
                    <div style="margin-bottom: 8px;">
                        <label style="display: inline-block; width: 80px;">Name:</label>
                        <input type="text" class="econSelect" id="${prefix}Name${id}" style="width: 200px;" value="${m.name.replace(/"/g, '&quot;')}">
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="display: inline-block; width: 80px;">Code:</label>
                        <input type="text" class="econSelect" id="${prefix}Code${id}" style="width: 300px;" value="${m.code}">
                    </div>
                    <div id="${prefix}Preview${id}" style="color: #AAA; margin-bottom: 8px; margin-left: 84px;">${be.getBuildCodeDescription(m.code)}</div>
                    <button class="econButton" data-save-build="${id}" style="margin-right: 8px;">Save</button>
                    <button class="econButton" data-cancel-build="${id}" style="background: #555;">Cancel</button>
                </div>
            `;

            let html = `
                <h3 style="color: #FFF000;">Build Methods</h3>

                ${!ds.buildInfoDismissed ? `
                <div class="econInfoBox" style="margin-bottom: 15px;">
                    The default build methods are examples to demonstrate the build engine's capabilities.
                    Feel free to edit, rename, delete, or add your own methods to match your play style.
                    For an explanation of the build codes, see the help screen.
                    <div style="margin-top: 8px; text-align: right;">
                        <button class="econButton" id="dismissBuildInfo" style="padding: 3px 10px;">Dismiss</button>
                    </div>
                </div>
                ` : ''}

                <div class="econInfoBox" style="margin-bottom: 15px;">
                    <strong>Safe defense level <code>S</code></strong><br>
                    <span style="color: #888; font-size: 12px;">Structures beyond 15 factories or 20 mines can be detected by enemy sensor sweeps. Each defense post reduces detection chance by ~6.67%.
                    Use <code>d-S</code> in build codes to reference this setting.</span>
                    <div style="margin-top: 8px;">
                        <label style="display: block; margin-bottom: 4px; cursor: pointer;">
                            <input type="radio" name="safeDefenseLevel" value="15" ${!ds._safeDefenseCustom && ds.safeDefenseLevel === 15 ? 'checked' : ''}>
                            S = 15 <span style="color: #888;">- Sensor Sweep protection ~99%</span>
                        </label>
                        <label style="display: block; margin-bottom: 4px; cursor: pointer;">
                            <input type="radio" name="safeDefenseLevel" value="16" ${!ds._safeDefenseCustom && ds.safeDefenseLevel === 16 ? 'checked' : ''}>
                            S = 16 <span style="color: #888;">- Full Sensor Sweep protection</span>
                        </label>
                        <label style="display: block; margin-bottom: 4px; cursor: pointer;">
                            <input type="radio" name="safeDefenseLevel" value="20" ${!ds._safeDefenseCustom && ds.safeDefenseLevel === 20 ? 'checked' : ''}>
                            S = 20 <span style="color: #888;">- Block Bioscans</span>
                        </label>
                        <label style="display: block; margin-bottom: 4px; cursor: pointer;">
                            <input type="radio" name="safeDefenseLevel" value="30" ${!ds._safeDefenseCustom && ds.safeDefenseLevel === 30 ? 'checked' : ''}>
                            S = 30 <span style="color: #888;">- Enable Ion Pulse to decloak Super Spy ships</span>
                        </label>
                        <label style="display: block; cursor: pointer;">
                            <input type="radio" name="safeDefenseLevel" value="custom" ${ds._safeDefenseCustom ? 'checked' : ''}>
                            S = <input type="number" id="customSafeDefense" class="econSelect" style="width: 60px;" value="${ds.safeDefenseLevel}" min="0" max="999">
                            <span style="color: #888;">- Custom</span>
                        </label>
                    </div>
                </div>

                <table class="econPlanetTable" style="margin-bottom: 20px;">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Code</th>
                            <th>Description</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            for (const [id, method] of Object.entries(ds.buildMethods)) {
                const desc = be.getBuildCodeDescription(method.code);
                html += `
                    <tr>
                        <td>${method.name}</td>
                        <td><code style="user-select: text; cursor: text;">${method.code}</code></td>
                        <td>${desc}</td>
                        <td style="white-space: nowrap;">
                            <button class="econButton" data-edit-build="${id}" style="padding: 3px 10px;">Edit</button>
                            <button class="econButton" data-delete-build="${id}" style="background: #AA0000; padding: 3px 10px; margin-left: 4px;">Delete</button>
                        </td>
                    </tr>
                    <tr class="econBuildEditRow" id="editBuildRow${id}" style="display: none;"><td colspan="4" style="padding: 0;">${editFormHtml(id, method, 'editBuild')}</td></tr>
                `;
            }

            html += `
                    </tbody>
                </table>

                <h4 style="color: #FFF000;">Add New Build Method</h4>
                <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 5px;">
                    <div style="margin-bottom: 10px;">
                        <label style="display: inline-block; width: 80px;">Name:</label>
                        <input type="text" id="newBuildName" class="econSelect" style="width: 200px;">
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label style="display: inline-block; width: 80px;">Code:</label>
                        <input type="text" id="newBuildCode" class="econSelect" style="width: 300px;" placeholder="y-f-15-m-20-d-16">
                    </div>
                    <div id="newBuildPreview" style="color: #AAA; margin-bottom: 10px; margin-left: 84px;"></div>
                    <button class="econButton" id="addBuildMethod">Add Method</button>
                </div>

                <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #444;">
                    <button class="econButton" id="resetBuildDefaults" style="background: #AA0000;">Reset Build Methods to Defaults</button>
                    <span style="color: #888; font-size: 12px; margin-left: 10px;">
                        Deletes all build methods, replaces them with the plugin defaults, and sets all planets to Manual.
                        This is also the only way to obtain new default methods added in a plugin update.
                    </span>
                </div>
            `;

            container.innerHTML = html;

            // Dismiss info box
            const dismissBtn = document.getElementById('dismissBuildInfo');
            if (dismissBtn) {
                dismissBtn.onclick = () => {
                    ds.buildInfoDismissed = true;
                    ds.saveBuildMethods();
                    this.renderBuildMethodsView(container);
                };
            }

            // Safe defense level radio buttons
            const customInput = document.getElementById('customSafeDefense');
            const presetValues = [15, 16, 20, 30];
            // Track whether custom radio is explicitly selected
            ds._safeDefenseCustom = ds._safeDefenseCustom || !presetValues.includes(ds.safeDefenseLevel);
            document.querySelectorAll('input[name="safeDefenseLevel"]').forEach(radio => {
                radio.onchange = () => {
                    if (radio.value === 'custom') {
                        ds._safeDefenseCustom = true;
                        customInput.focus();
                    } else {
                        ds._safeDefenseCustom = false;
                        ds.safeDefenseLevel = parseInt(radio.value, 10);
                        ds.saveBuildMethods();
                        this.renderBuildMethodsView(document.getElementById('econMgmtContent'));
                    }
                };
            });
            // Custom input: select custom radio and update on change
            if (customInput) {
                customInput.onfocus = () => {
                    ds._safeDefenseCustom = true;
                    document.querySelector('input[name="safeDefenseLevel"][value="custom"]').checked = true;
                };
                customInput.onchange = () => {
                    ds.safeDefenseLevel = parseInt(customInput.value, 10) || 16;
                    ds.saveBuildMethods();
                    this.renderBuildMethodsView(document.getElementById('econMgmtContent'));
                };
            }

            // Preview on code input (Add New form)
            const codeInput = document.getElementById('newBuildCode');
            const preview = document.getElementById('newBuildPreview');
            if (codeInput && preview) {
                codeInput.oninput = () => {
                    preview.textContent = be.getBuildCodeDescription(codeInput.value);
                };
            }

            // Preview on code input (Edit forms)
            document.querySelectorAll('[id^="editBuildCode"]').forEach(input => {
                const idx = input.id.replace('editBuildCode', '');
                const previewEl = document.getElementById(`editBuildPreview${idx}`);
                if (previewEl) {
                    input.oninput = () => {
                        previewEl.textContent = be.getBuildCodeDescription(input.value);
                    };
                }
            });

            // Edit buttons - toggle edit row visibility
            document.querySelectorAll('[data-edit-build]').forEach(btn => {
                btn.onclick = () => {
                    const idx = btn.dataset.editBuild;
                    const row = document.getElementById(`editBuildRow${idx}`);
                    if (row) {
                        const isVisible = row.style.display !== 'none';
                        document.querySelectorAll('.econBuildEditRow').forEach(r => r.style.display = 'none');
                        row.style.display = isVisible ? 'none' : 'table-row';
                    }
                };
            });

            // Save buttons
            document.querySelectorAll('[data-save-build]').forEach(btn => {
                btn.onclick = () => {
                    const id = btn.dataset.saveBuild;
                    const name = document.getElementById(`editBuildName${id}`).value.trim();
                    const code = document.getElementById(`editBuildCode${id}`).value.trim();

                    if (!name || !code) {
                        alert('Please enter both name and code');
                        return;
                    }
                    if (!be.isValidBuildCode(code)) {
                        alert('Invalid build code format');
                        return;
                    }

                    ds.buildMethods[id] = { name, code };
                    ds.saveBuildMethods();
                    this.renderBuildMethodsView(container);
                };
            });

            // Cancel buttons
            document.querySelectorAll('[data-cancel-build]').forEach(btn => {
                btn.onclick = () => {
                    const idx = btn.dataset.cancelBuild;
                    document.getElementById(`editBuildRow${idx}`).style.display = 'none';
                };
            });

            // Add method button
            const addBtn = document.getElementById('addBuildMethod');
            if (addBtn) {
                addBtn.onclick = () => {
                    const name = document.getElementById('newBuildName').value.trim();
                    const code = document.getElementById('newBuildCode').value.trim();

                    if (!name || !code) {
                        alert('Please enter both name and code');
                        return;
                    }

                    if (!be.isValidBuildCode(code)) {
                        alert('Invalid build code format');
                        return;
                    }

                    ds.buildMethods[ds.generateBuildId()] = { name, code };
                    ds.saveBuildMethods();
                    this.renderBuildMethodsView(container);
                };
            }

            // Delete buttons
            document.querySelectorAll('[data-delete-build]').forEach(btn => {
                btn.onclick = () => {
                    const id = btn.dataset.deleteBuild;
                    const method = ds.buildMethods[id];
                    const planets = ds.getPlanetsUsingBuildMethod(id);
                    if (planets.length > 0) {
                        const list = planets.map(p => `  - ${p.id}: ${p.name}`).join('\n');
                        alert(`Cannot delete "${method.name}" — it is assigned to ${planets.length} planet(s):\n\n${list}\n\nPlease reassign these planets first.`);
                        return;
                    }
                    if (confirm(`Delete build method "${method.name}"?`)) {
                        delete ds.buildMethods[id];
                        ds.saveBuildMethods();
                        this.renderBuildMethodsView(container);
                    }
                };
            });

            // Reset to defaults
            document.getElementById('resetBuildDefaults').onclick = () => {
                const assignedCount = Object.values(ds.buildAssignments).filter(v => v !== 'm').length;
                const msg = 'This will:\n\n' +
                    '  - DELETE all your current build methods\n' +
                    '  - Replace them with the plugin defaults\n' +
                    `  - Set all ${assignedCount} planet(s) with build assignments back to Manual\n\n` +
                    'This cannot be undone. Continue?';
                if (!confirm(msg)) return;

                ds.buildMethods = structuredClone(DEFAULT_BUILD_METHODS);
                ds.nextBuildId = ds.calcNextId(ds.buildMethods);
                ds.buildInfoDismissed = false;
                ds.saveBuildMethods();
                for (const id of Object.keys(ds.buildAssignments)) {
                    ds.buildAssignments[id] = 'm';
                }
                ds.saveBuildAssignments();
                this.renderBuildMethodsView(container);
            };
        }

        /**
         * Render tax methods configuration view
         */
        renderTaxMethodsView(container) {
            const ds = this.controller.dataStore;


            const strategyLabel = (method) => {
                const labels = { Growth: 'Growth', Safe: 'Safe', NoTax: 'No Tax', Riot: 'Riot' };
                return labels[method] || method;
            };

            const happyRange = (strategy, min, max) => {
                if (strategy === 'NoTax' || strategy === 'Riot') return '';
                if (strategy === 'Safe') return `${min}`;
                return `${min}-${max}`;
            };

            const tierSummary = (m) => {
                const fmtTier = (method, min, max) => {
                    const hr = happyRange(method, min, max);
                    return `${strategyLabel(method)}${hr ? ' ' + hr : ''}`;
                };
                const midText = m.midsame ? '(same)' : fmtTier(m.midmethod, m.midMinHappy, m.midMaxHappy);
                const maxText = m.maxsame ? '(same)' : fmtTier(m.maxmethod, m.maxMinHappy, m.maxMaxHappy);
                return `>6.6M: ${midText} | Max: ${maxText}`;
            };

            const typeLabel = (taxType) =>
                taxType === 'CN' ? 'Colonists & Natives' : taxType === 'C' ? 'Colonists only' : 'Natives only';

            const strategyOptions = (id, selected, includeGrowth = true) => {
                const opts = [];
                if (includeGrowth) opts.push(['Growth', 'Growth']);
                opts.push(['Safe', 'Safe'], ['NoTax', 'No Tax'], ['Riot', 'Riot']);
                return opts.map(([val, label]) =>
                    `<option value="${val}"${selected === val ? ' selected' : ''}>${label}</option>`
                ).join('');
            };

            const editFormHtml = (id, m, prefix) => `
                <div class="econTaxEditForm" id="${prefix}EditForm${id}" style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 4px;">
                    <div style="margin-bottom: 8px;">
                        <label style="display: inline-block; width: 120px;">Name:</label>
                        <input type="text" class="econSelect" id="${prefix}Name${id}" style="width: 200px;" value="${m.name.replace(/"/g, '&quot;')}">
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="display: inline-block; width: 120px;">Applies to:</label>
                        <select class="econSelect" id="${prefix}Type${id}">
                            <option value="CN"${m.taxType === 'CN' ? ' selected' : ''}>Both Colonists & Natives</option>
                            <option value="C"${m.taxType === 'C' ? ' selected' : ''}>Colonists Only</option>
                            <option value="N"${m.taxType === 'N' ? ' selected' : ''}>Natives Only</option>
                        </select>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="display: inline-block; width: 120px;">Strategy:</label>
                        <select class="econSelect" id="${prefix}Strategy${id}">
                            ${strategyOptions(id, m.method)}
                        </select>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="display: inline-block; width: 120px;">Min Happiness:</label>
                        <input type="number" class="econSelect" id="${prefix}MinHappy${id}" style="width: 80px;" value="${m.minHappy}" min="0" max="100">
                        <span style="color: #888; margin-left: 10px;">(target when taxing)</span>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="display: inline-block; width: 120px;">Max Happiness:</label>
                        <input type="number" class="econSelect" id="${prefix}MaxHappy${id}" style="width: 80px;" value="${m.maxHappy}" min="0" max="100">
                        <span style="color: #888; margin-left: 10px;">(trigger to start taxing)</span>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="display: inline-block; width: 120px;">Min Clans:</label>
                        <input type="number" class="econSelect" id="${prefix}MinClans${id}" style="width: 80px;" value="${m.minClans || 0}" min="0">
                        <span style="color: #888; margin-left: 10px;">(don't tax below this)</span>
                    </div>
                    <fieldset style="border: 1px solid #555; padding: 10px; margin: 10px 0;">
                        <legend style="color: #FFF000;">Population Tiers</legend>
                        <p style="color: #888; font-size: 11px; margin: 0 0 10px 0;">At higher population levels, growth no longer matters. You can tax more aggressively since happiness only affects growth.</p>
                        <div style="margin-bottom: 14px;">
                            <div style="color: #CCC; font-weight: bold; font-size: 13px; margin-bottom: 6px;">At >6.6M colonists <span style="font-weight: normal; color: #888;">(half growth)</span></div>
                            <label>
                                <input type="checkbox" id="${prefix}MidSame${id}"${m.midsame ? ' checked' : ''}>
                                Keep using the same method
                            </label>
                            <div id="${prefix}MidFields${id}" style="margin: 8px 0 0 20px;${m.midsame ? ' display: none;' : ''}">
                                <div style="margin-bottom: 6px;">
                                    <label style="display: inline-block; width: 100px;">Strategy:</label>
                                    <select class="econSelect" id="${prefix}MidMethod${id}" style="width: 120px;">
                                        ${strategyOptions(id, m.midmethod || 'Growth')}
                                    </select>
                                </div>
                                <div style="margin-bottom: 6px;">
                                    <label style="display: inline-block; width: 100px;">Min Happy:</label>
                                    <input type="number" class="econSelect" id="${prefix}MidMinHappy${id}" style="width: 60px;" value="${m.midMinHappy ?? 70}" min="0" max="100">
                                </div>
                                <div style="margin-bottom: 6px;">
                                    <label style="display: inline-block; width: 100px;">Max Happy:</label>
                                    <input type="number" class="econSelect" id="${prefix}MidMaxHappy${id}" style="width: 60px;" value="${m.midMaxHappy ?? 100}" min="0" max="100">
                                </div>
                            </div>
                        </div>
                        <div style="margin-bottom: 10px;">
                            <div style="color: #CCC; font-weight: bold; font-size: 13px; margin-bottom: 6px;">At max population <span style="font-weight: normal; color: #888;">(no growth)</span></div>
                            <label>
                                <input type="checkbox" id="${prefix}MaxSame${id}"${m.maxsame ? ' checked' : ''}>
                                Keep using the same method
                            </label>
                            <div id="${prefix}MaxFields${id}" style="margin: 8px 0 0 20px;${m.maxsame ? ' display: none;' : ''}">
                                <div style="margin-bottom: 6px;">
                                    <label style="display: inline-block; width: 100px;">Strategy:</label>
                                    <select class="econSelect" id="${prefix}MaxMethod${id}" style="width: 120px;">
                                        ${strategyOptions(id, m.maxmethod || 'Safe', false)}
                                    </select>
                                </div>
                                <div style="margin-bottom: 6px;">
                                    <label style="display: inline-block; width: 100px;">Min Happy:</label>
                                    <input type="number" class="econSelect" id="${prefix}MaxMinHappy${id}" style="width: 60px;" value="${m.maxMinHappy ?? 40}" min="0" max="100">
                                </div>
                            </div>
                        </div>
                    </fieldset>
                    <button class="econButton" data-save-tax="${id}" style="margin-right: 8px;">Save</button>
                    <button class="econButton" data-cancel-tax="${id}" style="background: #555;">Cancel</button>
                </div>
            `;

            // --- Build method cards ---
            let html = `<h3 style="color: #FFF000;">Tax Methods</h3>
                <table class="econPlanetTable" style="margin-bottom: 20px;">
                <thead><tr>
                    <th>Name</th>
                    <th>Applies to</th>
                    <th>Strategy</th>
                    <th>Population Tiers</th>
                    <th></th>
                </tr></thead>
                <tbody>`;

            for (const [id, m] of Object.entries(ds.taxMethods)) {
                const hr = happyRange(m.method, m.minHappy, m.maxHappy);

                html += `
                <tr>
                    <td style="color: #FFF000; font-weight: bold;">${m.name}</td>
                    <td>${typeLabel(m.taxType)}</td>
                    <td>${strategyLabel(m.method)}${hr ? ' ' + hr : ''}</td>
                    <td>${tierSummary(m)}${m.minClans > 0 ? ` · Min: ${m.minClans} clans` : ''}</td>
                    <td style="white-space: nowrap;">
                        <button class="econButton" data-edit-tax="${id}" style="padding: 3px 10px;">Edit</button>
                        <button class="econButton" data-delete-tax="${id}" style="background: #AA0000; padding: 3px 10px; margin-left: 4px;">Delete</button>
                    </td>
                </tr>
                <tr class="econTaxEditRow" id="editTaxRow${id}" style="display: none;"><td colspan="5" style="padding: 0;">${editFormHtml(id, m, 'editTax')}</td></tr>
                `;
            }

            html += `</tbody></table>`;

            // --- Add New section ---
            html += `
                <h4 style="color: #FFF000; margin-top: 20px;">Add New Tax Method</h4>
                <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 5px;">
                    <div style="margin-bottom: 10px;">
                        <label style="display: inline-block; width: 120px;">Name:</label>
                        <input type="text" id="newTaxName" class="econSelect" style="width: 200px;" placeholder="My Tax Method">
                    </div>

                    <div style="margin-bottom: 10px;">
                        <label style="display: inline-block; width: 120px;">Applies to:</label>
                        <select id="newTaxType" class="econSelect">
                            <option value="CN">Both Colonists & Natives</option>
                            <option value="C">Colonists Only</option>
                            <option value="N">Natives Only</option>
                        </select>
                    </div>

                    <div style="margin-bottom: 10px;">
                        <label style="display: inline-block; width: 120px;">Strategy:</label>
                        <select id="newTaxStrategy" class="econSelect">
                            <option value="Growth">Growth (tax to min, recover to max)</option>
                            <option value="Safe">Safe (maintain at min happiness)</option>
                            <option value="NoTax">No Tax (0% for max growth)</option>
                            <option value="Riot">Riot (100% tax)</option>
                        </select>
                    </div>

                    <div style="margin-bottom: 10px;">
                        <label style="display: inline-block; width: 120px;">Min Happiness:</label>
                        <input type="number" id="newTaxMinHappy" class="econSelect" style="width: 80px;" value="70" min="0" max="100">
                        <span style="color: #888; margin-left: 10px;">(target when taxing)</span>
                    </div>

                    <div style="margin-bottom: 10px;">
                        <label style="display: inline-block; width: 120px;">Max Happiness:</label>
                        <input type="number" id="newTaxMaxHappy" class="econSelect" style="width: 80px;" value="100" min="0" max="100">
                        <span style="color: #888; margin-left: 10px;">(trigger to start taxing)</span>
                    </div>

                    <div style="margin-bottom: 10px;">
                        <label style="display: inline-block; width: 120px;">Min Clans:</label>
                        <input type="number" id="newTaxMinClans" class="econSelect" style="width: 80px;" value="0" min="0">
                        <span style="color: #888; margin-left: 10px;">(don't tax below this)</span>
                    </div>

                    <fieldset style="border: 1px solid #555; padding: 10px; margin: 15px 0;">
                        <legend style="color: #FFF000;">Population Tiers</legend>
                        <p style="color: #888; font-size: 11px; margin: 0 0 10px 0;">At higher population levels, growth no longer matters. You can tax more aggressively since happiness only affects growth.</p>
                        <div style="margin-bottom: 14px;">
                            <div style="color: #CCC; font-weight: bold; font-size: 13px; margin-bottom: 6px;">At >6.6M colonists <span style="font-weight: normal; color: #888;">(half growth)</span></div>
                            <label>
                                <input type="checkbox" id="newTaxMidSame">
                                Keep using the same method
                            </label>
                            <div id="newTaxMidFields" style="margin: 8px 0 0 20px;">
                                <div style="margin-bottom: 6px;">
                                    <label style="display: inline-block; width: 100px;">Strategy:</label>
                                    <select id="newTaxMidMethod" class="econSelect" style="width: 120px;">
                                        <option value="Growth" selected>Growth</option>
                                        <option value="Safe">Safe</option>
                                        <option value="Riot">Riot</option>
                                        <option value="NoTax">No Tax</option>
                                    </select>
                                </div>
                                <div style="margin-bottom: 6px;">
                                    <label style="display: inline-block; width: 100px;">Min Happy:</label>
                                    <input type="number" id="newTaxMidMinHappy" class="econSelect" style="width: 60px;" value="70" min="0" max="100">
                                </div>
                                <div style="margin-bottom: 6px;">
                                    <label style="display: inline-block; width: 100px;">Max Happy:</label>
                                    <input type="number" id="newTaxMidMaxHappy" class="econSelect" style="width: 60px;" value="100" min="0" max="100">
                                </div>
                            </div>
                        </div>
                        <div style="margin-bottom: 10px;">
                            <div style="color: #CCC; font-weight: bold; font-size: 13px; margin-bottom: 6px;">At max population <span style="font-weight: normal; color: #888;">(no growth)</span></div>
                            <label>
                                <input type="checkbox" id="newTaxMaxSame">
                                Keep using the same method
                            </label>
                            <div id="newTaxMaxFields" style="margin: 8px 0 0 20px;">
                                <div style="margin-bottom: 6px;">
                                    <label style="display: inline-block; width: 100px;">Strategy:</label>
                                    <select id="newTaxMaxMethod" class="econSelect" style="width: 120px;">
                                        <option value="Safe" selected>Safe</option>
                                        <option value="Riot">Riot</option>
                                        <option value="NoTax">No Tax</option>
                                    </select>
                                </div>
                                <div style="margin-bottom: 6px;">
                                    <label style="display: inline-block; width: 100px;">Min Happy:</label>
                                    <input type="number" id="newTaxMaxMinHappy" class="econSelect" style="width: 60px;" value="40" min="0" max="100">
                                </div>
                            </div>
                        </div>
                    </fieldset>

                    <button class="econButton" id="addTaxMethod">Add Tax Method</button>
                </div>

                <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #444;">
                    <button class="econButton" id="resetTaxDefaults" style="background: #AA0000;">Reset Tax Methods to Defaults</button>
                    <span style="color: #888; font-size: 12px; margin-left: 10px;">
                        Deletes all tax methods, replaces them with the plugin defaults, and sets all planets to Manual.
                        This is also the only way to obtain new default methods added in a plugin update.
                    </span>
                </div>
            `;

            container.innerHTML = html;

            // Helper: disable happiness fields based on strategy
            // NoTax/Riot: both disabled. Safe: max disabled. Growth: both enabled.
            const bindStrategyToHappy = (strategyId, minHappyId, maxHappyId) => {
                const sel = document.getElementById(strategyId);
                if (!sel) return;
                const minInp = document.getElementById(minHappyId);
                const maxInp = maxHappyId ? document.getElementById(maxHappyId) : null;
                const setDisabled = (inp, disabled) => {
                    if (!inp) return;
                    inp.disabled = disabled;
                    inp.style.opacity = disabled ? '0.4' : '1';
                };
                const sync = () => {
                    const v = sel.value;
                    const noHappy = v === 'NoTax' || v === 'Riot';
                    setDisabled(minInp, noHappy);
                    setDisabled(maxInp, noHappy || v === 'Safe');
                };
                sel.onchange = sync;
                sync();
            };

            // --- Event handlers for method cards ---

            // Edit buttons - toggle edit row visibility
            document.querySelectorAll('[data-edit-tax]').forEach(btn => {
                btn.onclick = () => {
                    const idx = btn.dataset.editTax;
                    const row = document.getElementById(`editTaxRow${idx}`);
                    if (row) {
                        const isVisible = row.style.display !== 'none';
                        // Collapse all other edit rows first
                        document.querySelectorAll('.econTaxEditRow').forEach(r => r.style.display = 'none');
                        row.style.display = isVisible ? 'none' : 'table-row';
                    }
                };
            });

            // Save buttons
            document.querySelectorAll('[data-save-tax]').forEach(btn => {
                btn.onclick = () => {
                    const id = btn.dataset.saveTax;
                    const p = 'editTax';
                    const name = document.getElementById(`${p}Name${id}`).value.trim();
                    const minHappy = parseInt(document.getElementById(`${p}MinHappy${id}`).value, 10);
                    const maxHappy = parseInt(document.getElementById(`${p}MaxHappy${id}`).value, 10);

                    if (!name) { alert('Please enter a name'); return; }
                    if (minHappy > maxHappy) { alert('Min happiness cannot be greater than max happiness'); return; }

                    const midsame = document.getElementById(`${p}MidSame${id}`).checked;
                    const maxsame = document.getElementById(`${p}MaxSame${id}`).checked;

                    const updated = {
                        name,
                        method: document.getElementById(`${p}Strategy${id}`).value,
                        taxType: document.getElementById(`${p}Type${id}`).value,
                        minHappy,
                        maxHappy,
                        minClans: parseInt(document.getElementById(`${p}MinClans${id}`).value, 10) || 0,
                        midsame,
                        maxsame
                    };

                    if (!midsame) {
                        updated.midmethod = document.getElementById(`${p}MidMethod${id}`).value;
                        updated.midMinHappy = parseInt(document.getElementById(`${p}MidMinHappy${id}`).value, 10);
                        updated.midMaxHappy = parseInt(document.getElementById(`${p}MidMaxHappy${id}`).value, 10);
                    }
                    if (!maxsame) {
                        updated.maxmethod = document.getElementById(`${p}MaxMethod${id}`).value;
                        updated.maxMinHappy = parseInt(document.getElementById(`${p}MaxMinHappy${id}`).value, 10);
                    }

                    ds.taxMethods[id] = updated;
                    ds.saveTaxMethods();
                    this.renderTaxMethodsView(container);
                };
            });

            // Cancel buttons
            document.querySelectorAll('[data-cancel-tax]').forEach(btn => {
                btn.onclick = () => {
                    const idx = btn.dataset.cancelTax;
                    document.getElementById(`editTaxRow${idx}`).style.display = 'none';
                };
            });

            // Delete buttons
            document.querySelectorAll('[data-delete-tax]').forEach(btn => {
                btn.onclick = () => {
                    const id = btn.dataset.deleteTax;
                    const method = ds.taxMethods[id];
                    const planets = ds.getPlanetsUsingTaxMethod(id);
                    if (planets.length > 0) {
                        const list = planets.map(p => `  - ${p.id}: ${p.name}`).join('\n');
                        alert(`Cannot delete "${method.name}" — it is assigned to ${planets.length} planet(s):\n\n${list}\n\nPlease reassign these planets first.`);
                        return;
                    }
                    if (confirm(`Delete tax method "${method.name}"?`)) {
                        delete ds.taxMethods[id];
                        ds.saveTaxMethods();
                        this.renderTaxMethodsView(container);
                    }
                };
            });

            // Toggle tier fields in edit forms
            document.querySelectorAll('[id^="editTaxMidSame"]').forEach(cb => {
                const idx = cb.id.replace('editTaxMidSame', '');
                cb.onchange = () => {
                    document.getElementById(`editTaxMidFields${idx}`).style.display = cb.checked ? 'none' : 'block';
                };
            });
            document.querySelectorAll('[id^="editTaxMaxSame"]').forEach(cb => {
                const idx = cb.id.replace('editTaxMaxSame', '');
                cb.onchange = () => {
                    document.getElementById(`editTaxMaxFields${idx}`).style.display = cb.checked ? 'none' : 'block';
                };
            });

            // Bind strategy selects to happiness fields in edit forms
            document.querySelectorAll('[id^="editTaxStrategy"]').forEach(sel => {
                const idx = sel.id.replace('editTaxStrategy', '');
                bindStrategyToHappy(`editTaxStrategy${idx}`, `editTaxMinHappy${idx}`, `editTaxMaxHappy${idx}`);
                bindStrategyToHappy(`editTaxMidMethod${idx}`, `editTaxMidMinHappy${idx}`, `editTaxMidMaxHappy${idx}`);
                bindStrategyToHappy(`editTaxMaxMethod${idx}`, `editTaxMaxMinHappy${idx}`, null);
            });

            // --- Event handlers for Add New form ---
            const midSameCheckbox = document.getElementById('newTaxMidSame');
            const maxSameCheckbox = document.getElementById('newTaxMaxSame');
            if (midSameCheckbox) {
                midSameCheckbox.onchange = () => {
                    document.getElementById('newTaxMidFields').style.display = midSameCheckbox.checked ? 'none' : 'block';
                };
            }
            if (maxSameCheckbox) {
                maxSameCheckbox.onchange = () => {
                    document.getElementById('newTaxMaxFields').style.display = maxSameCheckbox.checked ? 'none' : 'block';
                };
            }

            // Bind strategy selects to happiness fields in Add New form
            bindStrategyToHappy('newTaxStrategy', 'newTaxMinHappy', 'newTaxMaxHappy');
            bindStrategyToHappy('newTaxMidMethod', 'newTaxMidMinHappy', 'newTaxMidMaxHappy');
            bindStrategyToHappy('newTaxMaxMethod', 'newTaxMaxMinHappy', null);

            const addBtn = document.getElementById('addTaxMethod');
            if (addBtn) {
                addBtn.onclick = () => {
                    const name = document.getElementById('newTaxName').value.trim();
                    const taxType = document.getElementById('newTaxType').value;
                    const method = document.getElementById('newTaxStrategy').value;
                    const minHappy = parseInt(document.getElementById('newTaxMinHappy').value, 10);
                    const maxHappy = parseInt(document.getElementById('newTaxMaxHappy').value, 10);
                    const minClans = parseInt(document.getElementById('newTaxMinClans').value, 10);
                    const midsame = document.getElementById('newTaxMidSame').checked;
                    const maxsame = document.getElementById('newTaxMaxSame').checked;

                    if (!name) {
                        alert('Please enter a name for the tax method');
                        return;
                    }

                    if (minHappy > maxHappy) {
                        alert('Min happiness cannot be greater than max happiness');
                        return;
                    }

                    const newMethod = {
                        name,
                        method,
                        taxType,
                        minHappy,
                        maxHappy,
                        minClans,
                        midsame,
                        maxsame
                    };

                    if (!midsame) {
                        newMethod.midmethod = document.getElementById('newTaxMidMethod').value;
                        newMethod.midMinHappy = parseInt(document.getElementById('newTaxMidMinHappy').value, 10);
                        newMethod.midMaxHappy = parseInt(document.getElementById('newTaxMidMaxHappy').value, 10);
                    }
                    if (!maxsame) {
                        newMethod.maxmethod = document.getElementById('newTaxMaxMethod').value;
                        newMethod.maxMinHappy = parseInt(document.getElementById('newTaxMaxMinHappy').value, 10);
                    }

                    ds.taxMethods[ds.generateTaxId()] = newMethod;
                    ds.saveTaxMethods();
                    this.renderTaxMethodsView(container);
                };
            }

            // Reset to defaults
            document.getElementById('resetTaxDefaults').onclick = () => {
                const colCount = Object.values(ds.colonistTaxAssignments).filter(v => v !== 'm').length;
                const natCount = Object.values(ds.nativeTaxAssignments).filter(v => v !== 'm').length;
                const msg = 'This will:\n\n' +
                    '  - DELETE all your current tax methods\n' +
                    '  - Replace them with the plugin defaults\n' +
                    `  - Set all colonist tax assignments (${colCount} planet(s)) back to Manual\n` +
                    `  - Set all native tax assignments (${natCount} planet(s)) back to Manual\n\n` +
                    'This cannot be undone. Continue?';
                if (!confirm(msg)) return;

                ds.taxMethods = structuredClone(DEFAULT_TAX_METHODS);
                ds.nextTaxId = ds.calcNextId(ds.taxMethods);
                ds.saveTaxMethods();
                for (const id of Object.keys(ds.colonistTaxAssignments)) {
                    ds.colonistTaxAssignments[id] = 'm';
                }
                ds.saveColonistTaxAssignments();
                for (const id of Object.keys(ds.nativeTaxAssignments)) {
                    ds.nativeTaxAssignments[id] = 'm';
                }
                ds.saveNativeTaxAssignments();
                this.renderTaxMethodsView(container);
            };
        }

        /**
         * Render help view
         */
        renderHelpView(container) {
            container.innerHTML = `
                <h3 style="color: #FFF000;">Economy Management Help</h3>

                <h4>Build Code Syntax</h4>
                <p>Build codes define how structures are built on planets:</p>
                <ul>
                    <li><code>y</code> or <code>n</code> - Burn supplies (yes/no)</li>
                    <li><code>f-N</code> - Build up to N factories</li>
                    <li><code>m-N</code> - Build up to N mines</li>
                    <li><code>d-N</code> - Build up to N defense posts</li>
                    <li><code>d-S</code> - Build defense to the safe level (configurable in Build Methods tab)</li>
                    <li><code>rfm-F-M-R</code> - Ratio build: up to F factories and M mines at R:1 ratio</li>
                </ul>
                <p>Example: <code>y-f-15-m-20-d-S</code> = Burn supplies, build 15 factories, then 20 mines, then defense to safe level</p>

                <h4>Tax Strategies</h4>
                <ul>
                    <li><strong>Growth</strong>: Tax down to min happiness, then recover to max</li>
                    <li><strong>Safe</strong>: Maintain happiness at min level</li>
                    <li><strong>Riot</strong>: 100% tax (causes riots)</li>
                    <li><strong>No Tax</strong>: 0% tax for maximum growth</li>
                </ul>

                <h4>Vanilla Feature Detection</h4>
                <p>If a planet has built-in auto-build or native auto-tax enabled, this plugin will show a warning and disable its controls for that planet. Disable built-in features to use Economy Management.</p>
            `;
        }
    }

    // =========================================================================
    // PLANET VIEW INTEGRATION - Side Panel Approach
    // =========================================================================

    class PlanetViewIntegration {
        constructor(controller) {
            this.controller = controller;
            this.panelVisible = false;
            this.currentPlanet = null;
            this.addStyles();
        }

        /**
         * Add CSS styles for the side panel
         */
        addStyles() {
            if (document.getElementById('econPVStyles')) return;

            const css = `
                #econPVToggleBtn {
                    position: fixed;
                    top: 5px;
                    left: 265px;
                    background: #FFF000;
                    color: #000;
                    border: 2px solid #AA8800;
                    padding: 4px 8px;
                    font-size: 11px;
                    font-weight: bold;
                    cursor: pointer;
                    z-index: 9998;
                    border-radius: 4px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                }
                #econPVToggleBtn:hover {
                    background: #FFD700;
                }
                #econPVToggleBtn.active {
                    background: #00AA00;
                    color: #FFF;
                    border-color: #006600;
                }
                #econPVToggleBtn.hasMethods {
                    background: #00AA00;
                    color: #FFF;
                    border-color: #006600;
                }
                #econPVToggleBtn.hasMethods:hover {
                    background: #00CC00;
                }
                #econSidePanel {
                    position: fixed;
                    top: 10px;
                    left: 420px;
                    width: 280px;
                    max-height: calc(100vh - 30px);
                    overflow-y: auto;
                    background: rgba(20, 20, 20, 0.95);
                    border: 2px solid #FFF000;
                    border-radius: 8px;
                    padding: 15px;
                    z-index: 9999;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                    display: none;
                }
                #econSidePanel.visible {
                    display: block;
                }
                #econSidePanel .econPanelHeader {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid #444;
                }
                #econSidePanel .econPanelTitle {
                    color: #FFF000;
                    font-weight: bold;
                    font-size: 14px;
                }
                #econSidePanel .econCloseBtn {
                    background: #AA0000;
                    color: #FFF;
                    border: none;
                    padding: 2px 8px;
                    cursor: pointer;
                    font-size: 12px;
                    border-radius: 3px;
                }
                #econSidePanel .econCloseBtn:hover {
                    background: #CC0000;
                }
                #econSidePanel .econPlanetName {
                    color: #00FFFF;
                    font-size: 13px;
                    margin-bottom: 10px;
                }
                #econSidePanel .econSection {
                    margin-bottom: 12px;
                }
                #econSidePanel .econSectionTitle {
                    color: #AAA;
                    font-size: 11px;
                    margin-bottom: 4px;
                    text-transform: uppercase;
                }
                #econSidePanel select {
                    width: 100%;
                    background: #333;
                    color: #FFF;
                    border: 1px solid #666;
                    padding: 5px;
                    font-size: 12px;
                    border-radius: 3px;
                }
                #econSidePanel .econPreview {
                    background: rgba(0, 100, 0, 0.3);
                    border: 1px solid #00AA00;
                    border-radius: 4px;
                    padding: 8px;
                    margin-top: 10px;
                    font-size: 11px;
                    color: #88FF88;
                }
                #econSidePanel .econWarning {
                    background: rgba(100, 50, 0, 0.3);
                    border: 1px solid #FFAA00;
                    border-radius: 4px;
                    padding: 8px;
                    margin-bottom: 10px;
                    font-size: 11px;
                    color: #FFAA00;
                }
                #econSidePanel .econApplyBtn {
                    width: 100%;
                    background: #FFF000;
                    color: #000;
                    border: none;
                    padding: 10px;
                    font-weight: bold;
                    cursor: pointer;
                    border-radius: 4px;
                    margin-top: 10px;
                }
                #econSidePanel .econApplyBtn:hover {
                    background: #FFD700;
                }
                #econSidePanel .econStructures {
                    display: flex;
                    justify-content: space-between;
                    font-size: 11px;
                    color: #AAA;
                    margin-bottom: 10px;
                }
                #econSidePanel .econDisabled {
                    color: #666;
                    font-style: italic;
                    font-size: 12px;
                }
            `;

            const style = document.createElement('style');
            style.id = 'econPVStyles';
            style.textContent = css;
            document.head.appendChild(style);
        }

        /**
         * Inject toggle button into planet detail screen
         */
        injectControls(planet) {
            // Clear any pending timeout
            if (this.showButtonTimeout) {
                clearTimeout(this.showButtonTimeout);
                this.showButtonTimeout = null;
            }

            // Remove existing toggle button first
            const existingBtn = document.getElementById('econPVToggleBtn');
            if (existingBtn) existingBtn.remove();

            // Only show for planets owned by the player
            if (!planet || planet.ownerid !== vgap.player.id) {
                // Hide panel if viewing unowned planet
                if (this.panelVisible) {
                    this.hidePanel();
                    this.panelVisible = false;
                }
                return;
            }

            this.currentPlanet = planet;

            // Delay showing the button to wait for planet panel animation
            this.showButtonTimeout = setTimeout(() => {
                this.createToggleButton(planet);
            }, 400);

            // Update side panel content immediately if visible
            if (this.panelVisible) {
                this.updatePanelContent(planet);
            }
        }

        /**
         * Create and show the toggle button
         */
        createToggleButton(planet) {
            // Check if button already exists (shouldn't, but just in case)
            const existingBtn = document.getElementById('econPVToggleBtn');
            if (existingBtn) existingBtn.remove();

            const ds = this.controller.dataStore;

            // Check if any method is assigned to this planet
            const hasBuildMethod = ds.buildAssignments[planet.id] !== 'm' && ds.buildAssignments[planet.id] !== undefined;
            const hasColTaxMethod = ds.colonistTaxAssignments[planet.id] !== 'm' && ds.colonistTaxAssignments[planet.id] !== undefined;
            const hasNatTaxMethod = ds.nativeTaxAssignments[planet.id] !== 'm' && ds.nativeTaxAssignments[planet.id] !== undefined;
            const hasMethods = hasBuildMethod || hasColTaxMethod || hasNatTaxMethod;

            // Create toggle button
            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'econPVToggleBtn';
            toggleBtn.textContent = 'EM';
            toggleBtn.title = 'Toggle Economy Management Panel';

            if (hasMethods) {
                toggleBtn.classList.add('hasMethods');
            }

            // Update button state if panel is visible
            if (this.panelVisible) {
                toggleBtn.classList.add('active');
            }

            toggleBtn.onclick = (e) => {
                e.stopPropagation();  // Prevent click from closing planet view
                e.preventDefault();
                this.togglePanel();
            };

            // Try to inject the button into the planet panel's title/header area
            // so it disappears when the panel is closed
            let injected = false;

            if (typeof $ !== 'undefined') {
                // Look for the planet screen's title bar
                // Structure found: #LeftContent.PlanetScreen .BoxTopTitle .TopTitleBlock
                const possibleContainers = [
                    '#LeftContent.PlanetScreen .TopTitleBlock',  // Planet screen title block
                    '.PlanetScreen .TopTitleBlock',              // Alternative
                    '.TopTitleBlock',                            // Generic title block
                    '.BoxTopTitle'                               // Box top title
                ];

                for (const selector of possibleContainers) {
                    const container = $(selector).first();
                    if (container.length > 0) {
                        // Style button to fit in the title bar - override the fixed-position CSS
                        toggleBtn.style.cssText = `
                            position: absolute;
                            right: 93px;
                            left: auto;
                            top: 50%;
                            transform: translateY(-50%);
                            padding: 4px 12px;
                            font-size: 14px;
                            line-height: 1;
                            z-index: 100;
                        `;
                        // Make sure the container can hold absolutely positioned children
                        container.css('position', 'relative');
                        container.append(toggleBtn);
                        injected = true;
                        break;
                    }
                }
            }

            // Fallback: append to body with fixed position (original behavior)
            if (!injected) {
                document.body.appendChild(toggleBtn);
            }
        }

        /**
         * Toggle the side panel visibility
         */
        togglePanel() {
            this.panelVisible = !this.panelVisible;

            const toggleBtn = document.getElementById('econPVToggleBtn');
            if (toggleBtn) {
                toggleBtn.classList.toggle('active', this.panelVisible);
            }

            if (this.panelVisible) {
                this.showPanel();
            } else {
                this.hidePanel();
            }
        }

        /**
         * Show the side panel
         */
        showPanel() {
            let panel = document.getElementById('econSidePanel');

            if (!panel) {
                panel = document.createElement('div');
                panel.id = 'econSidePanel';
                document.body.appendChild(panel);
            }

            panel.classList.add('visible');
            this.updatePanelContent(this.currentPlanet);

            // Mark toggle button as active
            const toggleBtn = document.getElementById('econPVToggleBtn');
            if (toggleBtn) {
                toggleBtn.classList.add('active');
            }
        }

        /**
         * Hide the side panel
         */
        hidePanel() {
            const panel = document.getElementById('econSidePanel');
            if (panel) {
                panel.classList.remove('visible');
            }

            // Remove active state from toggle button
            const toggleBtn = document.getElementById('econPVToggleBtn');
            if (toggleBtn) {
                toggleBtn.classList.remove('active');
            }
        }

        /**
         * Update the panel content for the current planet
         */
        updatePanelContent(planet) {
            if (!planet) return;

            const panel = document.getElementById('econSidePanel');
            if (!panel) return;

            const ds = this.controller.dataStore;
            const vd = this.controller.vanillaDetector;
            const be = this.controller.buildEngine;

            const buildDisabled = !vd.canApplyBuildMethod(planet);
            const natTaxDisabled = !vd.canApplyNativeTax(planet);
            const hasNatives = planet.nativeclans > 0;

            const buildAssign = ds.buildAssignments[planet.id] ?? 'm';
            const isCustomBuild = typeof buildAssign === 'object' && buildAssign.code;
            const buildVal = isCustomBuild ? 'custom' : buildAssign;
            const colTaxVal = ds.colonistTaxAssignments[planet.id] ?? 'm';
            const natTaxVal = ds.nativeTaxAssignments[planet.id] ?? 'm';

            // Build options
            let buildOptions = '<option value="m">Manual</option>';
            for (const [id, m] of Object.entries(ds.buildMethods)) {
                const selected = buildVal === id ? ' selected' : '';
                buildOptions += `<option value="${id}"${selected}>${m.name}</option>`;
            }
            buildOptions += `<option value="custom"${isCustomBuild ? ' selected' : ''}>Custom...</option>`;

            // Tax options
            let colTaxOptions = '<option value="m">Manual</option>';
            let natTaxOptions = '<option value="m">Manual</option>';
            for (const [id, m] of Object.entries(ds.taxMethods)) {
                if (m.taxType === 'C' || m.taxType === 'CN') {
                    const selected = colTaxVal === id ? ' selected' : '';
                    colTaxOptions += `<option value="${id}"${selected}>${m.name}</option>`;
                }
                if (m.taxType === 'N' || m.taxType === 'CN') {
                    const selected = natTaxVal === id ? ' selected' : '';
                    natTaxOptions += `<option value="${id}"${selected}>${m.name}</option>`;
                }
            }

            // Get warnings
            const warnings = vd.getWarnings(planet);
            let warningHtml = '';
            if (warnings.length > 0) {
                warningHtml = `<div class="econWarning">
                    ${warnings.map(w => w.message).join('<br>')}
                </div>`;
            }

            // Build preview
            let previewHtml = '';
            const buildMethod = ds.getBuildMethod(planet.id);
            if (buildMethod && !buildDisabled) {
                const preview = be.execute(planet, buildMethod, true);
                if (preview.factoriesBuilt > 0 || preview.minesBuilt > 0 || preview.defenseBuilt > 0) {
                    previewHtml = `<div class="econPreview">
                        <strong>Build Preview:</strong><br>
                        +${preview.minesBuilt} Mines, +${preview.factoriesBuilt} Factories, +${preview.defenseBuilt} Defense<br>
                        Cost: ${preview.suppliesUsed} supplies, ${preview.mcUsed} MC
                    </div>`;
                }
            }

            // Current structures info
            const maxStructures = be.getMaxStructures(planet);

            // Tier indicators for tax sections
            const te = this.controller.taxEngine;
            let colTierHtml = '';
            let natTierHtml = '';

            const formatTierMethod = (preview) => {
                const name = preview.method;
                if (name === 'Safe' || name === 'Growth') return `${name} ${preview.minHappy}`;
                return name === 'NoTax' ? 'No Tax' : name;
            };

            const buildTierHtml = (planet, method, isNative) => {
                const tier = te.getPopulationTier(planet, isNative);
                if (tier === 'normal') return '';

                const clans = isNative ? planet.nativeclans : planet.clans;
                const maxClans = te.getMaxPopulation(planet, isNative);
                let tierLabel, color;

                if (tier === 'max') {
                    if (clans > maxClans) {
                        tierLabel = 'Overpopulated';
                        color = '#FF4444';
                    } else {
                        tierLabel = 'At max population';
                        color = '#FFF000';
                    }
                } else {
                    tierLabel = 'High population (half growth)';
                    color = '#FFF000';
                }

                // Show "— using METHOD" only if a method is assigned and has a tier-specific override
                // (explicit via midsame/maxsame, or implicit Growth→Safe fallback)
                let suffix = '';
                if (method) {
                    const preview = te.execute(planet, method, isNative ? 'native' : 'colonist', true);
                    const hasTierOverride = (tier === 'mid' && !method.midsame)
                        || (tier === 'max' && !method.maxsame)
                        || (method.method === 'Growth' && preview.method === 'Safe');
                    if (hasTierOverride) {
                        suffix = ` — using ${formatTierMethod(preview)}`;
                    }
                }

                return `<div style="color: ${color}; font-size: 11px; margin-top: 4px;">${tierLabel}${suffix}</div>`;
            };

            const colTaxMethod = ds.getColonistTaxMethod(planet.id);
            colTierHtml = buildTierHtml(planet, colTaxMethod, false);

            if (hasNatives && !natTaxDisabled) {
                const natTaxMethod = ds.getNativeTaxMethod(planet.id);
                natTierHtml = buildTierHtml(planet, natTaxMethod, true);
            }

            panel.innerHTML = `
                <div class="econPanelHeader">
                    <span class="econPanelTitle">Economy Management</span>
                    <button class="econCloseBtn" id="econPanelClose">X</button>
                </div>

                <div class="econPlanetName">${planet.id}: ${planet.name}</div>
                ${planetTagsHtml(planet)}

                <div class="econStructures">
                    <span>M: ${planet.mines}/${maxStructures.mines}</span>
                    <span>F: ${planet.factories}/${maxStructures.factories}</span>
                    <span>D: ${planet.defense}/${maxStructures.defense}</span>
                </div>

                ${warningHtml}

                <div class="econSection">
                    <div class="econSectionTitle">Build Method</div>
                    ${buildDisabled
                        ? '<div class="econDisabled">Using built-in auto-build</div>'
                        : `<select id="econPVBuild">${buildOptions}</select>
                           ${isCustomBuild ? `<input type="text" id="econPVBuildCode" class="econSelect" value="${buildAssign.code}" style="width: 100%; margin-top: 4px; font-size: 11px;">` : ''}`
                    }
                </div>

                <div class="econSection">
                    <div class="econSectionTitle">Colonist Tax</div>
                    <select id="econPVColTax">${colTaxOptions}</select>
                    ${colTierHtml}
                </div>

                <div class="econSection">
                    <div class="econSectionTitle">Native Tax</div>
                    ${!hasNatives
                        ? '<div class="econDisabled">No natives on this planet</div>'
                        : natTaxDisabled
                            ? '<div class="econDisabled">Using built-in native auto-tax</div>'
                            : `<select id="econPVNatTax">${natTaxOptions}</select>${natTierHtml}`
                    }
                </div>

                ${previewHtml}

                <button class="econApplyBtn" id="econPVApply">Apply Now</button>
            `;

            this.attachHandlers(planet);
        }

        /**
         * Attach event handlers to panel controls
         */
        attachHandlers(planet) {
            const ds = this.controller.dataStore;

            // Close button
            const closeBtn = document.getElementById('econPanelClose');
            if (closeBtn) {
                closeBtn.onclick = () => this.togglePanel();
            }

            // Build method selector
            const buildSelect = document.getElementById('econPVBuild');
            if (buildSelect) {
                buildSelect.onchange = () => {
                    if (buildSelect.value === 'custom') {
                        const prevAssign = ds.buildAssignments[planet.id];
                        let code = '';
                        if (typeof prevAssign === 'object' && prevAssign.code) {
                            code = prevAssign.code;
                        } else if (typeof prevAssign === 'string' && ds.buildMethods[prevAssign]) {
                            code = ds.buildMethods[prevAssign].code;
                        }
                        ds.setBuildAssignment(planet.id, { code });
                    } else {
                        ds.setBuildAssignment(planet.id, buildSelect.value);
                    }
                    this.updatePanelContent(planet);
                };
            }
            const buildCodeInput = document.getElementById('econPVBuildCode');
            if (buildCodeInput) {
                buildCodeInput.onchange = () => {
                    ds.setBuildAssignment(planet.id, { code: buildCodeInput.value.trim() });
                    this.updatePanelContent(planet);
                };
            }

            // Colonist tax selector
            const colTaxSelect = document.getElementById('econPVColTax');
            if (colTaxSelect) {
                colTaxSelect.onchange = () => {
                    ds.setColonistTaxAssignment(planet.id, colTaxSelect.value);
                };
            }

            // Native tax selector
            const natTaxSelect = document.getElementById('econPVNatTax');
            if (natTaxSelect) {
                natTaxSelect.onchange = () => {
                    ds.setNativeTaxAssignment(planet.id, natTaxSelect.value);
                };
            }

            // Apply button
            const applyBtn = document.getElementById('econPVApply');
            if (applyBtn) {
                applyBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.controller.applyMethodsToPlanets([planet], { silent: true });
                    this.updatePanelContent(planet);

                    // Refresh the game's planet screen to show updated values
                    if (vgap.planetScreen && vgap.planetScreen.screen &&
                        typeof vgap.planetScreen.screen.refresh === 'function') {
                        vgap.planetScreen.screen.refresh();
                    } else if (vgap.planetScreen && typeof vgap.planetScreen.load === 'function') {
                        vgap.planetScreen.load(planet);
                    }
                };
            }
        }

        /**
         * Clean up when leaving planet view
         */
        cleanup() {
            // Clear any pending timeout
            if (this.showButtonTimeout) {
                clearTimeout(this.showButtonTimeout);
                this.showButtonTimeout = null;
            }

            // Remove button
            const toggleBtn = document.getElementById('econPVToggleBtn');
            if (toggleBtn) toggleBtn.remove();

            // Remove panel entirely when leaving planet view
            const panel = document.getElementById('econSidePanel');
            if (panel) panel.remove();

            this.panelVisible = false;
            this.currentPlanet = null;
        }
    }

    // =========================================================================
    // MAIN CONTROLLER
    // =========================================================================

    class EconomyManagement {
        constructor() {
            this.dataStore = new DataStore();
            this.vanillaDetector = new VanillaDetector();
            this.buildEngine = new BuildEngine(this.dataStore);
            this.taxEngine = new TaxEngine(this.dataStore);
            this.dashboardUI = new DashboardUI(this);
            this.planetViewInteg = new PlanetViewIntegration(this);
        }

        /**
         * Initialize the plugin
         */
        init() {
            console.log(`[Economy Management] Initializing v${PLUGIN_VERSION}...`);
            this.dataStore.load();

            // Expose API for other plugins (e.g., Planet Info Overlay)
            window.economyManagementAPI = {
                getBuildMethodForPlanet: (planetId) => this.dataStore.getBuildMethod(planetId),
                getColonistTaxMethodForPlanet: (planetId) => this.dataStore.getColonistTaxMethod(planetId),
                getNativeTaxMethodForPlanet: (planetId) => this.dataStore.getNativeTaxMethod(planetId)
            };

            console.log('[Economy Management] Initialized');
        }

        /**
         * Apply all methods to all planets
         */
        applyAllMethods() {
            console.log('[Economy Management] Applying all methods...');

            let buildApplied = 0;
            let taxApplied = 0;
            let skipped = 0;

            for (const planet of vgap.myplanets || []) {
                // Apply build method
                const buildMethod = this.dataStore.getBuildMethod(planet.id);
                if (buildMethod && this.vanillaDetector.canApplyBuildMethod(planet)) {
                    this.buildEngine.execute(planet, buildMethod);
                    buildApplied++;
                } else if (buildMethod) {
                    skipped++;
                }

                // Apply colonist tax method
                const colTaxMethod = this.dataStore.getColonistTaxMethod(planet.id);
                if (colTaxMethod) {
                    const result = this.taxEngine.execute(planet, colTaxMethod, 'colonist');
                    if (result.success && result.rate !== null) {
                        taxApplied++;
                    }
                }

                // Apply native tax method
                if (planet.nativeclans > 0) {
                    const natTaxMethod = this.dataStore.getNativeTaxMethod(planet.id);
                    if (natTaxMethod && this.vanillaDetector.canApplyNativeTax(planet)) {
                        const result = this.taxEngine.execute(planet, natTaxMethod, 'native');
                        if (result.success && result.rate !== null) {
                            taxApplied++;
                        }
                    } else if (natTaxMethod) {
                        skipped++;
                    }
                }
            }

            // Save changes to server
            vgap.save();

            const msg = [`Applied methods:`];
            if (buildApplied > 0) msg.push(`  Build: ${buildApplied} planets`);
            if (taxApplied > 0) msg.push(`  Tax: ${taxApplied} changes`);
            if (skipped > 0) msg.push(`  Skipped: ${skipped} (built-in features enabled)`);
            if (buildApplied === 0 && taxApplied === 0) msg.push('  No methods assigned to planets');

            console.log(`[Economy Management] ${msg.join('\n')}`);
            alert(msg.join('\n'));

            // Re-render dashboard to reflect changes
            this.dashboardUI.renderCurrentView();
        }

        /**
         * Apply methods to a specific list of planets
         * @param {Array} planets - List of planet objects to apply to
         * @param {object} options - Options
         * @param {boolean} options.silent - If true, suppress the summary alert
         */
        applyMethodsToPlanets(planets, { silent = false } = {}) {
            console.log(`[Economy Management] Applying methods to ${planets.length} planets...`);

            let buildApplied = 0;
            let taxApplied = 0;
            let skipped = 0;

            for (const planet of planets) {
                // Apply build method
                const buildMethod = this.dataStore.getBuildMethod(planet.id);
                const canBuild = this.vanillaDetector.canApplyBuildMethod(planet);

                if (buildMethod && canBuild) {
                    const result = this.buildEngine.execute(planet, buildMethod);
                    if (result.factoriesBuilt > 0 || result.minesBuilt > 0 || result.defenseBuilt > 0) {
                        buildApplied++;
                    }
                } else if (buildMethod) {
                    skipped++;
                }

                // Apply colonist tax method
                const colTaxMethod = this.dataStore.getColonistTaxMethod(planet.id);
                if (colTaxMethod) {
                    const result = this.taxEngine.execute(planet, colTaxMethod, 'colonist');
                    if (result.success && result.rate !== null) {
                        taxApplied++;
                    }
                }

                // Apply native tax method
                if (planet.nativeclans > 0) {
                    const natTaxMethod = this.dataStore.getNativeTaxMethod(planet.id);
                    if (natTaxMethod && this.vanillaDetector.canApplyNativeTax(planet)) {
                        const result = this.taxEngine.execute(planet, natTaxMethod, 'native');
                        if (result.success && result.rate !== null) {
                            taxApplied++;
                        }
                    } else if (natTaxMethod) {
                        skipped++;
                    }
                }
            }

            // Save changes to server
            vgap.save();

            const msg = [`Applied methods to ${planets.length} planets:`];
            if (buildApplied > 0) msg.push(`  Build: ${buildApplied} planets`);
            if (taxApplied > 0) msg.push(`  Tax: ${taxApplied} changes`);
            if (skipped > 0) msg.push(`  Skipped: ${skipped} (built-in features enabled)`);
            if (buildApplied === 0 && taxApplied === 0) msg.push('  No methods assigned to these planets');

            console.log(`[Economy Management] ${msg.join('\n')}`);
            if (!silent) {
                alert(msg.join('\n'));
            }

            // Re-render dashboard to reflect changes
            this.dashboardUI.renderCurrentView();
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

                loaddashboard() {
                    self.dashboardUI.addMenuEntry();
                },

                showdashboard() {
                    // Hide planet side panel when going to dashboard
                    self.planetViewInteg.hidePanel();
                    self.planetViewInteg.cleanup();

                    // Re-render our dashboard if it's currently shown
                    // (the game caches dashboard DOM when navigating to the starmap,
                    // so returning to the dashboard shows stale data)
                    self.dashboardUI.renderCurrentView();
                },

                showsummary() {
                    self.dashboardUI.addHomeIcon();
                },

                loadplanet() {
                    if (vgap.planetScreen && vgap.planetScreen.planet) {
                        self.planetViewInteg.injectControls(vgap.planetScreen.planet);
                    }
                },

                showmap() {
                    // Clean up toggle button when going back to map
                    self.planetViewInteg.cleanup();
                },

                loadship() {
                    // Clean up when navigating to a ship
                    self.planetViewInteg.cleanup();
                },

                loadstarbase() {
                    // Clean up when navigating to a starbase
                    self.planetViewInteg.cleanup();
                },

                draw() {
                    // Note: We cannot reliably detect when the planet panel is closed
                    // by checking the DOM or vgap state. Cleanup is handled by:
                    // - showmap hook (user returns to map view)
                    // - showdashboard hook (user goes to dashboard)
                    // - loadship/loadstarbase hooks (user clicks another object)
                    // - loadplanet hook (user clicks another planet)
                    //
                    // The button may remain if user clicks empty space to close
                    // the planet panel without selecting something else.
                }
            };
        }
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    function initPlugin() {
        if (typeof vgap === 'undefined' || vgap.version < 3.0) {
            console.warn('[Economy Management] vgap not available or version too old');
            return;
        }

        const plugin = new EconomyManagement();
        const pluginInterface = plugin.createPluginInterface();

        vgap.registerPlugin(pluginInterface, PLUGIN_NAME);

        console.log(`[Economy Management] v${PLUGIN_VERSION} loaded`);
    }

    function wrapper() {
        if (typeof vgap === 'undefined') {
            setTimeout(wrapper, 100);
            return;
        }
        initPlugin();
    }

    // Inject into page context
    if (typeof unsafeWindow !== 'undefined') {
        const script = document.createElement('script');
        script.textContent = '(' + wrapper.toString() + ')();';
        document.body.appendChild(script);
    } else {
        wrapper();
    }

})();
