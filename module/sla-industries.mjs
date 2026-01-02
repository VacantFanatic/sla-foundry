// Import document classes.
import { BoilerplateActor } from "./documents/actor.mjs";
import { BoilerplateItem } from "./documents/item.mjs";
import { LuckDialog } from "./apps/luck-dialog.mjs";

import { SlaCharacterData, SlaNPCData } from "./data/actor.mjs";
import { SlaItemData, SlaSkillData, SlaTraitData, SlaWeaponData, SlaArmorData, SlaEbbFormulaData, SlaDisciplineData, SlaDrugData, SlaSpeciesData, SlaPackageData, SlaMagazineData, SlaExplosiveData } from "./data/item.mjs";

// Import sheet classes.
import { SlaActorSheet } from "./sheets/actor-sheet.mjs";
import { SlaNPCSheet } from "./sheets/actor-npc-sheet.mjs";
import { SlaItemSheet } from "./sheets/item-sheet.mjs";

// Import ruler.
import { SLATokenRuler } from "./canvas/sla-ruler.mjs";

// Import helpers.
import { preloadHandlebarsTemplates } from "./helpers/templates.mjs";
import { SLAChat } from "./helpers/chat.mjs";
import { SLA } from "./config.mjs";

import { migrateWorld, CURRENT_MIGRATION_VERSION } from "./migration.mjs";

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
        npc: SlaNPCData
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
        magazine: SlaMagazineData
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

    foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
    foundry.documents.collections.Items.registerSheet("sla-industries", SlaItemSheet, { makeDefault: true, label: "SLA Item Sheet" });

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
});