/**
 * Extend the basic Actor document.
 * @extends {Actor}
 */
export class BoilerplateActor extends Actor {

  /** @override */
  prepareDerivedData() {
    const actorData = this;
    const system = actorData.system;
    
    super.prepareDerivedData();

    // Safety Check
    if (!system.stats || !system.ratings) return;

    if (actorData.type === 'character' || actorData.type === 'npc') {
        
        // --- 1. APPLY DRUG MODIFIERS (Before everything else!) ---
        let strMod = 0, dexMod = 0, knowMod = 0, concMod = 0, chaMod = 0, coolMod = 0;
        let damageReduction = 0;

        if (actorData.items) {
            for (const item of actorData.items) {
                if (item.type === 'drug' && item.system.active) {
                    // Apply Mod 1
                    const m1 = item.system.mods.first;
                    if (m1.value !== 0) {
                        if (m1.stat === 'str') strMod += m1.value;
                        if (m1.stat === 'dex') dexMod += m1.value;
                        if (m1.stat === 'know') knowMod += m1.value;
                        if (m1.stat === 'conc') concMod += m1.value;
                        if (m1.stat === 'cha') chaMod += m1.value;
                        if (m1.stat === 'cool') coolMod += m1.value;
                    }
                    // Apply Mod 2
                    const m2 = item.system.mods.second;
                    if (m2.value !== 0) {
                        if (m2.stat === 'str') strMod += m2.value;
                        if (m2.stat === 'dex') dexMod += m2.value;
                        if (m2.stat === 'know') knowMod += m2.value;
                        if (m2.stat === 'conc') concMod += m2.value;
                        if (m2.stat === 'cha') chaMod += m2.value;
                        if (m2.stat === 'cool') coolMod += m2.value;
                    }
                    // Apply Damage Reduction (Like 'Rush')
                    damageReduction += (item.system.damageReduction || 0);
                }
            }
        }
        
        // Store Damage Reduction for Chat use
        system.wounds.damageReduction = damageReduction;

        // --- 2. CALCULATE STATS (Base + Critical + Drugs) ---
        const isCritical = system.hp.value <= 0;
        const critModPhysical = isCritical ? -2 : 0;
        const critModMental = isCritical ? -1 : 0;

        // Base + Crit + Drug
        const str = Math.max(0, (Number(system.stats.str?.value) || 0) + critModPhysical + strMod);
        const dex = Math.max(0, (Number(system.stats.dex?.value) || 0) + critModPhysical + dexMod);
        const know = Math.max(0, (Number(system.stats.know?.value) || 0) + knowMod);
        const conc = Math.max(0, (Number(system.stats.conc?.value) || 0) + critModMental + concMod);
        const cha = Math.max(0, (Number(system.stats.cha?.value) || 0) + chaMod);
        const cool = Math.max(0, (Number(system.stats.cool?.value) || 0) + critModMental + coolMod);
        
        // IMPORTANT: We do NOT write these back to system.stats.str.value to avoid database loops.
        // Instead, we use these local variables for the derived calculations below.
        // However, for ROLLS to see them, we temporarily override them in memory.
        
        system.stats.str.total = str; // Use .total for display/rolls if you update templates
        // For simplicity in this setup, we overwrite value in memory (not DB)
        system.stats.str.value = str;
        system.stats.dex.value = dex;
        system.stats.know.value = know;
        system.stats.conc.value = conc;
        system.stats.cha.value = cha;
        system.stats.cool.value = cool;

        // --- 3. RATINGS POINTS (2-1-0) ---
        const rawBody = str + dex;
        const rawBrains = know + conc;
        const rawBravado = cha + cool;

        let rankings = [{ id: "body", total: rawBody }, { id: "brains", total: rawBrains }, { id: "bravado", total: rawBravado }];
        rankings.sort((a, b) => b.total - a.total);

        if (system.ratings[rankings[0].id]) system.ratings[rankings[0].id].value = 2;
        if (system.ratings[rankings[1].id]) system.ratings[rankings[1].id].value = 1;
        if (system.ratings[rankings[2].id]) system.ratings[rankings[2].id].value = 0;

        // --- 4. INITIATIVE ---
        if (system.stats.init) system.stats.init.value = dex + conc;

        // --- 5. ENCUMBRANCE & ARMOR ---
        let totalWeight = 0;
        let totalPV = 0;

        if (actorData.items) {
            for (const item of actorData.items) {
                const itemData = item.system;
                if (itemData?.weight) {
                    totalWeight += (itemData.weight * (itemData.quantity || 1));
                }
                if (item.type === 'armor' && itemData?.equipped) {
                    totalPV += (itemData.pv || 0);
                }
            }
        }
        
        if (system.encumbrance) {
            system.encumbrance.value = Math.round(totalWeight * 10) / 10;
            system.encumbrance.max = Math.max(8, str * 3);
        }
        
        if (!system.armor) system.armor = { pv: 0, resist: 0 };
        system.armor.pv = totalPV;
    }
  }

  // ... (Keep _preUpdate and _preCreate same as before) ...
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);
    this.updateSource({ "prototypeToken.actorLink": true, "prototypeToken.disposition": 1 });
  }

  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);
    const speciesStats = CONFIG.SLA?.speciesStats; 
    if (!speciesStats) return; 

    if (changed.system?.stats) {
        const currentSystem = this.system;
        const currentSpecies = changed.system?.bio?.species || currentSystem.bio?.species;
        const limitData = speciesStats[currentSpecies];
        if (limitData) {
            for (const [key, updateData] of Object.entries(changed.system.stats)) {
                if (updateData?.value !== undefined) {
                    const statLimit = limitData.stats[key];
                    if (statLimit && updateData.value > statLimit.max) {
                        updateData.value = statLimit.max;
                        if (typeof ui !== "undefined") ui.notifications.warn(`${key.toUpperCase()} capped at ${statLimit.max}`);
                    }
                }
            }
        }
    }
  }
  
  getRollData() {
    const data = super.getRollData();
    if (data.stats) {
      for (let [k, v] of Object.entries(data.stats)) {
        data[k] = v.value;
      }
    }
    return data;
  }
}