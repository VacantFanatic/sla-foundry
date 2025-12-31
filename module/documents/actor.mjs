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
            // Exclude luck and flux as they don't have 'total' properties (only value/max)
            // Store base STR value before penalties for max HP calculation
            const baseSTR = Number(system.stats.str?.value) || 0;
            
            for (const [key, stat] of Object.entries(system.stats)) {
                if (key === 'luck' || key === 'flux') continue; // Skip luck and flux - they don't have totals
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
            // Pass base STR so max HP uses unpenalized STR
            this._calculateDerived(system, baseSTR);
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
        const isDead = system.hp.value <= 0 || woundCount >= 6;
        system.conditions.dead = isDead;

        // Critical condition: HP <= Max/2 AND not dead
        // Use the same logic as _handleWoundThresholds for consistency
        const maxHP = system.hp.max || 10;
        const isCritical = system.hp.value <= (maxHP / 2) && system.hp.value > 0 && !isDead;
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

        // Set the actor's PV from equipped armor
        if (!system.armor) system.armor = {};
        system.armor.pv = highestPV;

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

        // Set PV from equipped armor (highest PV wins)
        // For NPCs, use the higher of base PV or calculated PV
        // For Characters, always use calculated PV from equipped armor
        if (this.type === 'npc') {
            const basePV = Number(system.armor.pv) || 0;
            system.armor.pv = Math.max(basePV, highestPV);
        } else {
            // Characters: Always use calculated PV from equipped armor
            system.armor.pv = highestPV;
        }

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
    _calculateDerived(system, baseSTR = null) {
        // A. HP Calculation
        let hpBase = 10;
        const speciesItem = this.items.find(i => i.type === 'species');

        if (speciesItem && speciesItem.system.hp) {
            hpBase = speciesItem.system.hp;
        }

        // HP Max = Base + Base STR (before penalties)
        // Use baseSTR parameter if provided, otherwise fall back to current value
        // This ensures max HP doesn't decrease when STR is penalized
        const strForHP = baseSTR !== null ? baseSTR : (system.stats.str?.value || 0);
        const newMaxHP = hpBase + strForHP;
        system.hp.max = newMaxHP;
        
        // CRITICAL: Clamp current HP to new max if it exceeds it
        // This prevents HP from being above max when max HP changes
        if (system.hp.value > newMaxHP) {
            system.hp.value = newMaxHP;
        }

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
        // 0. SINGLETON ENFORCEMENT: Check for existing species and delete them
        const existingSpecies = this.items.filter(i => i.type === "species" && i.id !== speciesItem.id);
        if (existingSpecies.length > 0) {
            const deleteIds = existingSpecies.map(i => i.id);
            if (typeof ui !== "undefined") ui.notifications.info(`Replacing existing species...`);
            await this.deleteEmbeddedDocuments("Item", deleteIds);
        }

        const speciesName = speciesItem.name.toLowerCase();
        let weaponToAdd = null;

        // 1. Natural Weapons Logic
        if (speciesName.includes("stormer")) {
            weaponToAdd = NATURAL_WEAPONS.teethClaws;
        } else if (speciesName.includes("neophron")) {
            weaponToAdd = NATURAL_WEAPONS.beak;
        }

        if (weaponToAdd) {
            // Check if it already exists to avoid duplicates
            // We use 'find' but since we just cleared species, we might need to check if we cleared weapons too?
            // Natural Weapons are separate Items. _handleSpeciesRemove handles their deletion.
            // So if we just deleted the old species, its weapons are gone (via _handleSpeciesRemove).
            const exists = this.items.find(i => i.name === weaponToAdd.name);
            if (!exists) {
                await this.createEmbeddedDocuments("Item", [weaponToAdd]);
                if (typeof ui !== "undefined") ui.notifications.info(`Added natural weapon: ${weaponToAdd.name}`);
            }
        }

        // 2. Determine Stats (Prioritize Item Data, Fallback to Defaults if missing)
        const sys = speciesItem.system;
        let luckInit = sys.luck?.initial ?? 0;
        let luckMax = sys.luck?.max ?? 0;
        let fluxInit = sys.flux?.initial ?? 0;
        let fluxMax = sys.flux?.max ?? 0;
        let hpBase = sys.hp ?? 0;
        let moveClosing = sys.move?.closing ?? 0;
        let moveRushing = sys.move?.rushing ?? 0;

        // CHECK: If this looks like an "Unmigrated/Broken" item (all zeros), try to apply known defaults
        const isBlank = (luckMax === 0 && fluxMax === 0 && hpBase <= 10 && moveClosing === 0);

        if (isBlank) {
            console.warn(`SLA Industries | Detected potentially unmigrated Species Item: ${speciesItem.name}. Applying system defaults.`);
            if (speciesName.includes("ebon")) {
                fluxInit = 2; fluxMax = 6;
                hpBase = 14;
                moveClosing = 2; moveRushing = 5;
            } else if (speciesName.includes("human")) {
                luckInit = 1; luckMax = 6;
                hpBase = 14;
                moveClosing = 2; moveRushing = 5;
            } else if (speciesName.includes("frother")) {
                luckInit = 1; luckMax = 3;
                hpBase = 15;
                moveClosing = 2; moveRushing = 5;
            } else if (speciesName.includes("wraithen")) {
                luckInit = 1; luckMax = 4;
                hpBase = 14;
                moveClosing = 4; moveRushing = 8;
            } else if (speciesName.includes("shaktar")) {
                luckInit = 0; luckMax = 3;
                hpBase = 19;
                moveClosing = 3; moveRushing = 6;
            } else if (speciesName.includes("carrien")) { // Advanced Carrien
                luckInit = 0; luckMax = 3;
                hpBase = 20;
                moveClosing = 4; moveRushing = 7;
            } else if (speciesName.includes("neophron")) {
                luckInit = 0; luckMax = 3;
                hpBase = 11;
                moveClosing = 2; moveRushing = 5;
            } else if (speciesName.includes("stormer")) {
                if (speciesName.includes("313") || speciesName.includes("malice")) {
                    luckInit = 0; luckMax = 2;
                    hpBase = 22;
                    moveClosing = 3; moveRushing = 6;
                } else if (speciesName.includes("711") || speciesName.includes("xeno")) {
                    luckInit = 0; luckMax = 2;
                    hpBase = 20;
                    moveClosing = 4; moveRushing = 6;
                } else {
                    luckInit = 0; luckMax = 2;
                    hpBase = 20;
                    moveClosing = 3; moveRushing = 6;
                }
            }
        }

        // Prepare Updates
        const updateData = {};
        const itemUpdateData = {};

        // LUCK
        if (luckMax > 0) {
            updateData["system.stats.luck.value"] = luckInit;
            updateData["system.stats.luck.max"] = luckMax;
            if (isBlank) {
                itemUpdateData["system.luck.initial"] = luckInit;
                itemUpdateData["system.luck.max"] = luckMax;
            }
        }

        // FLUX
        if (fluxMax > 0) {
            updateData["system.stats.flux.value"] = fluxInit;
            updateData["system.stats.flux.max"] = fluxMax;
            if (isBlank) {
                itemUpdateData["system.flux.initial"] = fluxInit;
                itemUpdateData["system.flux.max"] = fluxMax;
            }
        }

        // HP Base
        if (hpBase > 0) {
            // Note: Actor HP is derived in _calculateDerived, so we don't strictly need to set actor.system.hp.max here
            // But we SHOULD ensure the embedded item has the data if it was blank
            if (isBlank) itemUpdateData["system.hp"] = hpBase;
        }

        // MOVEMENT
        if (moveClosing > 0) {
            if (isBlank) {
                itemUpdateData["system.move.closing"] = moveClosing;
                itemUpdateData["system.move.rushing"] = moveRushing;
            }
        }

        // 3. APPLY ACTOR UPDATE
        if (!foundry.utils.isEmpty(updateData)) {
            await this.update(updateData);
        }

        // 4. APPLY ITEM UPDATE (Fix the Item if it was broken)
        if (!foundry.utils.isEmpty(itemUpdateData)) {
            await speciesItem.update(itemUpdateData);
        }
    }

    async _handleSpeciesRemove(speciesItem) {
        const speciesName = speciesItem.name.toLowerCase();

        // 1. Remove Natural Weapons
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

        // 2. CHECK: Are there any other species left?
        // If we found any species that is NOT the one being deleted (although 'this.items' might already lack it)
        // In _onDeleteDescendantDocuments, 'this.items' usually implies the state *after* deletion in memory?
        // Let's rely on finding ANY species. If none, we clean up.
        const remainingSpecies = this.items.find(i => i.type === "species" && i.id !== speciesItem.id);

        if (!remainingSpecies) {
            // 3. Last Species Removed -> RESET STATS
            const updateData = {
                "system.stats.luck.value": 0,
                "system.stats.luck.max": 0,
                "system.stats.flux.value": 0,
                "system.stats.flux.max": 0
                // HP Base is derived from item presence, so no manual reset needed for 'system.hp'?
                // Move is derived from item presence, so no manual reset needed.
            };
            if (typeof ui !== "undefined") ui.notifications.info(`Species removed: Resetting Stats.`);
            await this.update(updateData);
        }
    }

    /** @override */
    async _preUpdate(changed, options, user) {
        await super._preUpdate(changed, options, user);

        // HP Floor & Ceiling
        // IMPORTANT: Calculate max HP first to ensure we have the correct value for clamping
        // Also check if max HP is being updated - if so, clamp current HP to new max
        if (changed.system?.hp?.max !== undefined) {
            // Max HP is being updated - clamp current HP to new max
            const newMaxHP = Number(changed.system.hp.max);
            if (!isNaN(newMaxHP)) {
                const currentHP = changed.system.hp.value !== undefined ? Number(changed.system.hp.value) : this.system.hp.value;
                if (!isNaN(currentHP) && currentHP > newMaxHP) {
                    // Current HP exceeds new max - clamp it
                    changed.system.hp.value = newMaxHP;
                }
            }
        }
        
        if (changed.system?.hp?.value !== undefined) {
            // Always recalculate max HP to ensure it's correct (using base STR, not penalized STR)
            // This ensures we use the current species and STR values
            let hpBase = 10;
            const speciesItem = this.items.find(i => i.type === 'species');
            if (speciesItem && speciesItem.system.hp) {
                hpBase = speciesItem.system.hp;
            }
            // Use base STR value (before penalties) for max HP
            const baseSTR = Number(this.system.stats.str?.value) || 0;
            const maxHp = hpBase + baseSTR;
            
            // Get the new HP value
            let val = changed.system.hp.value;
            
            // Handle different input types
            if (val === '' || val === null || val === undefined) {
                // Empty input - preserve current value, don't reset
                delete changed.system.hp.value;
                // Still update max HP if needed
                if (changed.system.hp.max === undefined && this.system.hp.max !== maxHp) {
                    changed.system.hp.max = maxHp;
                }
                return; // Exit early - don't process empty value
            }
            
            // Convert to number
            val = Number(val);
            
            // If not a valid number, preserve current value (don't reset to 0 or max)
            if (isNaN(val)) {
                // Invalid number - preserve current HP value
                delete changed.system.hp.value;
                // Still update max HP if needed
                if (changed.system.hp.max === undefined && this.system.hp.max !== maxHp) {
                    changed.system.hp.max = maxHp;
                }
                return; // Exit early - don't process invalid value
            }
            
            // Valid number - clamp to valid range
            if (val < 0) val = 0;
            if (val > maxHp) val = maxHp;
            changed.system.hp.value = val;
            
            // Also update max HP if it's different (to keep them in sync)
            if (changed.system.hp.max === undefined && this.system.hp.max !== maxHp) {
                changed.system.hp.max = maxHp;
            }
        }

        // Luck & Flux Clamping
        if (changed.system?.stats?.luck?.value !== undefined) {
            const max = this.system.stats.luck.max || 0;
            let luckValue = changed.system.stats.luck.value;
            
            // Handle empty string - preserve current value instead of resetting to 0
            if (luckValue === "" || luckValue === null || luckValue === undefined) {
                // Preserve the existing value - don't reset to 0
                luckValue = this.system.stats.luck.value;
                // Only update if we have a valid existing value
                if (luckValue !== undefined && luckValue !== null) {
                    changed.system.stats.luck.value = luckValue;
                } else {
                    // If no existing value, allow 0 but don't force it
                    delete changed.system.stats.luck.value;
                }
            } else {
                luckValue = Number(luckValue);
                if (isNaN(luckValue)) {
                    // If not a valid number, preserve current value
                    luckValue = this.system.stats.luck.value || 0;
                }
                if (luckValue > max) luckValue = max;
                if (luckValue < 0) luckValue = 0;
                changed.system.stats.luck.value = luckValue;
            }
        }
        if (changed.system?.stats?.flux?.value !== undefined) {
            const max = this.system.stats.flux.max || 0;
            if (changed.system.stats.flux.value > max) changed.system.stats.flux.value = max;
            if (changed.system.stats.flux.value < 0) changed.system.stats.flux.value = 0;
        }

        // Armor Resist Bi-Directional Sync (Token Bar -> Item)
        if (changed.system?.armor?.resist?.value !== undefined) {
            // 1. Find the Item responsible (Powered Armor)
            const armorItem = this.items.find(i => i.type === 'armor' && i.system.equipped && i.system.powered && i.system.resistance.max > 0);

            if (armorItem) {
                // 2. Clamp the new value to the Item's Max
                let newVal = changed.system.armor.resist.value;
                const max = armorItem.system.resistance.max;
                if (newVal > max) newVal = max;
                if (newVal < 0) newVal = 0;

                // 3. Update the Item
                await armorItem.update({ "system.resistance.value": newVal });
            }

            // 4. PREVENT Actor update (since this is a derived value)
            delete changed.system.armor.resist;
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

        // 0. CRITICAL: Clamp HP to max if max HP changed or if HP exceeds max
        // This ensures HP is always valid after any update
        if (foundry.utils.hasProperty(changed, "system.hp.max") || foundry.utils.hasProperty(changed, "system.hp.value")) {
            // Recalculate derived data to get accurate max HP
            this.prepareDerivedData();
            const maxHP = this.system.hp.max || 0;
            const currentHP = this.system.hp.value || 0;
            
            // If current HP exceeds max, clamp it
            if (currentHP > maxHP && maxHP > 0) {
                await this.update({ "system.hp.value": maxHP }, { render: false, _preserveTab: true });
            }
        }

        // 1. STOP if the update didn't touch conditions OR wounds.
        // This prevents HP updates or Bio updates from triggering the condition loop.
        const conditionChanges = foundry.utils.getProperty(changed, "system.conditions");
        const woundChanges = foundry.utils.getProperty(changed, "system.wounds");

        // A. Handle Manual Condition Toggles (Clicking icons)
        // BUT: Skip if this was triggered by a manual toggle or HP update handling (to prevent duplicates)
        if (conditionChanges && !options._manualToggle && !options._handlingHPUpdate) {
            const syncStatus = async (id, isState) => {
                if (isState === undefined) return;
                // Re-check effects each time to ensure we have the latest state
                // Check for duplicates first
                const effectsWithStatus = this.effects.filter(e => e.statuses.has(id));
                const hasEffect = effectsWithStatus.length > 0;
                
                // Clean up duplicates if found
                if (effectsWithStatus.length > 1) {
                    console.warn(`Found ${effectsWithStatus.length} duplicate effects for ${id} in _onUpdate, cleaning up...`);
                    // Keep the first one, delete the rest
                    for (let i = 1; i < effectsWithStatus.length; i++) {
                        try {
                            await effectsWithStatus[i].delete();
                        } catch (err) {
                            console.warn(`Failed to delete duplicate effect:`, err);
                        }
                    }
                    // After cleanup, re-check the effect state
                    const afterCleanupEffects = this.effects.filter(e => e.statuses.has(id));
                    const afterCleanupHasEffect = afterCleanupEffects.length > 0;
                    // If after cleanup the state matches, don't toggle
                    if (isState === afterCleanupHasEffect) {
                        return; // State already matches after cleanup, no need to toggle
                    }
                }
                
                // CRITICAL: Double-check effect state before toggling to prevent race conditions
                // This prevents duplicate toggles when toggleStatusEffect updates the condition
                // Wait a small delay to ensure any pending toggles complete
                await new Promise(resolve => setTimeout(resolve, 50));
                const finalCheckEffects = this.effects.filter(e => e.statuses.has(id));
                const finalCheckHasEffect = finalCheckEffects.length > 0;
                
                // Only toggle if the state actually doesn't match
                // This prevents duplicate creation when toggleStatusEffect triggers _onUpdate
                if (isState !== finalCheckHasEffect) {
                    // If _preserveTab flag is set, don't render sheets when toggling status effects
                    const renderOptions = options._preserveTab ? { render: false } : {};
                    try {
                        await this.toggleStatusEffect(id, { active: isState, ...renderOptions });
                    } catch (error) {
                        // Handle case where effect doesn't exist (already deleted or never created)
                        const errorMsg = error.message || String(error);
                        if (!errorMsg.includes('does not exist')) {
                            console.warn(`Failed to toggle status effect ${id}:`, error);
                        }
                        // If we're trying to activate but it failed, try creating it directly
                        // But first check if it was created by another process
                        await new Promise(resolve => setTimeout(resolve, 50));
                        const retryCheckEffects = this.effects.filter(e => e.statuses.has(id));
                        const retryCheckHasEffect = retryCheckEffects.length > 0;
                        if (isState && !retryCheckHasEffect) {
                            try {
                                await this.toggleStatusEffect(id, { active: true, ...renderOptions });
                            } catch (err) {
                                const errMsg = err.message || String(err);
                                if (!errMsg.includes('does not exist')) {
                                    console.error(`Failed to create status effect ${id}:`, err);
                                }
                            }
                        }
                    }
                }
            };
            for (const [key, value] of Object.entries(conditionChanges)) {
                await syncStatus(key, value);
            }
        }

        // B. Handle Wound Logic (Head -> Stunned, Legs -> Immobile, Any -> Bleeding)
        if (woundChanges) {
            await this._handleWoundEffects(woundChanges, options);
        }

        // 2. SEPARATE LOGIC: Handle HP Auto-Wounding
        if (foundry.utils.hasProperty(changed, "system.hp.value")) {
            // Recalculate derived data first to ensure max HP is correct
            this.prepareDerivedData();
            // Then handle wound thresholds (critical, dead)
            // Pass _handlingHPUpdate flag to prevent _onUpdate from processing condition changes
            await this._handleWoundThresholds({ _handlingHPUpdate: true });
            // After setting critical condition, recalculate again to apply penalties
            this.prepareDerivedData();
        }
    }

    /**
     * Handle Side-Effects of Wounds (Stunned, Immobile, Bleeding)
     */
    async _handleWoundEffects(woundChanges, options = {}) {
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
        // If _preserveTab flag is set, prevent re-renders when toggling status effects
        // IMPORTANT: Use _manualToggle flag to prevent _onUpdate from processing condition changes
        // This prevents duplicate creation when toggleStatusEffect updates system.conditions
        const renderOptions = options._preserveTab ? { render: false } : {};
        for (const change of effectsToToggle) {
            try {
                // Re-check effect state before toggling to avoid race conditions
                // Find ALL effects with this status to check for duplicates
                const effectsWithStatus = Array.from(this.effects).filter(e => e.statuses.has(change.id));
                const currentHasEffect = effectsWithStatus.length > 0;
                
                // Clean up duplicates first - but check if they still exist before deleting
                if (effectsWithStatus.length > 1) {
                    console.warn(`Found ${effectsWithStatus.length} duplicate effects for ${change.id}, cleaning up...`);
                    // Keep the first one, delete the rest
                    for (let i = 1; i < effectsWithStatus.length; i++) {
                        try {
                            const effectId = effectsWithStatus[i].id;
                            // Check if the effect still exists in the collection before trying to delete it
                            const effectToDelete = this.effects.get(effectId);
                            if (effectToDelete && !effectToDelete.isDeleted) {
                                await effectToDelete.delete();
                            }
                        } catch (err) {
                            // Silently ignore errors if effect was already deleted or doesn't exist
                            // Only log unexpected errors
                            const errorMsg = err.message || String(err);
                            if (!errorMsg.includes('does not exist') && !errorMsg.includes('isDeleted')) {
                                console.warn(`Failed to delete duplicate effect:`, err);
                            }
                        }
                    }
                }
                
                // Re-check after cleanup to get current state
                const finalEffectsWithStatus = Array.from(this.effects).filter(e => e.statuses.has(change.id));
                const finalHasEffect = finalEffectsWithStatus.length > 0;
                
                // Only toggle if the state actually needs to change
                // Note: _calculateWounds() already sets system.conditions in derived data during prepareDerivedData(),
                // so we don't need to manually update it here. toggleStatusEffect() will handle syncing to the database.
                if (change.active !== finalHasEffect) {
                    // Use the value from _calculateWounds() instead of manually updating
                    // toggleStatusEffect will handle updating both the effect and the condition
                    await this.toggleStatusEffect(change.id, { 
                        active: change.active,
                        _manualToggle: true,
                        _preserveTab: true,
                        ...renderOptions 
                    });
                }
            } catch (error) {
                // Handle case where effect doesn't exist (already deleted or never created)
                // Only log if it's not a "does not exist" error
                const errorMsg = error.message || String(error);
                if (!errorMsg.includes('does not exist')) {
                    console.warn(`Failed to toggle wound effect ${change.id}:`, error);
                }
                // If we're trying to activate but it failed, and effect doesn't exist, try creating it
                if (change.active) {
                    const currentHasEffect = Array.from(this.effects).some(e => e.statuses.has(change.id));
                    if (!currentHasEffect) {
                        try {
                            // toggleStatusEffect will handle updating the condition
                            await this.toggleStatusEffect(change.id, { 
                                active: true,
                                _manualToggle: true,
                                ...renderOptions 
                            });
                        } catch (err) {
                            // Only log if it's not a "does not exist" error
                            const errMsg = err.message || String(err);
                            if (!errMsg.includes('does not exist')) {
                                console.error(`Failed to create wound effect ${change.id}:`, err);
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * Separate function to handle HP math logic
     */
    async _handleWoundThresholds(options = {}) {
        // Note: prepareDerivedData() is already called in _onUpdate before this function,
        // so we don't need to call it again here. Using the already-calculated derived data.
        
        // Calculate your thresholds
        const hp = Number(this.system.hp.value) || 0;
        const max = Number(this.system.hp.max) || 10;

        // Helper to check if effect exists
        const hasEffect = (id) => this.effects.some(e => e.statuses.has(id));

        // 1. DEAD (HP <= 0)
        // We apply as overlay for visual emphasis
        const isDead = hp <= 0;
        const hasDeadEffect = hasEffect("dead");
        if (isDead && !hasDeadEffect) {
            try {
                await this.toggleStatusEffect("dead", { 
                    active: true, 
                    overlay: true, 
                    _preserveTab: true,
                    _manualToggle: true // Prevent _onUpdate from processing this
                });
            } catch (error) {
                console.warn("Failed to toggle dead effect:", error);
            }
        } else if (!isDead && hasDeadEffect) {
            try {
                await this.toggleStatusEffect("dead", { 
                    active: false, 
                    _preserveTab: true,
                    _manualToggle: true // Prevent _onUpdate from processing this
                });
            } catch (error) {
                console.warn("Failed to remove dead effect:", error);
            }
        }

        // 2. CRITICAL (HP <= Max/2 AND Not Dead)
        // Note: _calculateWounds() already sets system.conditions.critical in derived data during prepareDerivedData().
        // We use that value directly instead of recalculating to avoid duplication.
        // We only need to sync it to the database and toggle the effect.
        const isCritical = this.system.conditions.critical;
        const hasCriticalEffect = hasEffect("critical");
        
        // Only toggle the effect if the state doesn't match - toggleStatusEffect will handle updating the condition
        if (isCritical !== hasCriticalEffect) {
            try {
                await this.toggleStatusEffect("critical", { 
                    active: isCritical, 
                    _preserveTab: true,
                    _manualToggle: true // Prevent _onUpdate from processing this
                });
            } catch (error) {
                console.warn("Failed to toggle critical effect:", error);
            }
        }
        
        // After updating critical condition, recalculate derived data to apply penalties
        this.prepareDerivedData();
    }
}