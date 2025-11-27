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
        
        // =======================================================
        // 1. CALCULATE ENCUMBRANCE (FIRST!)
        // =======================================================
        // We do this first because weight penalties affect DEX, 
        // which affects everything else (Initiative, Movement, Body Rating).
        
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

        // Get Raw STR for Max Calculation
        const rawStr = Number(system.stats.str?.value) || 0;
        
        // Set Encumbrance Data
        system.encumbrance.value = Math.round(totalWeight * 10) / 10;
        system.encumbrance.max = Math.max(8, rawStr * 3);
        
        // Calculate "Encumbrance Value" (Free Space)
        // Table: "2 or greater", "1", "0", "-1 or lower"
        const encValue = Math.floor(system.encumbrance.max - system.encumbrance.value);
        
        // Define Penalties
        let dexPenalty = 0;
        let moveCap = null; // null means no cap
        let isImmobile = false;

        if (encValue === 1) {
            dexPenalty = 1;
            moveCap = 1; // "Maximum Rushing speed of 1"
        } else if (encValue === 0) {
            dexPenalty = 2; // "Further -1" (Total -2)
            moveCap = 1;
            // Note: HP Loss/Fatigue is handled manually by GM over time
        } else if (encValue < 0) {
            isImmobile = true; // "Unable to move"
        }

        // Save Armor Total
        if (!system.armor) system.armor = { pv: 0, resist: 0 };
        system.armor.pv = totalPV;


        // =======================================================
        // 2. APPLY STAT MODIFIERS (Wounds, Critical, Encumbrance)
        // =======================================================
        
        // Critical Condition Logic (HP <= 0)
        const isCritical = system.hp.value <= 0;
        const critModPhysical = isCritical ? -2 : 0;
        const critModMental = isCritical ? -1 : 0;

        // Calculate Final Stats
        // We start with Base, then subtract Penalties.
        // We clamp at 0 so stats don't break formulas.
        
        let str = (Number(system.stats.str?.value) || 0) + critModPhysical;
        let dex = (Number(system.stats.dex?.value) || 0) + critModPhysical - dexPenalty; // Apply Encumbrance Here
        let know = Number(system.stats.know?.value) || 0;
        let conc = (Number(system.stats.conc?.value) || 0) + critModMental;
        let cha = Number(system.stats.cha?.value) || 0;
        let cool = (Number(system.stats.cool?.value) || 0) + critModMental;

        // Enforce Minimum 0
        str = Math.max(0, str);
        dex = Math.max(0, dex);
        know = Math.max(0, know);
        conc = Math.max(0, conc);
        cha = Math.max(0, cha);
        cool = Math.max(0, cool);

        // UPDATE THE SYSTEM OBJECT FOR DISPLAY/ROLLS
        // Important: This updates the values used by the sheet and roll buttons!
        system.stats.str.value = str;
        system.stats.dex.value = dex;
        system.stats.know.value = know;
        system.stats.conc.value = conc;
        system.stats.cha.value = cha;
        system.stats.cool.value = cool;


        // =======================================================
        // 3. RATINGS POINTS (Based on Modified Stats)
        // =======================================================
        const rawBody = str + dex;
        const rawBrains = know + conc;
        const rawBravado = cha + cool;

        let rankings = [
            { id: "body", total: rawBody }, 
            { id: "brains", total: rawBrains }, 
            { id: "bravado", total: rawBravado }
        ];
        
        rankings.sort((a, b) => b.total - a.total);

        if (system.ratings[rankings[0].id]) system.ratings[rankings[0].id].value = 2;
        if (system.ratings[rankings[1].id]) system.ratings[rankings[1].id].value = 1;
        if (system.ratings[rankings[2].id]) system.ratings[rankings[2].id].value = 0;


        // =======================================================
        // 4. INITIATIVE (DEX + CONC)
        // =======================================================
        if (system.stats.init) system.stats.init.value = dex + conc;


        // =======================================================
        // 5. MOVEMENT (Based on Species + Athletics + Encumbrance)
        // =======================================================
        const speciesKey = system.bio.species;
        const speciesConfig = CONFIG.SLA?.speciesStats[speciesKey];
        
        let closing = 0;
        let rushing = 0;

        if (speciesConfig && speciesConfig.move) {
            closing = speciesConfig.move.closing;
            rushing = speciesConfig.move.rushing;
        }

        const athletics = actorData.items.find(i => i.type === 'skill' && i.name.toLowerCase() === 'athletics');
        if (athletics) {
            rushing += Math.floor((athletics.system.rank || 0) / 2);
        }

        // Apply Critical Limit (Cannot move faster than closing)
        if (isCritical) {
            rushing = closing;
        }

        // Apply Encumbrance Cap (Rush max 1)
        if (moveCap !== null) {
            rushing = Math.min(rushing, moveCap);
            // Logic check: If rushing is capped at 1, usually Closing is also affected 
            // if Closing was > 1. The rules say "May not run", implying only Closing speed is available,
            // or Rushing is clamped. We clamp Rushing here.
        }

        // Apply Immobile
        if (isImmobile) {
            closing = 0;
            rushing = 0;
        }

        if (!system.move) system.move = { closing: 0, rushing: 0 };
        system.move.closing = closing;
        system.move.rushing = rushing;
    }
  }

  // ... (Rest of file: _preCreate, _preUpdate, getRollData - Keep existing) ...
  
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