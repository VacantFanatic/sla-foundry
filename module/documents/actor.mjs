import { NATURAL_WEAPONS } from "../data/natural-weapons.mjs";

/**
 * Extend the basic Actor document.
 * @extends {Actor}
 */
export class BoilerplateActor extends Actor {

    /** @override */
    prepareDerivedData() {
        super.prepareDerivedData();

        const actorData = this;
        const system = actorData.system;

        // Safety check
        if (!system.stats) return;

        // Only calculate for Characters and NPCs
        if (actorData.type === 'character' || actorData.type === 'npc') {

            // 1. RESET TOTALS TO BASE VALUES
            // We must start fresh every update cycle
            for (const [key, stat] of Object.entries(system.stats)) {
                stat.total = Number(stat.value) || 0;
            }

            // 2. APPLY DRUG MODIFIERS
            this._applyDrugModifiers(system);

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
    /* 1. Drugs                                     */
    /* -------------------------------------------- */
    _applyDrugModifiers(system) {
        let damageReduction = 0;

        // Use 'this.items' to ensure we get the collection
        const drugs = this.items.filter(i => i.type === 'drug' && i.system.active);

        for (const drug of drugs) {
            const m1 = drug.system.mods.first;
            const m2 = drug.system.mods.second;
            const apply = (mod) => {
                if (mod.stat && system.stats[mod.stat]) {
                    system.stats[mod.stat].total += (mod.value || 0);
                }
            };

            if (m1 && m1.value !== 0) apply(m1);
            if (m2 && m2.value !== 0) apply(m2);

            damageReduction += (drug.system.damageReduction || 0);
        }
        system.wounds.damageReduction = damageReduction;
    }

    /* -------------------------------------------- */
    /* 2B. Armor Modifiers                          */
    /* -------------------------------------------- */
    _applyArmorModifiers(system) {
        if (!system.stats) return;

        // Filter for Equipped, Powered Armor that is NOT broken
        const armors = this.items.filter(i =>
            i.type === 'armor' &&
            i.system.equipped &&
            i.system.powered &&
            (i.system.resistance?.value > 0)
        );

        // Initialize Move Bonus if not present
        if (!system.move) system.move = { closing: 0, rushing: 0 };
        system.move.armorBonus = { closing: 0, rushing: 0 };

        for (const armor of armors) {
            const mods = armor.system.mods;
            if (!mods) continue;

            // Apply Stats (STR, DEX)
            if (mods.str && system.stats.str) system.stats.str.total += mods.str;
            if (mods.dex && system.stats.dex) system.stats.dex.total += mods.dex;

            // Accumulate Move Bonuses (Applied in _calculateDerived)
            if (mods.move) {
                system.move.armorBonus.closing += (mods.move.closing || 0);
                system.move.armorBonus.rushing += (mods.move.rushing || 0);
            }
        }
    }

    /* -------------------------------------------- */
    /* 2. Wounds & Conditions                       */
    /* -------------------------------------------- */
    _calculateWounds(system) {
        let woundCount = 0;
        const w = system.wounds;
        if (w.head) woundCount++;
        if (w.torso) woundCount++;
        if (w.lArm) woundCount++;
        if (w.rArm) woundCount++;
        if (w.lLeg) woundCount++;
        if (w.rLeg) woundCount++;

        system.wounds.total = woundCount;
        system.wounds.penalty = woundCount;

        // Initialize conditions object if missing
        system.conditions = system.conditions || {};

        // Sync with Foundry Effects (Active Effects)
        const hasEffect = (id) => this.effects.some(e => e.statuses.has(id));

        system.conditions.bleeding = hasEffect("bleeding");
        system.conditions.burning = hasEffect("burning");
        system.conditions.prone = hasEffect("prone");
        system.conditions.stunned = hasEffect("stunned");
        system.conditions.immobile = hasEffect("immobile");

        // Logic-based Conditions
        const isDead = system.hp.value === 0 || woundCount >= 6;
        system.conditions.dead = isDead;

        const isCritical = system.hp.value < 6 && !isDead;
        system.conditions.critical = isCritical;

        // Wounds forcing conditions
        if (w.head) system.conditions.stunned = true;
        if (w.lLeg && w.rLeg) system.conditions.immobile = true;
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

            // Weight
            let itemWeight = d.weight || 0;

            // POWERED ARMOR DEAD WEIGHT RULE:
            // If Powered Armor is destroyed (Res <= 0), Weight becomes 6
            if (item.type === 'armor' && d.powered) {
                const currentRes = d.resistance?.value || 0;
                if (currentRes <= 0) {
                    itemWeight = 6;
                }
            }

            totalWeight += (itemWeight * (d.quantity || 1));

            // Armor PV
            // For NPCs, since they lack an Equip toggle, we treat ALL armor as equipped.
            // For Characters, we respect the 'equipped' flag.
            const isEquipped = (this.type === 'npc') || d.equipped;

            if (item.type === 'armor' && isEquipped) {
                let currentPV = d.pv || 0;
                const res = d.resistance;

                if (res) {
                    if (res.value <= 0) currentPV = 0;
                    else if (res.value < (res.max / 2)) currentPV = Math.floor(currentPV / 2);

                    // Populate System Resistance (Bar Attributes)
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
            system.encumbrance.value = Math.round(totalWeight * 10) / 10;

            // Max carry is based on STR (Total)
            const strTotal = system.stats.str?.total || 0;
            system.encumbrance.max = Math.max(8, strTotal * 3);

            const encDiff = Math.floor(system.encumbrance.max - system.encumbrance.value);

            // Store penalty data for the next step
            system.encumbrance.penalty = 0;
            system.encumbrance.moveCap = null;

            if (encDiff === 1) {
                system.encumbrance.penalty = 1;
                system.encumbrance.moveCap = 1;
            }
            else if (encDiff === 0) {
                system.encumbrance.penalty = 2;
                system.encumbrance.moveCap = 1;
            }
            else if (encDiff < 0) {
                // Ensure conditions object exists
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
        const basePV = Number(system.armor.pv) || 0;

        system.armor.pv = Math.max(basePV, highestPV);

        // Also ensure derived 'value' property exists if templates use it
        system.armor.value = system.armor.pv;
    }

    /* -------------------------------------------- */
    /* 4. Apply Penalties (Crit / Enc)              */
    /* -------------------------------------------- */
    _applyPenalties(system) {
        // A. Encumbrance Penalty (Affects DEX)
        if (system.encumbrance?.penalty > 0 && system.stats.dex) {
            system.stats.dex.total = Math.max(0, system.stats.dex.total - system.encumbrance.penalty);
        }

        // B. Critical Condition (-2 STR, -2 DEX, -1 CONC, -1 COOL)
        if (system.conditions.critical) {
            if (system.stats.str) system.stats.str.total = Math.max(0, system.stats.str.total - 2);
            if (system.stats.dex) system.stats.dex.total = Math.max(0, system.stats.dex.total - 2);
            if (system.stats.conc) system.stats.conc.total = Math.max(0, system.stats.conc.total - 1);
            if (system.stats.cool) system.stats.cool.total = Math.max(0, system.stats.cool.total - 1);
        }
    }

    /* -------------------------------------------- */
    /* 5. Derived Stats (HP, Init, Move)            */
    /* -------------------------------------------- */
    _calculateDerived(system) {
        // A. HP Calculation
        let hpBase = 10;
        const speciesItem = this.items.find(i => i.type === 'species');

        if (speciesItem && speciesItem.system.hp) {
            hpBase = speciesItem.system.hp;
        }

        // HP Max = Base + Final STR
        system.hp.max = hpBase + (system.stats.str?.total || 0);

        // B. Initiative (Character Only)
        if (this.type === 'character') {
            if (system.stats.init) {
                system.stats.init.value = (system.stats.dex?.total || 0) + (system.stats.conc?.total || 0);
            }
        }

        // C. Movement (Character Only)
        if (this.type === 'character') {
            if (!system.move) system.move = { closing: 0, rushing: 0 };

            let closing = 0;
            let rushing = 0;

            // Get Base Move from Species Item
            if (speciesItem) {
                closing = speciesItem.system.move.closing;
                rushing = speciesItem.system.move.rushing;
                // Sync string name for display
                system.bio.species = speciesItem.name;
            }


            // Athletics Bonus (+1 Rushing per 2 Ranks)
            const athletics = this.items.find(i => i.type === 'skill' && i.name.toLowerCase() === 'athletics');
            if (athletics) {
                rushing += Math.floor((athletics.system.rank || 0) / 2);
            }

            // Apply Armor Bonuses (Calculated in Step 2B)
            if (system.move.armorBonus) {
                closing += system.move.armorBonus.closing;
                rushing += system.move.armorBonus.rushing;
            }

            // 1. Critical Cap (Rushing cannot exceed Closing)
            if (system.conditions.critical) {
                if (rushing > closing) rushing = closing;
            }

            // 2. Encumbrance Cap (Sets Rushing to 1 if Overburdened)
            if (system.encumbrance.moveCap !== null) {
                rushing = Math.min(rushing, system.encumbrance.moveCap);
            }

            // 3. Immobile / Dead (Zero Movement)
            if (system.conditions.immobile || system.conditions.dead) {
                closing = 0; rushing = 0;
            }

            system.move.closing = closing;
            system.move.rushing = rushing;
        }
    }

    /** @override */
    async _preCreate(data, options, user) {
        await super._preCreate(data, options, user);
        this.updateSource({ "prototypeToken.actorLink": true, "prototypeToken.disposition": 1 });

        // Add Punch/Kick
        if (this.type === 'character' || this.type === 'npc') {
            const punchKick = foundry.utils.deepClone(NATURAL_WEAPONS.punchKick);
            this.updateSource({ items: [punchKick] });
        }
    }

    /** @override */
    _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
        super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);

        // Only handle Items on this Actor
        if (collection !== "items") return;

        // Ensure we only run this once per creation batch (usually singular)
        if (game.user.id !== userId) return;

        for (const doc of documents) {
            if (doc.type === "species") {
                this._handleSpeciesAdd(doc);
            }
        }
    }

    /** @override */
    _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
        super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);

        // Only handle Items on this Actor
        if (collection !== "items") return;
        if (game.user.id !== userId) return;

        for (const doc of documents) {
            if (doc.type === "species") {
                this._handleSpeciesRemove(doc);
            }
        }
    }

    async _handleSpeciesAdd(speciesItem) {
        const speciesName = speciesItem.name.toLowerCase();
        let weaponToAdd = null;

        if (speciesName.includes("stormer")) {
            weaponToAdd = NATURAL_WEAPONS.teethClaws;
        } else if (speciesName.includes("neophron")) {
            weaponToAdd = NATURAL_WEAPONS.beak;
        }

        if (weaponToAdd) {
            // Check if it already exists to avoid duplicates
            const exists = this.items.find(i => i.name === weaponToAdd.name);
            if (!exists) {
                await this.createEmbeddedDocuments("Item", [weaponToAdd]);
                if (typeof ui !== "undefined") ui.notifications.info(`Added natural weapon: ${weaponToAdd.name}`);
            }
        }
    }

    async _handleSpeciesRemove(speciesItem) {
        const speciesName = speciesItem.name.toLowerCase();
        let weaponToRemoveName = null;

        if (speciesName.includes("stormer")) {
            weaponToRemoveName = NATURAL_WEAPONS.teethClaws.name;
        } else if (speciesName.includes("neophron")) {
            weaponToRemoveName = NATURAL_WEAPONS.beak.name;
        }

        if (weaponToRemoveName) {
            const weapon = this.items.find(i => i.name === weaponToRemoveName);
            if (weapon) {
                await weapon.delete();
                if (typeof ui !== "undefined") ui.notifications.info(`Removed natural weapon: ${weaponToRemoveName}`);
            }
        }
    }

    /** @override */
    async _preUpdate(changed, options, user) {
        await super._preUpdate(changed, options, user);

        // HP Floor
        if (changed.system?.hp?.value !== undefined) {
            if (changed.system.hp.value < 0) changed.system.hp.value = 0;
        }

        // Species Stat Cap Logic
        if (changed.system?.stats) {
            const speciesItem = this.items.find(i => i.type === 'species');
            if (speciesItem) {
                const limitData = speciesItem.system.stats;
                for (const [key, updateData] of Object.entries(changed.system.stats)) {
                    if (updateData?.value !== undefined) {
                        const statLimit = limitData[key];
                        if (statLimit && statLimit.max !== undefined) {
                            if (updateData.value > statLimit.max) {
                                updateData.value = statLimit.max;
                                if (typeof ui !== "undefined") ui.notifications.warn(`${key.toUpperCase()} capped at ${statLimit.max}`);
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
                data[k] = (v.total !== undefined) ? v.total : v.value;
            }
        }
        return data;
    }

    /** @override */
    async _onUpdate(changed, options, userId) {
        super._onUpdate(changed, options, userId);

        // 1. STOP if the update didn't touch conditions OR wounds.
        // This prevents HP updates or Bio updates from triggering the condition loop.
        const conditionChanges = foundry.utils.getProperty(changed, "system.conditions");
        const woundChanges = foundry.utils.getProperty(changed, "system.wounds");

        // A. Handle Manual Condition Toggles (Clicking icons)
        if (conditionChanges) {
            const syncStatus = async (id, isState) => {
                if (isState === undefined) return;
                const hasEffect = this.effects.some(e => e.statuses.has(id));
                if (isState !== hasEffect) {
                    await this.toggleStatusEffect(id, { active: isState });
                }
            };
            for (const [key, value] of Object.entries(conditionChanges)) {
                await syncStatus(key, value);
            }
        }

        // B. Handle Wound Logic (Head -> Stunned, Legs -> Immobile, Any -> Bleeding)
        if (woundChanges) {
            await this._handleWoundEffects(woundChanges);
        }

        // 2. SEPARATE LOGIC: Handle HP Auto-Wounding
        if (foundry.utils.hasProperty(changed, "system.hp.value")) {
            await this._handleWoundThresholds();
        }
    }

    /**
     * Handle Side-Effects of Wounds (Stunned, Immobile, Bleeding)
     */
    async _handleWoundEffects(woundChanges) {
        // We need the *full* current state of wounds, merging the update with existing data
        // However, 'this.system.wounds' is already updated in memory by the time _onUpdate fires? 
        // ACTUALLY: In _onUpdate, 'this.system' IS already updated to the new state.
        // 'changed' only contains the diff.

        const w = this.system.wounds;
        const effectsToToggle = [];

        // Helper to check if effect exists
        const hasEffect = (id) => this.effects.some(e => e.statuses.has(id));

        // 1. HEAD WOUND -> STUNNED
        // If head is wounded and we are not stunned, ADD Stunned
        if (w.head && !hasEffect("stunned")) {
            // We only add it. We don't remove it auto-magically if healed, 
            // unless the user specifically wants that. 
            // Rule: "Stunned is removed with medical intervention... or rest"
            // So it's safer to Auto-Add, but maybe Auto-Remove is convenient?
            // Let's do Auto-Add and Auto-Remove for immediate feedback, 
            // but allow manual toggle back if needed.
            effectsToToggle.push({ id: "stunned", active: true });
        }
        else if (!w.head && hasEffect("stunned")) {
            // Only remove if it was the head wound causing it? 
            // Hard to know. But typically if you heal the head, the stun might fade.
            // Let's be aggressive for UX: Remove it.
            effectsToToggle.push({ id: "stunned", active: false });
        }

        // 2. BOT LEG WOUNDS -> IMMOBILE
        const legsGone = w.lLeg && w.rLeg;
        if (legsGone && !hasEffect("immobile")) {
            effectsToToggle.push({ id: "immobile", active: true });
        }
        else if (!legsGone && hasEffect("immobile")) {
            // Check if immobile was caused by something else (Encumbrance)?
            // If Encumbrance is forcing immobile, we shouldn't remove it.
            // We can check encumbrance state.
            const isEncumbered = this.system.conditions.immobile && (this.system.encumbrance.value > this.system.encumbrance.max);

            // Only remove if NOT encumbered
            if (!isEncumbered) {
                effectsToToggle.push({ id: "immobile", active: false });
            }
        }

        // 3. ANY WOUND -> BLEEDING
        const woundCount = (w.head ? 1 : 0) + (w.torso ? 1 : 0) + (w.lArm ? 1 : 0) + (w.rArm ? 1 : 0) + (w.lLeg ? 1 : 0) + (w.rLeg ? 1 : 0);

        if (woundCount > 0 && !hasEffect("bleeding")) {
            effectsToToggle.push({ id: "bleeding", active: true });
        }
        else if (woundCount === 0 && hasEffect("bleeding")) {
            effectsToToggle.push({ id: "bleeding", active: false });
        }

        // EXECUTE UPDATES
        // processing sequentially to avoid race conditions
        for (const change of effectsToToggle) {
            await this.toggleStatusEffect(change.id, { active: change.active });
        }
    }

    /**
     * Separate function to handle HP math logic
     */
    async _handleWoundThresholds() {
        // Calculate your thresholds
        const hp = this.system.hp.value;
        const max = this.system.hp.max;

        // Helper to check if effect exists
        const hasEffect = (id) => this.effects.some(e => e.statuses.has(id));

        // 1. DEAD (HP <= 0)
        // We apply as overlay for visual emphasis
        const isDead = hp <= 0;
        if (isDead && !hasEffect("dead")) {
            await this.toggleStatusEffect("dead", { active: true, overlay: true });
        } else if (!isDead && hasEffect("dead")) {
            await this.toggleStatusEffect("dead", { active: false });
        }

        // 2. CRITICAL (HP <= Max/2 AND Not Dead)
        // Note: We use the Effect ID (e.g., 'critical') not the boolean
        const isCritical = hp <= (max / 2) && hp > 0;

        if (isCritical && !hasEffect("critical")) {
            await this.toggleStatusEffect("critical", { active: true });
        } else if (!isCritical && hasEffect("critical")) {
            await this.toggleStatusEffect("critical", { active: false });
        }
    }
}