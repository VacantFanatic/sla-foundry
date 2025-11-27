/**
 * Extend the basic Actor document.
 * @extends {Actor}
 */
export class BoilerplateActor extends Actor {

  /** @override */
  prepareDerivedData() {
    const actorData = this;
    const system = actorData.system;
    
    // Call super first
    super.prepareDerivedData();

    // Safety Check
    if (!system.stats || !system.ratings) return;

    // Only calculate for Characters and NPCs
    if (actorData.type === 'character' || actorData.type === 'npc') {
        
        // --- 1. RATINGS POINTS (2-1-0) ---
        const str = Number(system.stats.str?.value) || 0;
        const dex = Number(system.stats.dex?.value) || 0;
        const know = Number(system.stats.know?.value) || 0;
        const conc = Number(system.stats.conc?.value) || 0;
        const cha = Number(system.stats.cha?.value) || 0;
        const cool = Number(system.stats.cool?.value) || 0;

        const rawBody = str + dex;
        const rawBrains = know + conc;
        const rawBravado = cha + cool;

        let rankings = [
            { id: "body", total: rawBody }, 
            { id: "brains", total: rawBrains }, 
            { id: "bravado", total: rawBravado }
        ];
        
        // Sort High to Low
        rankings.sort((a, b) => b.total - a.total);

        // Assign Points
        if (system.ratings[rankings[0].id]) system.ratings[rankings[0].id].value = 2;
        if (system.ratings[rankings[1].id]) system.ratings[rankings[1].id].value = 1;
        if (system.ratings[rankings[2].id]) system.ratings[rankings[2].id].value = 0;

        // --- 2. INITIATIVE ---
        if (system.stats.init) system.stats.init.value = dex + conc;

        // --- 3. ENCUMBRANCE & ARMOR ---
        let totalWeight = 0;
        let totalPV = 0;

        if (actorData.items) {
            for (const item of actorData.items) {
                const itemData = item.system;
                // Weight
                if (itemData?.weight) {
                    totalWeight += (itemData.weight * (itemData.quantity || 1));
                }
                // Armor
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

  /** @override */
  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);
    
    // Check global config safely
    const speciesStats = CONFIG.SLA?.speciesStats; 
    if (!speciesStats) return; 

    // Handle Stat Change (ENFORCE MAX ONLY)
    if (changed.system?.stats) {
        const currentSystem = this.system;
        // Get current species (or the one being changed to)
        const currentSpecies = changed.system?.bio?.species || currentSystem.bio?.species;
        const limitData = speciesStats[currentSpecies];

        if (limitData) {
            for (const [key, updateData] of Object.entries(changed.system.stats)) {
                if (updateData?.value !== undefined) {
                    const statLimit = limitData.stats[key];
                    if (statLimit && updateData.value > statLimit.max) {
                        updateData.value = statLimit.max; // Snap back to max
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