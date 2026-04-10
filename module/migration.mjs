import { NATURAL_WEAPONS } from "./data/natural-weapons.mjs";
import { migrateNaturalWeapons } from "../scripts/migrate_stat_damage.js";

/** * module/migration.mjs
 * World migration version is stored in game.settings ("sla-industries", "systemMigrationVersion").
 * Bump CURRENT_MIGRATION_VERSION when this file’s behavior changes so older worlds re-run migration.
 */

/**
 * Highest world-data migration currently required.
 * Bump when migration steps change so older worlds re-run. `2.1.1` supersedes `2.1.0` so worlds
 * that reached `2.1.0` without `migrateTo210` (drug legacy keys) still run that step once.
 * `2.4.8`: Ebb formula `removeWounds` boolean → integer 0–6 (true → 6).
 * `2.4.9`: Ebb formula `ebbEffect` `none` → `effect`.
 * `2.5.0`: Ebb formula `ebbHpWoundMode` → `ebbHealWoundMode` when present (interim dev field cleanup).
 */
export const CURRENT_MIGRATION_VERSION = "2.5.0";

/**
 * Client-side world snapshot for disaster recovery before migration runs.
 * Omits ChatMessage and FogExploration (often very large). Only the active GM triggers the download.
 * @see https://foundryvtt.com/api/v14/functions/foundry.utils.saveDataToFile.html
 */
async function downloadMigrationWorldBackup() {
    if (!game?.user?.isActiveGM) return;
    if (game.settings.get("sla-industries", "enableMigrationWorldBackup") === false) return;

    const docClasses = [
        foundry.documents.Actor,
        foundry.documents.Item,
        foundry.documents.Scene,
        foundry.documents.JournalEntry,
        foundry.documents.Macro,
        foundry.documents.Playlist,
        foundry.documents.RollTable,
        foundry.documents.Combat,
        foundry.documents.Folder,
        foundry.documents.User,
        foundry.documents.Cards
    ];
    if (foundry.documents.Setting) docClasses.push(foundry.documents.Setting);

    try {
        ui.notifications.info("SLA Industries: Preparing migration backup download…", { permanent: false });

        const collections = {};
        for (const DocClass of docClasses) {
            const col = DocClass.collection;
            if (!col?.documentName) continue;
            const docs = Array.isArray(col.contents) ? col.contents : Array.from(col);
            collections[col.documentName] = docs.map((d) => d.toObject());
        }

        const payload = {
            format: "sla-industries-migration-backup",
            formatVersion: 1,
            exportedAt: new Date().toISOString(),
            world: { id: game.world?.id ?? null, title: game.world?.title ?? null },
            systemMigrationVersionBefore: game.settings.get("sla-industries", "systemMigrationVersion"),
            systemMigrationVersionTarget: CURRENT_MIGRATION_VERSION,
            foundryVersion: game.version,
            systemId: game.system?.id ?? null,
            systemVersion: game.system?.version ?? null,
            collections
        };

        const json = JSON.stringify(payload);
        const safeWorld = String(game.world?.id ?? "world").replace(/[^a-z0-9._-]/gi, "_");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const filename = `sla-migration-backup_${safeWorld}_${stamp}.json`;
        foundry.utils.saveDataToFile(json, "application/json", filename);

        ui.notifications.info(`SLA Industries: Migration backup downloaded (${filename}).`, { permanent: false });
    } catch (err) {
        console.error("SLA | Migration backup failed:", err);
        ui.notifications.error("SLA Industries: Migration backup failed; continuing migration. See the console (F12).", { permanent: true });
    }
}

/**
 * 2.4.8: `system.removeWounds` on ebbFormula was boolean; now integer 0–6 (true → 6).
 * @param {Item} item
 * @returns {object|null} Update payload without `_id`
 */
function getEbbFormulaRemoveWoundsMigrationUpdate(item) {
    const rw = foundry.utils.getProperty(item, "system.removeWounds");
    if (typeof rw === "boolean") {
        return { "system.removeWounds": rw ? 6 : 0 };
    }
    if (typeof rw === "number") {
        const n = Math.max(0, Math.min(6, Math.floor(rw)));
        return n !== rw ? { "system.removeWounds": n } : null;
    }
    if (rw !== undefined && rw !== null) {
        return { "system.removeWounds": 0 };
    }
    return null;
}

/**
 * Merge ebbFormula migrations (removeWounds + legacy `ebbEffect`).
 * @param {Item} item
 * @returns {object|null} Update payload without `_id`
 */
function getEbbFormulaMigrationUpdate(item) {
    const updates = {};
    const rw = getEbbFormulaRemoveWoundsMigrationUpdate(item);
    if (rw) Object.assign(updates, rw);
    if (foundry.utils.getProperty(item, "system.ebbEffect") === "none") {
        updates["system.ebbEffect"] = "effect";
    }
    const legacyHpWound = foundry.utils.getProperty(item, "system.ebbHpWoundMode");
    const healWound = foundry.utils.getProperty(item, "system.ebbHealWoundMode");
    if (legacyHpWound !== undefined && healWound === undefined) {
        updates["system.ebbHealWoundMode"] = legacyHpWound === "or" ? "or" : "and";
        updates["system.-=ebbHpWoundMode"] = null;
    }
    return Object.keys(updates).length ? updates : null;
}

/** @param {Item} item */
function getEbbFormulaMigrationEmbedded(item) {
    const u = getEbbFormulaMigrationUpdate(item);
    if (!u) return null;
    return { _id: item.id, ...u };
}

/**
 * Main Entry Point
 */
export async function migrateWorld() {
    ui.notifications.info(`SLA Industries System: Applying Migration to version ${CURRENT_MIGRATION_VERSION}. Please wait...`, { permanent: true });

    await downloadMigrationWorldBackup();

    // Run version-specific migrations (before per-document loops below)
    await migrateTo200();
    await migrateTo210();

    const meleeSkills = ["melee", "unarmed", "thrown"];

    // 1. Migrate World Items
    const worldItems = game.items.contents;
    for (const item of worldItems) {
        // Vehicles are Actors in SLA; Item type "vehicle" breaks validation (e.g. after bad import/drag)
        if (item.type === "vehicle") {
            console.log(`SLA | Migrating world Item "${item.name}" from type vehicle → item`);
            await item.update({ type: "item" });
            continue;
        }
        if (item.type === "weapon") await migrateWeaponItem(item, meleeSkills);
        if (item.type === "armor") await migrateArmorItem(item);
        if (item.type === "species") await migrateSpeciesItem(item);
        if (item.type === "ebbFormula") {
            const u = getEbbFormulaMigrationUpdate(item);
            if (u) {
                console.log(`SLA | ebbFormula migration on world item "${item.name}"`);
                await item.update(u);
            }
        }
    }

    // 2. Migrate Actor Items & Data
    for (const actor of game.actors) {
        let actorUpdate = {};

            // A. Migrate Actor Data (Armor Resist)
            if (actor.type === 'character' || actor.type === 'npc') {
                // Check if resist is a number (old schema)
                const oldResist = foundry.utils.getProperty(actor, "system.armor.resist");
                if (typeof oldResist === "number") {
                    console.log(`Migrating Actor Data for ${actor.name}: armor.resist to Schema`);
                    actorUpdate["system.armor.resist"] = { value: 0, max: 0 };
                }

                // Initialize xpLedger for character actors (new in 0.23.0)
                if (actor.type === 'character') {
                    const xpLedger = foundry.utils.getProperty(actor, "system.xpLedger");
                    if (xpLedger === undefined || xpLedger === null) {
                        actorUpdate["system.xpLedger"] = [];
                    }
                }

            // Migrate NPC Wound and Condition Fields (if missing)
            if (actor.type === 'npc') {
                const wounds = foundry.utils.getProperty(actor, "system.wounds") || {};
                
                // Initialize individual wound fields if missing
                if (wounds.head === undefined) {
                    actorUpdate["system.wounds.head"] = false;
                }
                if (wounds.torso === undefined) {
                    actorUpdate["system.wounds.torso"] = false;
                }
                if (wounds.lArm === undefined) {
                    actorUpdate["system.wounds.lArm"] = false;
                }
                if (wounds.rArm === undefined) {
                    actorUpdate["system.wounds.rArm"] = false;
                }
                if (wounds.lLeg === undefined) {
                    actorUpdate["system.wounds.lLeg"] = false;
                }
                if (wounds.rLeg === undefined) {
                    actorUpdate["system.wounds.rLeg"] = false;
                }

                // Initialize conditions field if missing
                const conditions = foundry.utils.getProperty(actor, "system.conditions");
                if (!conditions || typeof conditions !== 'object') {
                    // Entire conditions object is missing - set it all at once
                    actorUpdate["system.conditions"] = {
                        bleeding: false,
                        burning: false,
                        prone: false,
                        stunned: false,
                        immobile: false,
                        critical: false,
                        dead: false
                    };
                } else {
                    // Conditions object exists, but individual fields might be missing
                    // Initialize individual condition fields if missing
                    if (conditions.bleeding === undefined) actorUpdate["system.conditions.bleeding"] = false;
                    if (conditions.burning === undefined) actorUpdate["system.conditions.burning"] = false;
                    if (conditions.prone === undefined) actorUpdate["system.conditions.prone"] = false;
                    if (conditions.stunned === undefined) actorUpdate["system.conditions.stunned"] = false;
                    if (conditions.immobile === undefined) actorUpdate["system.conditions.immobile"] = false;
                    if (conditions.critical === undefined) actorUpdate["system.conditions.critical"] = false;
                    if (conditions.dead === undefined) actorUpdate["system.conditions.dead"] = false;
                }

                if (Object.keys(actorUpdate).some(key => key.startsWith("system.wounds.") || key.startsWith("system.conditions"))) {
                    console.log(`Migrating NPC ${actor.name}: Adding wound and condition fields`);
                }
            }

            if (actor.type === "vehicle") {
                const vehicleUpdate = getVehicleActorMigrationData(actor);
                actorUpdate = foundry.utils.mergeObject(actorUpdate, vehicleUpdate);
            }

            // Migrate Luck & Flux Max
            const luck = foundry.utils.getProperty(actor, "system.stats.luck");
            const flux = foundry.utils.getProperty(actor, "system.stats.flux");
            const hasLuckMax = luck && (luck.max !== undefined && luck.max !== null);
            const hasFluxMax = flux && (flux.max !== undefined && flux.max !== null);

            if (!hasLuckMax || !hasFluxMax) {
                // Determine species
                const speciesItem = actor.items.find(i => i.type === "species");
                const speciesName = speciesItem ? speciesItem.name.toLowerCase() : "";

                let luckInit = 0;
                let luckMax = 0;
                let fluxInit = 0;
                let fluxMax = 0;

                if (speciesName.includes("ebon")) {
                    // Ebonite: Flux 2/6
                    fluxInit = 2;
                    fluxMax = 6;
                } else if (speciesName.includes("human")) {
                    luckInit = 1;
                    luckMax = 6;
                } else if (speciesName.includes("frother")) {
                    luckInit = 1;
                    luckMax = 3;
                } else if (speciesName.includes("wraithen")) {
                    luckInit = 1;
                    luckMax = 4;
                } else if (speciesName.includes("shaktar") || speciesName.includes("carrien") || speciesName.includes("neophron")) {
                    // Shaktar, Adv. Carrien, Neophron: Luck 0/3
                    luckInit = 0;
                    luckMax = 3;
                } else if (speciesName.includes("stormer")) {
                    // Stormer 313 & 711: Luck 0/2
                    luckInit = 0;
                    luckMax = 2;
                } else {
                    // Default fallback (e.g. unknown species or no species)
                    // If no species, leave as 0 (hidden)
                }

                // Apply Updates if missing
                if (!hasLuckMax) {
                    actorUpdate["system.stats.luck.value"] = luckInit;
                    actorUpdate["system.stats.luck.max"] = luckMax;
                }

                if (!hasFluxMax) {
                    actorUpdate["system.stats.flux.value"] = fluxInit;
                    actorUpdate["system.stats.flux.max"] = fluxMax;
                }
            }
        }

        // B. Migrate Embedded Items
        const updates = [];
        const actorItems = actor.items.contents;
        for (const item of actorItems) {
            if (item.type === "vehicle") {
                console.log(`SLA | Migrating embedded Item "${item.name}" on ${actor.name} from type vehicle → item`);
                updates.push({ _id: item.id, type: "item" });
                continue;
            }
            let updateData = null;
            if (item.type === "weapon") updateData = await getWeaponMigrationData(item, meleeSkills);
            if (item.type === "armor") updateData = await getArmorMigrationData(item);
            if (item.type === "species") updateData = await getSpeciesMigrationData(item);
            if (item.type === "ebbFormula") updateData = getEbbFormulaMigrationEmbedded(item);
            if (updateData) updates.push(updateData);
        }

        // C. Apply Updates
        if (!foundry.utils.isEmpty(actorUpdate)) {
            await actor.update(actorUpdate);
        }

        if (updates.length > 0) {
            console.log(`Migrating Items for ${actor.name}...`);
            await actor.updateEmbeddedDocuments("Item", updates);
        }
    }

    // 3. SPECIAL MIGRATIONS (External Scripts)
    // Run Natural Weapons Migration (Silent Mode)
    await migrateNaturalWeapons(true);

    // 4. Update the Setting so it doesn't run again
    await game.settings.set("sla-industries", "systemMigrationVersion", CURRENT_MIGRATION_VERSION);

    ui.notifications.info("SLA Industries System: Migration Complete!", { permanent: false });
}

function getVehicleActorMigrationData(actor) {
    const system = actor.system || {};
    const updateData = {};

    if (system.notes === undefined) updateData["system.notes"] = "";
    if (system.skill === undefined) updateData["system.skill"] = "";
    if (!system.dimensions) updateData["system.dimensions"] = { length: "", width: "", height: "" };
    else {
        if (system.dimensions.length === undefined) updateData["system.dimensions.length"] = "";
        if (system.dimensions.width === undefined) updateData["system.dimensions.width"] = "";
        if (system.dimensions.height === undefined) updateData["system.dimensions.height"] = "";
    }
    if (system.capacity === undefined) updateData["system.capacity"] = "";
    if (system.mountedWeaponsIgnoreSkillReq === undefined) updateData["system.mountedWeaponsIgnoreSkillReq"] = true;
    if (system.providesCombatCover === undefined) updateData["system.providesCombatCover"] = true;

    if (!system.hp) updateData["system.hp"] = { value: 10, max: 10 };
    else {
        if (system.hp.value === undefined) updateData["system.hp.value"] = 10;
        if (system.hp.max === undefined) updateData["system.hp.max"] = 10;
    }

    if (!system.armor) updateData["system.armor"] = { pv: 0, resist: { value: 0, max: 0 } };
    else {
        if (system.armor.pv === undefined) updateData["system.armor.pv"] = 0;
        if (!system.armor.resist) updateData["system.armor.resist"] = { value: 0, max: 0 };
        else {
            if (system.armor.resist.value === undefined) updateData["system.armor.resist.value"] = 0;
            if (system.armor.resist.max === undefined) updateData["system.armor.resist.max"] = 0;
        }
    }

    if (!system.move) updateData["system.move"] = { value: 0 };
    else if (system.move.value === undefined) updateData["system.move.value"] = 0;

    return updateData;
}

/**
 * Migration Logic for Armor
 */
async function migrateArmorItem(item) {
    const updateData = await getArmorMigrationData(item);
    if (updateData) {
        console.log(`Migrating Armor: ${item.name}`);
        await item.update(updateData);
    }
}

/**
 * Get Armor Data Delta
 */
async function getArmorMigrationData(item) {
    const system = item.system;
    const updateData = { _id: item.id };
    let hasChanges = false;

    // Initialize Powered Fields
    if (system.powered === undefined) {
        updateData["system.powered"] = false;
        hasChanges = true;
    }

    if (!system.mods) {
        updateData["system.mods"] = {
            str: 0,
            dex: 0,
            move: { closing: 0, rushing: 0 }
        };
        hasChanges = true;
    }

    if (system.powersuit === undefined) {
        updateData["system.powersuit"] = false;
        hasChanges = true;
    }
    if (system.dexCap === undefined) {
        updateData["system.dexCap"] = 0;
        hasChanges = true;
    }
    if (system.initBonus === undefined) {
        updateData["system.initBonus"] = 0;
        hasChanges = true;
    }

    return hasChanges ? updateData : null;
}

/**
 * Migration Logic for a single Item
 */
async function migrateWeaponItem(item, meleeSkills) {
    const updateData = await getWeaponMigrationData(item, meleeSkills);
    if (updateData) {
        console.log(`Migrating Item: ${item.name}`);
        await item.update(updateData);
    }
}


/**
 * Calculate the data delta
 */
async function getWeaponMigrationData(item, meleeSkills) {
    const system = item.system;

    // A. Attack Type
    let attackType = system.attackType;
    if (!attackType) {
        const skillName = (system.skill || "").toLowerCase().trim();
        if (meleeSkills.includes(skillName)) attackType = "melee";
        else attackType = "ranged";
    }

    // B. Firing Modes
    let firingModes = system.firingModes;
    if (attackType === "ranged" && (!firingModes || foundry.utils.isEmpty(firingModes))) {
        const oldRecoil = Number(system.recoil) || 0;
        firingModes = {
            single: { label: "Single", active: true, rounds: 1, recoil: 0 },
            burst: { label: "Burst", active: false, rounds: 3, recoil: oldRecoil > 0 ? oldRecoil : 1 },
            auto: { label: "Full Auto", active: false, rounds: 10, recoil: oldRecoil > 0 ? (oldRecoil * 2) : 4 }
        };
    }

    // C. Compile Changes
    const updateData = { _id: item.id };
    let hasChanges = false;

    if (system.attackType !== attackType) {
        updateData["system.attackType"] = attackType;
        hasChanges = true;
    }
    if (firingModes && !foundry.utils.objectsEqual(system.firingModes, firingModes)) {
        updateData["system.firingModes"] = firingModes;
        hasChanges = true;
    }
    if (system.powersuitAttack === undefined) {
        updateData["system.powersuitAttack"] = false;
        hasChanges = true;
    }
    if (system.attackPenalty === undefined) {
        updateData["system.attackPenalty"] = 0;
        hasChanges = true;
    }
    if (system.adFromStrMinus === undefined) {
        updateData["system.adFromStrMinus"] = 0;
        hasChanges = true;
    }

    return hasChanges ? updateData : null;
}


/**
 * Migration Logic for Species
 */
async function migrateSpeciesItem(item) {
    const updateData = await getSpeciesMigrationData(item);
    if (updateData) {
        console.log(`Migrating Species: ${item.name}`);
        await item.update(updateData);
    }
}

async function getSpeciesMigrationData(item) {
    const system = item.system;
    const updateData = { _id: item.id };
    let hasChanges = false;
    const name = item.name.toLowerCase();

    // Determine target values based on name
    let luckInit = 0, luckMax = 0, fluxInit = 0, fluxMax = 0;
    let hpBase = 10;
    let moveClosing = 0, moveRushing = 0;

    if (name.includes("ebon")) {
        fluxInit = 2; fluxMax = 6;
        hpBase = 14;
        moveClosing = 2; moveRushing = 5;
    } else if (name.includes("human")) {
        luckInit = 1; luckMax = 6;
        hpBase = 14;
        moveClosing = 2; moveRushing = 5;
    } else if (name.includes("frother")) {
        luckInit = 1; luckMax = 3;
        hpBase = 15;
        moveClosing = 2; moveRushing = 5;
    } else if (name.includes("wraithen")) {
        luckInit = 1; luckMax = 4;
        hpBase = 14;
        moveClosing = 4; moveRushing = 8;
    } else if (name.includes("shaktar")) {
        luckInit = 0; luckMax = 3;
        hpBase = 19;
        moveClosing = 3; moveRushing = 6;
    } else if (name.includes("carrien")) { // Advanced Carrien
        luckInit = 0; luckMax = 3;
        hpBase = 20;
        moveClosing = 4; moveRushing = 7;
    } else if (name.includes("neophron")) {
        luckInit = 0; luckMax = 3;
        hpBase = 11;
        moveClosing = 2; moveRushing = 5;
    } else if (name.includes("stormer")) {
        if (name.includes("313") || name.includes("malice")) {
            luckInit = 0; luckMax = 2;
            hpBase = 22;
            moveClosing = 3; moveRushing = 6;
        } else if (name.includes("711") || name.includes("xeno")) {
            luckInit = 0; luckMax = 2;
            hpBase = 20;
            moveClosing = 4; moveRushing = 6;
        } else {
            // Generic Stormer
            luckInit = 0; luckMax = 2;
            hpBase = 20;
            moveClosing = 3; moveRushing = 6;
        }
    }

    // Check if update is needed
    const currLuckInit = system.luck?.initial || 0;
    const currLuckMax = system.luck?.max || 0;
    const currFluxInit = system.flux?.initial || 0;
    const currFluxMax = system.flux?.max || 0;

    if (currLuckInit !== luckInit || currLuckMax !== luckMax) {
        updateData["system.luck.initial"] = luckInit;
        updateData["system.luck.max"] = luckMax;
        hasChanges = true;
    }

    if (currFluxInit !== fluxInit || currFluxMax !== fluxMax) {
        updateData["system.flux.initial"] = fluxInit;
        updateData["system.flux.max"] = fluxMax;
        hasChanges = true;
    }

    // HP BASE
    const currHp = system.hp || 0;
    if (hpBase > 0 && currHp !== hpBase) {
        updateData["system.hp"] = hpBase;
        hasChanges = true;
    }

    // MOVEMENT
    const currClosing = system.move?.closing || 0;
    const currRushing = system.move?.rushing || 0;
    if (moveClosing > 0 && (currClosing !== moveClosing || currRushing !== moveRushing)) {
        updateData["system.move.closing"] = moveClosing;
        updateData["system.move.rushing"] = moveRushing;
        hasChanges = true;
    }

    return hasChanges ? updateData : null;
}

/** HTML paths to persist as empty strings when missing (ProseMirror / Application V2 sheets). */
const MIGRATION_200_ACTOR_HTML_FIELDS = {
    character: ["system.biography", "system.appearance", "system.notes"],
    npc: ["system.biography", "system.notes"],
    vehicle: ["system.biography", "system.appearance", "system.notes"]
};

/**
 * 2.0.0: Application V2 sheets use `<prose-mirror>` for these fields; undefined/null in the database
 * can prevent clean binding. Normalize once so migrated worlds have explicit empty HTML strings.
 */
async function migrateTo200() {
    console.log("SLA Industries | Migration 2.0.0: HTML field normalization for V2 sheets");

    for (const actor of game.actors) {
        const paths = MIGRATION_200_ACTOR_HTML_FIELDS[actor.type];
        if (!paths?.length) continue;

        const updates = {};
        for (const path of paths) {
            const v = foundry.utils.getProperty(actor, path);
            if (v === undefined || v === null) updates[path] = "";
        }
        if (!foundry.utils.isEmpty(updates)) {
            await actor.update(updates);
            console.log(`SLA | 2.0.0: Default HTML fields on actor "${actor.name}" (${actor.type})`);
        }
    }

    for (const item of game.items.contents) {
        const desc = foundry.utils.getProperty(item, "system.description");
        if (desc === undefined || desc === null) {
            await item.update({ "system.description": "" });
            console.log(`SLA | 2.0.0: Initialized system.description on world item "${item.name}"`);
        }
    }

    for (const actor of game.actors) {
        const embedded = [];
        for (const item of actor.items.contents) {
            const desc = foundry.utils.getProperty(item, "system.description");
            if (desc === undefined || desc === null) embedded.push({ _id: item.id, "system.description": "" });
        }
        if (embedded.length) {
            await actor.updateEmbeddedDocuments("Item", embedded);
            console.log(`SLA | 2.0.0: Initialized system.description on ${embedded.length} item(s) on "${actor.name}"`);
        }
    }
}

/**
 * 2.1.0: Drug items no longer use `system.mods` or `system.damageReduction` (use embedded Active Effects).
 * Drop those keys from persisted data so it matches the current drug item schema.
 */
async function migrateTo210() {
    console.log("SLA Industries | Migration 2.1.0: Remove legacy drug mod/damageReduction fields");

    /**
     * @param {Item} item
     * @returns {Record<string, unknown>|null}
     */
    const drugLegacyDelta = (item) => {
        if (item.type !== "drug") return null;
        const src = item._source;
        if (!src) return null;
        const delta = {};
        let has = false;
        if (foundry.utils.hasProperty(src, "system.mods")) {
            delta["system.-=mods"] = null;
            has = true;
        }
        if (foundry.utils.hasProperty(src, "system.damageReduction")) {
            delta["system.-=damageReduction"] = null;
            has = true;
        }
        return has ? delta : null;
    };

    for (const item of game.items.contents) {
        const d = drugLegacyDelta(item);
        if (d) {
            await item.update(d);
            console.log(`SLA | 2.1.0: Stripped legacy drug fields from world item "${item.name}"`);
        }
    }

    for (const actor of game.actors) {
        const embedded = [];
        for (const item of actor.items.contents) {
            const d = drugLegacyDelta(item);
            if (d) embedded.push({ _id: item.id, ...d });
        }
        if (embedded.length) {
            await actor.updateEmbeddedDocuments("Item", embedded);
            console.log(`SLA | 2.1.0: Stripped legacy drug fields on ${embedded.length} item(s) on "${actor.name}"`);
        }
    }
}