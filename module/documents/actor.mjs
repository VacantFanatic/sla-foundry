import { NATURAL_WEAPONS } from '../data/natural-weapons.mjs';
import {
    computeArmorPiecePv,
    computeCarriedItemWeight,
    computeEffectiveArmorPv,
    computeEncumbranceState
} from './derived/encumbrance.mjs';
import {
    effectChangeRows,
    computeActiveEffectKeyValue,
    computeActiveEffectStatBonus
} from './derived/active-effects.mjs';
import { applyStatPenalties } from './derived/penalties.mjs';
import { clampHpValue } from '../sheets/actor/sheet-ux-pure.mjs';
import { countWounds, deriveLogicConditions } from './derived/wounds.mjs';
import { resolveDerivedHpMax } from './derived/hp.mjs';
import { computeArmorModifierEffects } from './derived/armor-modifiers.mjs';
import { computeInitiativeBonus, computeMovement } from './derived/movement.mjs';
import { handleSpeciesAdd, handleSpeciesRemove } from './actor/species-lifecycle.mjs';
import { syncBleedingToWounds, handleWoundEffects, handleWoundThresholds } from './actor/wound-lifecycle.mjs';

/**
 * Extend the basic Actor document.
 * @extends {Actor}
 */
export class SlaActor extends Actor {
    /**
     * Active effect change rows (Foundry 14 may store under effect.system.changes).
     * @param {ActiveEffect} effect
     * @returns {EffectChangeData[]}
     */
    static _effectChangeRows(effect) {
        return effectChangeRows(effect);
    }

    /**
     * Computes system.stats.<key>.bonus from its stored base plus every enabled effect's
     * matching change rows (Add/Subtract/Multiply/Downgrade/Upgrade/Override), applied in
     * priority order. Core does not reliably merge nested TypeDataModel paths, so we apply
     * this explicitly.
     * @param {string} statKey  str, dex, know, conc, cha, cool
     * @param {number} baseBonus
     */
    _computeCoreStatBonus(statKey, baseBonus) {
        return computeActiveEffectStatBonus(this.effects, statKey, baseBonus);
    }

    /**
     * Computes system.rollModifier.bonus — a standing modifier applied to every roll (skill,
     * stat, weapon, explosive, Ebb) — from its stored base plus every enabled effect's matching
     * change rows, applied in priority order.
     * @param {number} baseBonus
     */
    _computeRollModifierTotal(baseBonus) {
        return computeActiveEffectKeyValue(this.effects, 'system.rollModifier.bonus', baseBonus);
    }

    /**
     * Computes the effective `system.hp.bonus` — a flat HP Max addition (e.g. a Gang Colours
     * trait's +5 HP) — from its stored base plus every enabled effect's matching change rows,
     * applied in priority order. Resolved once per derived-data pass so both the wound/critical
     * projection and the final HP max calculation (see resolveDerivedHpMax) read the same value.
     * @param {number} baseBonus
     */
    _computeHpBonusTotal(baseBonus) {
        return computeActiveEffectKeyValue(this.effects, 'system.hp.bonus', baseBonus);
    }

    /** @override */
    prepareDerivedData() {
        super.prepareDerivedData();

        const actorData = this;
        const system = actorData.system;

        // Safety check
        if (!system.stats) return;

        // Only calculate for Characters and NPCs
        if (actorData.type === 'character' || actorData.type === 'npc') {
            // 1. Core stat totals: _source base + stored bonus with active effect changes applied
            const statsWithBonus = new Set(['str', 'dex', 'know', 'conc', 'cha', 'cool']);
            const srcStats = foundry.utils.getProperty(this._source, 'system.stats') || {};
            for (const key of statsWithBonus) {
                const stat = system.stats[key];
                if (!stat || typeof stat !== 'object') continue;
                const src = srcStats[key] || {};
                const base = Number(src.value) || 0;
                const srcBonus = Number(src.bonus) || 0;
                stat.total = base + this._computeCoreStatBonus(key, srcBonus);
            }
            for (const [key, stat] of Object.entries(system.stats)) {
                if (!stat || typeof stat !== 'object') continue;
                if (statsWithBonus.has(key)) continue;
                stat.total = Number(stat.value) || 0;
            }

            // 1B. Standing roll modifier: stored bonus with live Active Effect changes on
            // system.rollModifier.bonus applied. No separate player-editable base — Active Effects only.
            if (system.rollModifier) {
                const srcRollModifier = foundry.utils.getProperty(this._source, 'system.rollModifier') || {};
                const rollModifierSrcBonus = Number(srcRollModifier.bonus) || 0;
                system.rollModifier.total = this._computeRollModifierTotal(rollModifierSrcBonus);
            }

            // 1C. HP bonus: stored base bonus with live Active Effect changes on system.hp.bonus
            // applied. Resolved once here so both the wound/critical projection below and the
            // final HP max calculation (_calculateDerived) read the same effective value.
            if (system.hp) {
                const srcHp = foundry.utils.getProperty(this._source, 'system.hp') || {};
                const hpSrcBonus = Number(srcHp.bonus) || 0;
                system.hp.bonus = this._computeHpBonusTotal(hpSrcBonus);
            }

            // 2. Drug mechanics use Active Effects (item embedded effects); do not stack here.

            // 2B. APPLY ARMOR MODIFIERS
            this._applyArmorModifiers(system);

            // 3. CALCULATE WOUNDS & SET CONDITIONS
            this._calculateWounds(system);

            // 4. CALCULATE ENCUMBRANCE (Requires Base STR)
            this._calculateEncumbrance(system);

            // 5. APPLY CONDITION PENALTIES (Critical, Encumbrance, etc.)
            this._applyPenalties(system);

            // 6. CALCULATE DERIVED (HP, Init, Move) - Requires Final Stats
            this._calculateDerived(system);
        }
    }

    /* -------------------------------------------- */
    /* 2B. Armor Modifiers                          */
    /* -------------------------------------------- */
    _applyArmorModifiers(system) {
        if (!system.stats) return;

        // Filter for Equipped, Powered Armor that is NOT broken
        const armors = this.items.filter(
            (i) => i.type === 'armor' && i.system.equipped && i.system.powered && i.system.resistance?.value > 0
        );

        if (!system.move) system.move = { closing: 0, rushing: 0 };

        const result = computeArmorModifierEffects({
            armors,
            strTotal: system.stats.str?.total ?? 0,
            dexTotal: system.stats.dex?.total ?? 0
        });

        if (system.stats.str) system.stats.str.total = result.str;
        if (system.stats.dex) system.stats.dex.total = result.dex;
        if (system.stats.init) system.stats.init.armorBonus = result.initBonus;
        system.move.armorBonus = result.moveBonus;
    }

    /* -------------------------------------------- */
    /* 2. Wounds & Conditions                       */
    /* -------------------------------------------- */
    _calculateWounds(system) {
        // Skip wound calculations for NPCs if disabled
        if (this.type === 'npc' && !game.settings.get('sla-industries', 'enableNPCWoundTracking')) {
            // Set defaults but don't calculate
            if (!system.wounds) system.wounds = {};
            system.wounds.total = 0;
            system.wounds.penalty = 0;
            return;
        }

        // Ensure wounds object exists (should be in schema, but defensive check)
        if (!system.wounds) system.wounds = {};

        // Initialize wound fields if they don't exist (for NPCs that were created before schema update)
        const woundFields = ['head', 'torso', 'lArm', 'rArm', 'lLeg', 'rLeg'];
        for (const field of woundFields) {
            if (system.wounds[field] === undefined) {
                system.wounds[field] = false;
            }
        }

        const w = system.wounds;
        const woundCount = countWounds(w);

        system.wounds.total = woundCount;
        system.wounds.penalty = woundCount;

        // Initialize conditions object if missing
        system.conditions = system.conditions || {};

        // Sync with Foundry Effects (Active Effects)
        const hasEffect = (id) => this.effects.some((e) => e.statuses.has(id));

        system.conditions.bleeding = hasEffect('bleeding');
        system.conditions.burning = hasEffect('burning');
        system.conditions.prone = hasEffect('prone');
        system.conditions.stunned = hasEffect('stunned');
        system.conditions.immobile = hasEffect('immobile');

        let hpBase = 10;
        const speciesItem = this.items.find((i) => i.type === 'species');
        if (speciesItem && speciesItem.system.hp) hpBase = Number(speciesItem.system.hp) || 10;
        const projectedHpMax = Math.max(
            1,
            resolveDerivedHpMax({
                type: this.type,
                hpBase,
                strTotal: system.stats.str?.total || 0,
                hpBonus: system.hp?.bonus || 0,
                storedMax: system.hp?.max
            })
        );
        const hpVal = Number(system.hp?.value) ?? 0;

        const logic = deriveLogicConditions(w, { hpValue: hpVal, woundCount, projectedHpMax });
        system.conditions.dead = logic.dead;
        system.conditions.critical = logic.critical;
        // Stunned is intentionally NOT force-derived from the head wound here: it's the actual
        // Stunned effect (hasEffect above) that must drive display, so a manually-cleared Stunned
        // (rest/drugs/medical intervention) stays cleared while the head wound persists, per the
        // rulebook's wound-vs-condition removal rules. handleWoundEffects() (actor/wound-lifecycle.mjs)
        // is what applies Stunned when the head wound first appears.
        if (logic.immobile) system.conditions.immobile = true;
    }

    /* -------------------------------------------- */
    /* 3. Encumbrance                               */
    /* -------------------------------------------- */
    _calculateEncumbrance(system) {
        let totalWeight = 0;
        let highestPV = 0;

        // FIX: Iterate values(), otherwise Collection yields [id, item] entries
        for (const item of this.items.values()) {
            const d = item.system;

            totalWeight += computeCarriedItemWeight(item);

            // Armor PV
            // For NPCs, since they lack an Equip toggle, we treat ALL armor as equipped.
            // For Characters, we respect the 'equipped' flag.
            const isEquipped = this.type === 'npc' || d.equipped;

            // Shields stack additively on top of body armor's PV (resolved live in the damage
            // pipeline based on the attacking weapon's melee/ranged type) rather than competing
            // in this "highest PV wins" comparison, so they're excluded here.
            if (item.type === 'armor' && isEquipped && !d.isShield) {
                const currentPV = computeArmorPiecePv(d);
                const res = d.resistance;

                if (res) {
                    if (!system.armor.resist) system.armor.resist = { value: 0, max: 0 };
                    system.armor.resist.value = res.value;
                    system.armor.resist.max = res.max;
                }
                if (currentPV > highestPV) highestPV = currentPV;
            }
        }

        // Create encumbrance object if missing (for safety, though we check below)
        // Or better: Only write to it if it exists.

        // ------------------------------------------
        // ENCUMBRANCE LOGIC (Characters Only)
        // ------------------------------------------
        if (system.encumbrance) {
            const strTotal = system.stats.str?.total || 0;
            const enc = computeEncumbranceState(totalWeight, strTotal);
            system.encumbrance.value = enc.value;
            system.encumbrance.max = enc.max;
            system.encumbrance.penalty = enc.penalty;
            system.encumbrance.moveCap = enc.moveCap;

            if (enc.immobile) {
                if (!system.conditions) system.conditions = {};
                system.conditions.immobile = true;
            }
        }

        // ------------------------------------------
        // ARMOR PV LOGIC (Applied to ALL Actors)
        // ------------------------------------------
        if (!system.armor) system.armor = { pv: 0, resist: 0 };

        // 'system.armor.pv' is the database field (Base/Natural PV)
        // We want 'system.armor.total' or effective PV to be used for rolls.
        // However, the sheet displays 'system.armor.pv'.
        // If we overwrite it, we mask the input.

        // FIX: If we are an NPC, we might want to prioritize the calculated value for display
        // IF it exceeds the base value.
        // But if the user types 10, and armor is 8, we want 10.
        // If armor is 12, and user typed 0, we want 12.

        // Let's store the final derived value in 'system.armor.total' (if not present in schema, it's ephemeral)
        // And update the SHEET to display 'system.armor.total' if you want a read-only view,
        // OR keep overwriting 'pv' but understand the DB value is what persists.

        // Current implementation:
        // system.armor.pv = Math.max(system.armor.pv || 0, highestPV);
        // This *should* work if 'system.armor.pv' is 0.

        // Maybe the issue is type coercion?
        system.armor.pv = computeEffectiveArmorPv(system.armor.pv, highestPV);

        // Also ensure derived 'value' property exists if templates use it
        system.armor.value = system.armor.pv;
    }

    /* -------------------------------------------- */
    /* 4. Apply Penalties (Crit / Enc)              */
    /* -------------------------------------------- */
    _applyPenalties(system) {
        const adjusted = applyStatPenalties(system.stats, {
            encumbrancePenalty: system.encumbrance?.penalty || 0,
            critical: Boolean(system.conditions.critical)
        });
        for (const [key, stat] of Object.entries(adjusted)) {
            if (system.stats[key]) system.stats[key].total = stat.total;
        }
    }

    /* -------------------------------------------- */
    /* 5. Derived Stats (HP, Init, Move)            */
    /* -------------------------------------------- */
    _calculateDerived(system) {
        // A. HP Calculation
        let hpBase = 10;
        const speciesItem = this.items.find((i) => i.type === 'species');

        if (speciesItem && speciesItem.system.hp) {
            hpBase = speciesItem.system.hp;
        }

        // HP Max = Base + Final STR + Active Effect bonus (Characters); GM-authored value
        // preserved (plus the same bonus) for NPCs/Threats
        system.hp.max = resolveDerivedHpMax({
            type: this.type,
            hpBase,
            strTotal: system.stats.str?.total || 0,
            hpBonus: system.hp.bonus || 0,
            storedMax: system.hp.max
        });

        // B. Initiative (Character Only)
        if (this.type === 'character') {
            if (system.stats.init) {
                system.stats.init.value = computeInitiativeBonus({
                    dexTotal: system.stats.dex?.total || 0,
                    concTotal: system.stats.conc?.total || 0,
                    armorInitBonus: system.stats.init.armorBonus || 0
                });
            }
        }

        // C. Movement (Character Only)
        if (this.type === 'character') {
            if (!system.move) system.move = { closing: 0, rushing: 0 };

            // Sync string name for display
            if (speciesItem) system.bio.species = speciesItem.name;

            const athletics = this.items.find((i) => i.type === 'skill' && i.name.toLowerCase() === 'athletics');

            const { closing, rushing } = computeMovement({
                speciesClosing: speciesItem?.system.move.closing || 0,
                speciesRushing: speciesItem?.system.move.rushing || 0,
                athleticsRank: athletics?.system.rank || 0,
                armorMoveBonus: system.move.armorBonus,
                critical: system.conditions.critical,
                stunned: system.conditions.stunned,
                encumbranceMoveCap: system.encumbrance.moveCap,
                immobile: system.conditions.immobile,
                dead: system.conditions.dead
            });

            system.move.closing = closing;
            system.move.rushing = rushing;
        }
    }

    /** @override */
    async _preCreate(data, options, user) {
        await super._preCreate(data, options, user);
        this.updateSource({ 'prototypeToken.actorLink': true, 'prototypeToken.disposition': 1 });

        // Add Punch/Kick
        if (this.type === 'character' || this.type === 'npc') {
            const sourceItems = Array.isArray(data?.items) ? foundry.utils.deepClone(data.items) : [];
            const punchKickIndices = sourceItems
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => item?.type === 'weapon' && item?.name === NATURAL_WEAPONS.punchKick.name)
                .map(({ index }) => index);

            // Ensure exactly one Punch/Kick in the source payload:
            // - none -> add default
            // - one  -> leave as-is
            // - many -> keep first, remove the rest
            if (punchKickIndices.length === 0) {
                sourceItems.push(foundry.utils.deepClone(NATURAL_WEAPONS.punchKick));
                this.updateSource({ items: sourceItems });
            } else if (punchKickIndices.length > 1) {
                const firstIndex = punchKickIndices[0];
                const dedupedItems = sourceItems.filter((_, index) => {
                    if (!punchKickIndices.includes(index)) return true;
                    return index === firstIndex;
                });
                this.updateSource({ items: dedupedItems });
            }
        }
    }

    /** @override */
    _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
        super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);

        // Only handle Items on this Actor
        if (collection !== 'items') return;

        // Ensure we only run this once per creation batch (usually singular)
        if (game.user.id !== userId) return;

        for (const doc of documents) {
            if (doc.type === 'species') {
                handleSpeciesAdd(this, doc);
            } else if (doc.type === 'trait') {
                doc.applyItemEffectsToActor(this);
            }
        }
    }

    /** @override */
    _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
        super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);

        // Only handle Items on this Actor
        if (collection !== 'items') return;
        if (game.user.id !== userId) return;

        for (const doc of documents) {
            if (doc.type === 'species') {
                handleSpeciesRemove(this, doc);
            } else if (doc.type === 'trait') {
                doc._removeEffectsByOrigin(this, doc.uuid);
            }
        }
    }

    /** @override */
    async _preUpdate(changed, options, user) {
        await super._preUpdate(changed, options, user);

        // HP floor & ceiling (value edits and max drops that leave stored HP above max)
        if (changed.system?.hp?.value !== undefined) {
            const maxHp = changed.system?.hp?.max ?? this.system.hp.max ?? 0;
            changed.system.hp.value = clampHpValue(changed.system.hp.value, maxHp);
        } else if (changed.system?.hp?.max !== undefined) {
            changed.system.hp.value = clampHpValue(this.system.hp.value, changed.system.hp.max);
        }

        // Luck & Flux Clamping
        if (changed.system?.stats?.luck?.value !== undefined) {
            const max = this.system.stats.luck.max || 0;
            if (changed.system.stats.luck.value > max) changed.system.stats.luck.value = max;
            if (changed.system.stats.luck.value < 0) changed.system.stats.luck.value = 0;
        }
        if (changed.system?.stats?.flux?.value !== undefined) {
            const max = this.system.stats.flux.max || 0;
            if (changed.system.stats.flux.value > max) changed.system.stats.flux.value = max;
            if (changed.system.stats.flux.value < 0) changed.system.stats.flux.value = 0;
        }

        // Armor Resist Bi-Directional Sync (Token Bar -> Item)
        if (changed.system?.armor?.resist?.value !== undefined) {
            // 1. Find the Item responsible (Powered Armor)
            const armorItem = this.items.find(
                (i) => i.type === 'armor' && i.system.equipped && i.system.powered && i.system.resistance.max > 0
            );

            if (armorItem) {
                // 2. Clamp the new value to the Item's Max
                let newVal = changed.system.armor.resist.value;
                const max = armorItem.system.resistance.max;
                if (newVal > max) newVal = max;
                if (newVal < 0) newVal = 0;

                // 3. Update the Item
                await armorItem.update({ 'system.resistance.value': newVal });
            }

            // 4. PREVENT Actor update (since this is a derived value)
            delete changed.system.armor.resist;
        }

        // Species Stat Cap Logic
        if (changed.system?.stats) {
            const speciesItem = this.items.find((i) => i.type === 'species');
            if (speciesItem) {
                const limitData = speciesItem.system.stats;
                for (const [key, updateData] of Object.entries(changed.system.stats)) {
                    if (updateData?.value !== undefined) {
                        const statLimit = limitData[key];
                        if (statLimit && statLimit.max !== undefined) {
                            if (updateData.value > statLimit.max) {
                                updateData.value = statLimit.max;
                                if (typeof ui !== 'undefined')
                                    ui.notifications.warn(`${key.toUpperCase()} capped at ${statLimit.max}`);
                            }
                        }
                    }
                }
            }
        }
    }

    // Ensure rolls use the Calculated Totals
    getRollData() {
        const data = super.getRollData();
        if (data.stats) {
            for (let [k, v] of Object.entries(data.stats)) {
                // If total is missing, fallback to value
                data[k] = v.total !== undefined ? v.total : v.value;
            }
        }
        return data;
    }

    /** @override */
    /**
     * Helper to recursively check if any wound property exists in an object
     */
    _hasWoundProperty(obj, path = '') {
        if (!obj || typeof obj !== 'object') return false;

        const woundProps = ['head', 'torso', 'lArm', 'rArm', 'lLeg', 'rLeg'];
        const currentPath = path ? `${path}.` : '';

        for (const key in obj) {
            const fullPath = `${currentPath}${key}`;

            // Check if this path contains "wounds" and a wound property
            if (fullPath.includes('wounds') && woundProps.includes(key)) {
                return true;
            }

            // Recursively check nested objects
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                if (this._hasWoundProperty(obj[key], fullPath)) {
                    return true;
                }
            }
        }

        return false;
    }

    async _onUpdate(changed, options, userId) {
        try {
            await super._onUpdate(changed, options, userId);
        } catch (error) {
            console.error('SLA Industries | Error in super._onUpdate:', error);
        }

        // Derived max can fall below stored HP (e.g. STR drop); clamp once without looping.
        if (!options.slaHpClamp) {
            const clamped = clampHpValue(this.system.hp?.value, this.system.hp?.max);
            if (clamped !== (Number(this.system.hp?.value) || 0)) {
                await this.update({ 'system.hp.value': clamped }, { slaHpClamp: true });
                return;
            }
        }

        // 1. STOP if the update didn't touch conditions OR wounds.
        // This prevents HP updates or Bio updates from triggering the condition loop.
        const conditionChanges = foundry.utils.getProperty(changed, 'system.conditions');
        const woundChanges = foundry.utils.getProperty(changed, 'system.wounds');

        // A. Handle Manual Condition Toggles (Clicking icons)
        if (conditionChanges) {
            const syncStatus = async (id, isState) => {
                if (isState === undefined) return;
                const hasEffect = this.effects.some((e) => e.statuses.has(id));
                if (isState !== hasEffect) {
                    await this.toggleStatusEffect(id, { active: isState });
                }
            };
            for (const [key, value] of Object.entries(conditionChanges)) {
                await syncStatus(key, value);
            }
            // Bleeding is mandatory while wounded (Frother exception: exactly one wound); undo manual toggles
            await syncBleedingToWounds(this);
        }

        // B. Handle Wound Logic (Head -> Stunned, Legs -> Immobile, Any -> Bleeding)
        // Track exactly which wound fields changed - Foundry uses flat keys like "system.wounds.head"
        const woundFieldNames = ['head', 'torso', 'lArm', 'rArm', 'lLeg', 'rLeg'];
        const changedWoundFields = new Set();

        // Check if woundChanges object exists (nested update)
        if (woundChanges) {
            for (const fieldName of woundFieldNames) {
                if (Object.hasOwn(woundChanges, fieldName)) changedWoundFields.add(fieldName);
            }
        } else {
            // Check for flat path updates (e.g., "system.wounds.head")
            for (const key of Object.keys(changed)) {
                if (key.startsWith('system.wounds.')) {
                    const fieldName = key.replace('system.wounds.', '');
                    if (woundFieldNames.includes(fieldName)) changedWoundFields.add(fieldName);
                }
            }
        }

        if (changedWoundFields.size > 0) {
            await handleWoundEffects(this, changedWoundFields);
        }

        // 2. SEPARATE LOGIC: Critical / dead status vs HP (value or max threshold)
        if (
            foundry.utils.hasProperty(changed, 'system.hp.value') ||
            foundry.utils.hasProperty(changed, 'system.hp.max')
        ) {
            await handleWoundThresholds(this);
        }
    }
}

/** @deprecated Use {@link SlaActor} — legacy boilerplate name kept for macro compatibility. */
export const BoilerplateActor = SlaActor;
