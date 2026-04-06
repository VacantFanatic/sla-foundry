// Import document classes.
import { BoilerplateActor } from "./documents/actor.mjs";
import { BoilerplateItem } from "./documents/item.mjs";
import { LuckDialog } from "./apps/luck-dialog.mjs";

import { SlaCharacterData, SlaNPCData, SlaVehicleData } from "./data/actor.mjs";
import { SlaItemData, SlaSkillData, SlaTraitData, SlaWeaponData, SlaArmorData, SlaEbbFormulaData, SlaDisciplineData, SlaDrugData, SlaSpeciesData, SlaPackageData, SlaMagazineData, SlaExplosiveData } from "./data/item.mjs";

// Import sheet classes.
import { SlaActorSheet } from "./sheets/actor-sheet.mjs";
import { SlaNPCSheet } from "./sheets/actor-npc-sheet.mjs";
import { SlaVehicleSheet } from "./sheets/actor-vehicle-sheet.mjs";
import { SlaItemSheet } from "./sheets/item-sheet.mjs";

// Import ruler.
import { SLATokenRuler } from "./canvas/sla-ruler.mjs";

// Import helpers.
import { preloadHandlebarsTemplates } from "./helpers/templates.mjs";
import { SLAChat } from "./helpers/chat.mjs";
import { SLA } from "./config.mjs";

import { migrateWorld, CURRENT_MIGRATION_VERSION } from "./migration.mjs";
import { rollOwnedItem, addActorItemToHotbar, registerSlaHotbar } from "./helpers/sla-hotbar.mjs";

const movementActionState = new Map();

function getMovementStateKey(combatId, combatantId) {
    if (!combatId || !combatantId) return null;
    return `${combatId}:${combatantId}`;
}

function getTokenDocument(tokenLike) {
    if (!tokenLike) return null;
    return tokenLike.document ?? tokenLike;
}

function getCombatAndCombatantForToken(tokenLike) {
    const combat = game.combat;
    if (!combat) return { combat: null, combatant: null };
    const tokenDoc = getTokenDocument(tokenLike);
    const tokenId = tokenDoc?.id;
    if (!tokenId) return { combat, combatant: null };
    const combatant = combat.combatants.find(c => c.tokenId === tokenId) ?? null;
    return { combat, combatant };
}

function resetMovementActionForTurn(combat, combatant) {
    const key = getMovementStateKey(combat?.id, combatant?.id);
    if (!key) return;
    const tokenDoc = combatant?.token;
    movementActionState.set(key, {
        movementUsed: false,
        round: combat?.round ?? null,
        turn: combat?.turn ?? null,
        turnStart: tokenDoc ? { x: tokenDoc.x, y: tokenDoc.y } : null
    });
}

function markMovementActionUsed(tokenLike) {
    const tokenDoc = getTokenDocument(tokenLike);
    const { combat, combatant } = getCombatAndCombatantForToken(tokenLike);
    if (!combat || !combat.started || !combatant) return;
    const key = getMovementStateKey(combat.id, combatant.id);
    if (!key) return;
    const current = movementActionState.get(key) ?? {};
    movementActionState.set(key, {
        ...current,
        movementUsed: true,
        round: combat.round ?? null,
        turn: combat.turn ?? null,
        turnStart: current.turnStart ?? (tokenDoc ? { x: tokenDoc.x, y: tokenDoc.y } : null)
    });
}

function resetMovementActionUsed(tokenLike) {
    const tokenDoc = getTokenDocument(tokenLike);
    const { combat, combatant } = getCombatAndCombatantForToken(tokenLike);
    if (!combat || !combat.started || !combatant) return;
    const key = getMovementStateKey(combat.id, combatant.id);
    if (!key) return;
    const current = movementActionState.get(key) ?? {};
    movementActionState.set(key, {
        ...current,
        movementUsed: false,
        round: combat.round ?? null,
        turn: combat.turn ?? null,
        turnStart: current.turnStart ?? (tokenDoc ? { x: tokenDoc.x, y: tokenDoc.y } : null)
    });
}

function isMovementActionUsed(tokenLike) {
    const { combat, combatant } = getCombatAndCombatantForToken(tokenLike);
    if (!combat || !combat.started || !combatant) return false;
    const key = getMovementStateKey(combat.id, combatant.id);
    if (!key) return false;

    const entry = movementActionState.get(key);
    if (!entry) return false;
    const sameTurn = entry.round === (combat.round ?? null) && entry.turn === (combat.turn ?? null);
    if (!sameTurn) {
        movementActionState.delete(key);
        return false;
    }
    return entry.movementUsed === true;
}

function canTokenMoveThisTurn(tokenLike) {
    if (!game.settings.get("sla-industries", "enableCombatMovementLock")) return true;
    const { combat, combatant } = getCombatAndCombatantForToken(tokenLike);
    if (!combat || !combat.started || !combatant) return true;

    const activeCombatant = combat.combatant;
    if (!activeCombatant || activeCombatant.id !== combatant.id) return true;
    return !isMovementActionUsed(tokenLike);
}

function isUndoMovement(options) {
    return options?.isUndo === true || options?.undo === true || options?.undoMovement === true;
}

/* -------------------------------------------- */
/* Init Hook                                   */
/* -------------------------------------------- */
Hooks.once('init', async function () {
    console.log("SLA INDUSTRIES | Initializing System...");

    CONFIG.SLA = SLA;

    game.boilerplate = { SlaActorSheet, SlaItemSheet, BoilerplateActor, BoilerplateItem };
    CONFIG.Actor.documentClass = BoilerplateActor;
    CONFIG.Item.documentClass = BoilerplateItem;

    // REGISTER DATA MODELS
    CONFIG.Actor.dataModels = {
        character: SlaCharacterData,
        npc: SlaNPCData,
        vehicle: SlaVehicleData
    };
    CONFIG.Item.dataModels = {
        item: SlaItemData,
        skill: SlaSkillData,
        trait: SlaTraitData,
        weapon: SlaWeaponData,
        explosive: SlaExplosiveData,
        armor: SlaArmorData,
        ebbFormula: SlaEbbFormulaData,
        discipline: SlaDisciplineData,
        drug: SlaDrugData,
        species: SlaSpeciesData,
        package: SlaPackageData,
        magazine: SlaMagazineData,
        // Legacy/orphan: vehicles are Actors in SLA; Item type "vehicle" should not be created but old worlds may contain it
        vehicle: SlaItemData
    };

    // REGISTER CUSTOM TOKEN RULER
    CONFIG.Token.rulerClass = SLATokenRuler;

    CONFIG.Combat.initiative = SLA.combatInitiative;

    game.settings.register("sla-industries", "systemMigrationVersion", {
        name: "System Migration Version",
        scope: "world",
        config: false,  // Hide from UI
        type: String,
        default: "0.0.0"
    });

    game.settings.register("sla-industries", "enableMigrationWorldBackup", {
        name: "Download JSON Backup Before Migration",
        hint: "When the SLA system migrates this world, the active GM’s browser downloads a JSON snapshot of primary world documents (actors, items, scenes, journal, etc.). Chat messages and fog exploration are omitted to keep the file smaller. Turn off if you do not want that download.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register("sla-industries", "enableLongRangeFeature", {
        name: "Enable Long Range Feature",
        hint: "When enabled, ranged attacks beyond half the weapon's maximum range apply a -1 Skill Die penalty.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register("sla-industries", "enableTargetRequiredFeatures", {
        name: "Enable Target-Required Features",
        hint: "When enabled, attacks require a target to be selected and range calculations are performed. When disabled, attacks can be made without targets and range calculations are skipped.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register("sla-industries", "enableAutomaticAmmoConsumption", {
        name: "Enable Automatic Ammo Consumption",
        hint: "When enabled, ammo is automatically reduced when firing ranged weapons. When disabled, ammo must be tracked manually.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register("sla-industries", "enableLowAmmoValidation", {
        name: "Enable Low Ammo Validation",
        hint: "When enabled, prevents firing high-cost modes without enough ammo and applies -2 DMG penalty for low ammo. When disabled, these restrictions are removed.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register("sla-industries", "enableExplosiveThrowAutomation", {
        name: "Enable Explosive Throw Automation",
        hint: "When enabled, throws prompt for a canvas aim point, apply wall checks on the throw and deviation paths, random deviation by distance, and place blast Region templates. When disabled, the throw still rolls and consumes the item, but you resolve placement on the map yourself.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register("sla-industries", "enableAutomaticWoundPenalties", {
        name: "Enable Automatic Wound Penalties",
        hint: "When enabled, wound count automatically reduces all dice rolls. When disabled, wound penalties are not applied.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register("sla-industries", "enableNPCWoundTracking", {
        name: "Enable NPC Wound Tracking",
        hint: "When enabled, NPCs track wounds and display the wounds section. When disabled, NPC wound tracking is disabled and the wounds section is hidden.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register("sla-industries", "enableCombatMovementLock", {
        name: "Enable Combat Movement Lock",
        hint: "When enabled, a combatant can only move once per turn. Disable to allow multiple movement updates during a turn.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    CONFIG.statusEffects = SLA.statusEffects;
    CONFIG.Actor.trackableAttributes = SLA.trackableAttributes;



    // REGISTER HANDLEBARS HELPERS
    Handlebars.registerHelper('capitalize', function (str) {
        if (typeof str !== 'string') return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    });

    Handlebars.registerHelper('upper', function (str) {
        if (typeof str !== 'string') return '';
        return str.toUpperCase();
    });

    foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
    foundry.documents.collections.Actors.registerSheet("sla-industries", SlaActorSheet, { types: ["character"], makeDefault: true, label: "SLA Operative Sheet" });
    foundry.documents.collections.Actors.registerSheet("sla-industries", SlaNPCSheet, { types: ["npc"], makeDefault: true, label: "SLA Threat Sheet" });
    foundry.documents.collections.Actors.registerSheet("sla-industries", SlaVehicleSheet, { types: ["vehicle"], makeDefault: true, label: "SLA Vehicle Sheet" });

    foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
    foundry.documents.collections.Items.registerSheet("sla-industries", SlaItemSheet, { makeDefault: true, label: "SLA Item Sheet" });

    game.sla = foundry.utils.mergeObject(game.sla ?? {}, {
        rollOwnedItem,
        addActorItemToHotbar,
        canTokenMoveThisTurn
    });

    return preloadHandlebarsTemplates();
});

/* -------------------------------------------- */
/* Helpers                                     */
/* -------------------------------------------- */
Handlebars.registerHelper('toLowerCase', function (str) { return str ? str.toLowerCase() : ""; });
Handlebars.registerHelper('eq', function (a, b) { return a === b; });
Handlebars.registerHelper('ne', function (a, b) { return a !== b; });
Handlebars.registerHelper('or', function (a, b) { return a || b; });
Handlebars.registerHelper('gt', function (a, b) { return a > b; });
Handlebars.registerHelper('lt', function (a, b) { return a < b; });
Handlebars.registerHelper('and', function (a, b) { return a && b; });



/* -------------------------------------------- */
/* Global Listeners (Rolling & Applying Damage) */
/* -------------------------------------------- */
Hooks.once("ready", async function () {
    // 1. Check current schema version
    const currentVersion = game.settings.get("sla-industries", "systemMigrationVersion");

    // 2. If world is older than our code, Run Migration
    if (foundry.utils.isNewerVersion(CURRENT_MIGRATION_VERSION, currentVersion)) {
        await migrateWorld();
    }

    // 3. Initialize Global Chat Listeners
    SLAChat.init();
    Hooks.on("renderChatMessageHTML", SLAChat.onRenderChatMessage);

    registerSlaHotbar();

    Hooks.on("updateCombat", (combat, changed) => {
        if (!combat?.started) return;
        if (!(foundry.utils.hasProperty(changed, "turn") || foundry.utils.hasProperty(changed, "round"))) return;
        const activeCombatant = combat.combatant;
        if (!activeCombatant?.id) return;
        resetMovementActionForTurn(combat, activeCombatant);
    });

    Hooks.on("deleteCombat", (combat) => {
        if (!combat?.id) return;
        for (const key of movementActionState.keys()) {
            if (key.startsWith(`${combat.id}:`)) movementActionState.delete(key);
        }
    });

    Hooks.on("preUpdateToken", (tokenDocument, changed, options) => {
        const isMoveUpdate = foundry.utils.hasProperty(changed, "x") || foundry.utils.hasProperty(changed, "y");
        if (!isMoveUpdate) return true;
        if (isUndoMovement(options)) return true;
        if (canTokenMoveThisTurn(tokenDocument)) return true;

        ui.notifications.warn("Movement action already used this turn.");
        return false;
    });

    Hooks.on("updateToken", (tokenDocument, changed, options) => {
        const isMoveUpdate = foundry.utils.hasProperty(changed, "x") || foundry.utils.hasProperty(changed, "y");
        if (!isMoveUpdate) return;
        if (isUndoMovement(options)) {
            resetMovementActionUsed(tokenDocument);
            ui.notifications.info("Movement undo detected: movement action reset for this turn.");
            return;
        }
        markMovementActionUsed(tokenDocument);
    });

    // Stunned: act at the lowest initiative in the encounter — clamp to current minimum when initiative updates
    Hooks.on("updateCombatant", async (combatant, changed, options) => {
        if (options?.slaStunnedInitiative) return;
        if (!game.user?.isActiveGM) return;
        if (!foundry.utils.hasProperty(changed, "initiative")) return;
        const combat = combatant.combat;
        if (!combat) return;

        const all = combat.combatants.contents;
        const numeric = all.map(c => c.initiative).filter(v => typeof v === "number" && !Number.isNaN(v));
        if (!numeric.length) return;
        const minInit = Math.min(...numeric);

        const updates = [];
        for (const c of all) {
            if (!c.actor?.effects?.some(e => e.statuses.has("stunned"))) continue;
            if (typeof c.initiative !== "number" || Number.isNaN(c.initiative)) continue;
            if (c.initiative > minInit) {
                updates.push({ _id: c.id, initiative: minInit });
            }
        }
        if (updates.length) {
            await combat.updateEmbeddedDocuments("Combatant", updates, { slaStunnedInitiative: true });
        }
    });
});