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
    if (!system.stats || !system.ratings) return;

    // Only calculate for Characters and NPCs
    if (actorData.type === 'character' || actorData.type === 'npc') {
        
        // 1. RESET TOTALS TO BASE VALUES
        // We must start fresh every update cycle
        for (const [key, stat] of Object.entries(system.stats)) {
            stat.total = Number(stat.value) || 0;
        }

        // 2. APPLY DRUG MODIFIERS
        this._applyDrugModifiers(system);

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

      for (const item of this.items) {
          const d = item.system;
          
          // Weight
          if (d.weight) totalWeight += (d.weight * (d.quantity || 1));

          // Armor PV
          if (item.type === 'armor' && d.equipped) {
              let currentPV = d.pv || 0;
              const res = d.resistance;
              if (res) {
                  if (res.value <= 0) currentPV = 0; 
                  else if (res.value < (res.max / 2)) currentPV = Math.floor(currentPV / 2);
              }
              if (currentPV > highestPV) highestPV = currentPV; 
          }
      }

      system.encumbrance.value = Math.round(totalWeight * 10) / 10;
      
      // Max carry is based on STR (Total)
      // Note: We use the STR calculated in step 1/2 (Base + Drugs)
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
          system.conditions.immobile = true; 
      }

      // Set Armor PV
      if (!system.armor) system.armor = { pv: 0, resist: 0 };
      system.armor.pv = highestPV;
  }

  /* -------------------------------------------- */
  /* 4. Apply Penalties (Crit / Enc)              */
  /* -------------------------------------------- */
  _applyPenalties(system) {
      // A. Encumbrance Penalty (Affects DEX)
      if (system.encumbrance.penalty > 0 && system.stats.dex) {
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
       } else {
           // Fallback to Config if Species item missing but Name exists
           const speciesKey = system.bio.species;
           const speciesConfig = CONFIG.SLA?.speciesStats?.[speciesKey];
           if (speciesConfig) hpBase = speciesConfig.hp;
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
           // Fallback to Config
           else {
                 const speciesKey = system.bio.species;
                 const speciesConfig = CONFIG.SLA?.speciesStats?.[speciesKey];
                 if (speciesConfig?.move) {
                    closing = speciesConfig.move.closing;
                    rushing = speciesConfig.move.rushing;
                 }
           }

           // Athletics Bonus (+1 Rushing per 2 Ranks)
           const athletics = this.items.find(i => i.type === 'skill' && i.name.toLowerCase() === 'athletics');
           if (athletics) {
               rushing += Math.floor((athletics.system.rank || 0) / 2);
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
  async _onUpdate(data, options, userId) {
    super._onUpdate(data, options, userId);
    
    // Sync Token Status Icons
    // Ensure CONFIG is ready to avoid crashes
    const hasCriticalConfig = CONFIG.statusEffects && CONFIG.statusEffects.some(e => e.id === "critical");
    
    if (hasCriticalConfig) {
        const syncStatus = async (id, isState) => {
             const hasEffect = this.effects.some(e => e.statuses.has(id));
             if (isState !== hasEffect) await this.toggleStatusEffect(id, { active: isState });
        };

        await syncStatus("critical", this.system.conditions?.critical);
        await syncStatus("prone", this.system.conditions?.prone);
        await syncStatus("stunned", this.system.conditions?.stunned);
        await syncStatus("bleeding", this.system.conditions?.bleeding);
        await syncStatus("burning", this.system.conditions?.burning);
        await syncStatus("immobile", this.system.conditions?.immobile);
    }
  }
}