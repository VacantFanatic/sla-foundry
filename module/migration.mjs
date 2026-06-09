import { NATURAL_WEAPONS } from './data/natural-weapons.mjs';
import { migrateNaturalWeapons } from './migration/natural-weapons.mjs';
import {
    getEbbFormulaMigrationUpdate,
    getVehicleActorMigrationData,
    getArmorMigrationData,
    getWeaponMigrationData,
    getSpeciesMigrationData
} from './migration/pure.mjs';

/** * module/migration.mjs
 * Schema version is stored in game.settings ("sla-industries", "schemaVersion") as a plain integer.
 * Increment DATA_MODEL_VERSION by 1 whenever migration steps change so older worlds re-run.
 * This is completely independent of the release version in package.json / system.json.
 */

/**
 * Monotonically increasing data model version.
 * History:
 *  1 — migrateTo200: HTML field normalisation for ApplicationV2 sheets
 *  2 — migrateTo210: remove legacy drug system.mods / system.damageReduction keys
 *  3 — ebbFormula: system.removeWounds boolean → integer 0–6 (true → 6)
 *  4 — ebbFormula: system.ebbEffect ‘none’ → ‘effect’
 *  5 — ebbFormula: system.ebbHpWoundMode → system.ebbHealWoundMode (interim dev field cleanup)
 */
export const DATA_MODEL_VERSION = 5;

/**
 * Client-side world snapshot for disaster recovery before migration runs.
 * Omits ChatMessage and FogExploration (often very large). Only the active GM triggers the download.
 * @see https://foundryvtt.com/api/v14/functions/foundry.utils.saveDataToFile.html
 */
async function downloadMigrationWorldBackup() {
    if (!game?.user?.isActiveGM) return;
    if (game.settings.get('sla-industries', 'enableMigrationWorldBackup') === false) return;

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
        ui.notifications.info('SLA Industries: Preparing migration backup download…', { permanent: false });

        const collections = {};
        for (const DocClass of docClasses) {
            const col = DocClass.collection;
            if (!col?.documentName) continue;
            const docs = Array.isArray(col.contents) ? col.contents : Array.from(col);
            collections[col.documentName] = docs.map((d) => d.toObject());
        }

        const payload = {
            format: 'sla-industries-migration-backup',
            formatVersion: 1,
            exportedAt: new Date().toISOString(),
            world: { id: game.world?.id ?? null, title: game.world?.title ?? null },
            schemaVersionBefore: game.settings.get('sla-industries', 'schemaVersion'),
            schemaVersionTarget: DATA_MODEL_VERSION,
            foundryVersion: game.version,
            systemId: game.system?.id ?? null,
            systemVersion: game.system?.version ?? null,
            collections
        };

        const json = JSON.stringify(payload);
        const safeWorld = String(game.world?.id ?? 'world').replace(/[^a-z0-9._-]/gi, '_');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `sla-migration-backup_${safeWorld}_${stamp}.json`;
        foundry.utils.saveDataToFile(json, 'application/json', filename);

        ui.notifications.info(`SLA Industries: Migration backup downloaded (${filename}).`, { permanent: false });
    } catch (err) {
        console.error('SLA | Migration backup failed:', err);
        ui.notifications.error(
            'SLA Industries: Migration backup failed; continuing migration. See the console (F12).',
            { permanent: true }
        );
    }
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
    ui.notifications.info(
        `SLA Industries System: Applying data model migration (schema v${DATA_MODEL_VERSION}). Please wait...`,
        { permanent: true }
    );

    await downloadMigrationWorldBackup();

    // Run version-specific migrations (before per-document loops below)
    await migrateTo200();
    await migrateTo210();

    const meleeSkills = ['melee', 'unarmed', 'thrown'];

    // 1. Migrate World Items
    const worldItems = game.items.contents;
    for (const item of worldItems) {
        // Vehicles are Actors in SLA; Item type "vehicle" breaks validation (e.g. after bad import/drag)
        if (item.type === 'vehicle') {
            console.log(`SLA | Migrating world Item "${item.name}" from type vehicle → item`);
            await item.update({ type: 'item' });
            continue;
        }
        if (item.type === 'weapon') await migrateWeaponItem(item, meleeSkills);
        if (item.type === 'armor') await migrateArmorItem(item);
        if (item.type === 'species') await migrateSpeciesItem(item);
        if (item.type === 'ebbFormula') {
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
            const oldResist = foundry.utils.getProperty(actor, 'system.armor.resist');
            if (typeof oldResist === 'number') {
                console.log(`Migrating Actor Data for ${actor.name}: armor.resist to Schema`);
                actorUpdate['system.armor.resist'] = { value: 0, max: 0 };
            }

            // Initialize xpLedger for character actors (new in 0.23.0)
            if (actor.type === 'character') {
                const xpLedger = foundry.utils.getProperty(actor, 'system.xpLedger');
                if (xpLedger === undefined || xpLedger === null) {
                    actorUpdate['system.xpLedger'] = [];
                }
            }

            // Migrate NPC Wound and Condition Fields (if missing)
            if (actor.type === 'npc') {
                const wounds = foundry.utils.getProperty(actor, 'system.wounds') || {};

                // Initialize individual wound fields if missing
                if (wounds.head === undefined) {
                    actorUpdate['system.wounds.head'] = false;
                }
                if (wounds.torso === undefined) {
                    actorUpdate['system.wounds.torso'] = false;
                }
                if (wounds.lArm === undefined) {
                    actorUpdate['system.wounds.lArm'] = false;
                }
                if (wounds.rArm === undefined) {
                    actorUpdate['system.wounds.rArm'] = false;
                }
                if (wounds.lLeg === undefined) {
                    actorUpdate['system.wounds.lLeg'] = false;
                }
                if (wounds.rLeg === undefined) {
                    actorUpdate['system.wounds.rLeg'] = false;
                }

                // Initialize conditions field if missing
                const conditions = foundry.utils.getProperty(actor, 'system.conditions');
                if (!conditions || typeof conditions !== 'object') {
                    // Entire conditions object is missing - set it all at once
                    actorUpdate['system.conditions'] = {
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
                    if (conditions.bleeding === undefined) actorUpdate['system.conditions.bleeding'] = false;
                    if (conditions.burning === undefined) actorUpdate['system.conditions.burning'] = false;
                    if (conditions.prone === undefined) actorUpdate['system.conditions.prone'] = false;
                    if (conditions.stunned === undefined) actorUpdate['system.conditions.stunned'] = false;
                    if (conditions.immobile === undefined) actorUpdate['system.conditions.immobile'] = false;
                    if (conditions.critical === undefined) actorUpdate['system.conditions.critical'] = false;
                    if (conditions.dead === undefined) actorUpdate['system.conditions.dead'] = false;
                }

                if (
                    Object.keys(actorUpdate).some(
                        (key) => key.startsWith('system.wounds.') || key.startsWith('system.conditions')
                    )
                ) {
                    console.log(`Migrating NPC ${actor.name}: Adding wound and condition fields`);
                }
            }

            if (actor.type === 'vehicle') {
                const vehicleUpdate = getVehicleActorMigrationData(actor);
                actorUpdate = foundry.utils.mergeObject(actorUpdate, vehicleUpdate);
            }

            // Migrate Luck & Flux Max
            const luck = foundry.utils.getProperty(actor, 'system.stats.luck');
            const flux = foundry.utils.getProperty(actor, 'system.stats.flux');
            const hasLuckMax = luck && luck.max !== undefined && luck.max !== null;
            const hasFluxMax = flux && flux.max !== undefined && flux.max !== null;

            if (!hasLuckMax || !hasFluxMax) {
                // Determine species
                const speciesItem = actor.items.find((i) => i.type === 'species');
                const speciesName = speciesItem ? speciesItem.name.toLowerCase() : '';

                let luckInit = 0;
                let luckMax = 0;
                let fluxInit = 0;
                let fluxMax = 0;

                if (speciesName.includes('ebon')) {
                    // Ebonite: Flux 2/6
                    fluxInit = 2;
                    fluxMax = 6;
                } else if (speciesName.includes('human')) {
                    luckInit = 1;
                    luckMax = 6;
                } else if (speciesName.includes('frother')) {
                    luckInit = 1;
                    luckMax = 3;
                } else if (speciesName.includes('wraithen')) {
                    luckInit = 1;
                    luckMax = 4;
                } else if (
                    speciesName.includes('shaktar') ||
                    speciesName.includes('carrien') ||
                    speciesName.includes('neophron')
                ) {
                    // Shaktar, Adv. Carrien, Neophron: Luck 0/3
                    luckInit = 0;
                    luckMax = 3;
                } else if (speciesName.includes('stormer')) {
                    // Stormer 313 & 711: Luck 0/2
                    luckInit = 0;
                    luckMax = 2;
                } else {
                    // Default fallback (e.g. unknown species or no species)
                    // If no species, leave as 0 (hidden)
                }

                // Apply Updates if missing
                if (!hasLuckMax) {
                    actorUpdate['system.stats.luck.value'] = luckInit;
                    actorUpdate['system.stats.luck.max'] = luckMax;
                }

                if (!hasFluxMax) {
                    actorUpdate['system.stats.flux.value'] = fluxInit;
                    actorUpdate['system.stats.flux.max'] = fluxMax;
                }
            }
        }

        // B. Migrate Embedded Items
        const updates = [];
        const actorItems = actor.items.contents;
        for (const item of actorItems) {
            if (item.type === 'vehicle') {
                console.log(`SLA | Migrating embedded Item "${item.name}" on ${actor.name} from type vehicle → item`);
                updates.push({ _id: item.id, type: 'item' });
                continue;
            }
            let updateData = null;
            if (item.type === 'weapon') updateData = getWeaponMigrationData(item, meleeSkills);
            if (item.type === 'armor') updateData = getArmorMigrationData(item);
            if (item.type === 'species') updateData = getSpeciesMigrationData(item);
            if (item.type === 'ebbFormula') updateData = getEbbFormulaMigrationEmbedded(item);
            if (updateData) updates.push(updateData);
        }

        // C. Apply Updates
        if (!foundry.utils.isEmpty(actorUpdate)) {
            await actor.update(actorUpdate);
        }

        if (updates.length > 0) {
            console.log(`Migrating Items for ${actor.name}...`);
            await actor.updateEmbeddedDocuments('Item', updates);
        }
    }

    // 3. SPECIAL MIGRATIONS (External Scripts)
    // Run Natural Weapons Migration (Silent Mode)
    await migrateNaturalWeapons(true);

    // 4. Update the Setting so it doesn't run again
    await game.settings.set('sla-industries', 'schemaVersion', DATA_MODEL_VERSION);

    ui.notifications.info('SLA Industries System: Migration Complete!', { permanent: false });
}

/**
 * Migration Logic for Armor
 */
async function migrateArmorItem(item) {
    const updateData = getArmorMigrationData(item);
    if (updateData) {
        console.log(`Migrating Armor: ${item.name}`);
        await item.update(updateData);
    }
}

/**
 * Migration Logic for a single Item
 */
async function migrateWeaponItem(item, meleeSkills) {
    const updateData = getWeaponMigrationData(item, meleeSkills);
    if (updateData) {
        console.log(`Migrating Item: ${item.name}`);
        await item.update(updateData);
    }
}

/**
 * Migration Logic for Species
 */
async function migrateSpeciesItem(item) {
    const updateData = getSpeciesMigrationData(item);
    if (updateData) {
        console.log(`Migrating Species: ${item.name}`);
        await item.update(updateData);
    }
}

/** HTML paths to persist as empty strings when missing (ProseMirror / Application V2 sheets). */
const MIGRATION_200_ACTOR_HTML_FIELDS = {
    character: ['system.biography', 'system.appearance', 'system.notes'],
    npc: ['system.biography', 'system.notes'],
    vehicle: ['system.biography', 'system.appearance', 'system.notes']
};

/**
 * 2.0.0: Application V2 sheets use `<prose-mirror>` for these fields; undefined/null in the database
 * can prevent clean binding. Normalize once so migrated worlds have explicit empty HTML strings.
 */
async function migrateTo200() {
    console.log('SLA Industries | Migration 2.0.0: HTML field normalization for V2 sheets');

    for (const actor of game.actors) {
        const paths = MIGRATION_200_ACTOR_HTML_FIELDS[actor.type];
        if (!paths?.length) continue;

        const updates = {};
        for (const path of paths) {
            const v = foundry.utils.getProperty(actor, path);
            if (v === undefined || v === null) updates[path] = '';
        }
        if (!foundry.utils.isEmpty(updates)) {
            await actor.update(updates);
            console.log(`SLA | 2.0.0: Default HTML fields on actor "${actor.name}" (${actor.type})`);
        }
    }

    for (const item of game.items.contents) {
        const desc = foundry.utils.getProperty(item, 'system.description');
        if (desc === undefined || desc === null) {
            await item.update({ 'system.description': '' });
            console.log(`SLA | 2.0.0: Initialized system.description on world item "${item.name}"`);
        }
    }

    for (const actor of game.actors) {
        const embedded = [];
        for (const item of actor.items.contents) {
            const desc = foundry.utils.getProperty(item, 'system.description');
            if (desc === undefined || desc === null) embedded.push({ _id: item.id, 'system.description': '' });
        }
        if (embedded.length) {
            await actor.updateEmbeddedDocuments('Item', embedded);
            console.log(`SLA | 2.0.0: Initialized system.description on ${embedded.length} item(s) on "${actor.name}"`);
        }
    }
}

/**
 * 2.1.0: Drug items no longer use `system.mods` or `system.damageReduction` (use embedded Active Effects).
 * Drop those keys from persisted data so it matches the current drug item schema.
 */
async function migrateTo210() {
    console.log('SLA Industries | Migration 2.1.0: Remove legacy drug mod/damageReduction fields');

    /**
     * @param {Item} item
     * @returns {Record<string, unknown>|null}
     */
    const drugLegacyDelta = (item) => {
        if (item.type !== 'drug') return null;
        const src = item._source;
        if (!src) return null;
        const delta = {};
        let has = false;
        if (foundry.utils.hasProperty(src, 'system.mods')) {
            delta['system.-=mods'] = null;
            has = true;
        }
        if (foundry.utils.hasProperty(src, 'system.damageReduction')) {
            delta['system.-=damageReduction'] = null;
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
            await actor.updateEmbeddedDocuments('Item', embedded);
            console.log(`SLA | 2.1.0: Stripped legacy drug fields on ${embedded.length} item(s) on "${actor.name}"`);
        }
    }
}
