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

    // Safety Check: Ensure stats exist before calculating
    if (!system.stats || !system.ratings) return;

    if (actorData.type === 'character' || actorData.type === 'npc') {
        
        // =======================================================
        // 1. WOUNDS & CONDITIONS LOGIC
        // =======================================================
        let woundCount = 0;
        const w = system.wounds;
        if (w.head) woundCount++;
        if (w.torso) woundCount++;
        if (w.lArm) woundCount++;
        if (w.rArm) woundCount++;
        if (w.lLeg) woundCount++;
        if (w.rLeg) woundCount++;

        system.wounds.total = woundCount;
        system.wounds.penalty = woundCount; // -1 Penalty per wound

        // Initialize conditions object if missing
        system.conditions = system.conditions || {};

        // RULE: Death (6 Wounds or 0 HP)
        const isDead = system.hp.value === 0 || woundCount >= 6;
        system.conditions.dead = isDead;

        // RULE: Critical (HP < 6, but not Dead)
        const isCritical = system.hp.value < 6 && !isDead;
        system.conditions.critical = isCritical;

        // RULE: Bleeding (At least 1 Wound)
        // Frother Exception handled in display logic or manual toggle
        
        // RULE: Stunned (Head Wound)
        if (w.head) system.conditions.stunned = true;

        // RULE: Immobile (Both Legs Wounded)
        if (w.lLeg && w.rLeg) system.conditions.immobile = true;


        // =======================================================
        // 2. ENCUMBRANCE & ARMOR (Pre-Calc for Dex Penalty)
        // =======================================================
        let totalWeight = 0;
        let highestPV = 0; // Armor Stacking Rule: Highest PV applies

        if (actorData.items) {
            for (const item of actorData.items) {
                const itemData = item.system;
                // Weight
                if (itemData?.weight) {
                    totalWeight += (itemData.weight * (itemData.quantity || 1));
                }

                // Armor PV Calculation
                if (item.type === 'armor' && itemData?.equipped) {
                    let currentPV = itemData.pv || 0;
                    const res = itemData.resistance;

                    // Degradation Rules
                    if (res) {
                        if (res.value <= 0) {
                            currentPV = 0; // Destroyed
                        } else if (res.value < (res.max / 2)) {
                            currentPV = Math.floor(currentPV / 2); // Damaged (<50%)
                        }
                    }
                    // Apply Highest PV Rule
                    if (currentPV > highestPV) highestPV = currentPV; 
                }
            }
        }

        // Get Raw STR for Max Calc
        const rawStr = Number(system.stats.str?.value) || 0;
        
        system.encumbrance.value = Math.round(totalWeight * 10) / 10;
        system.encumbrance.max = Math.max(8, rawStr * 3);
        
        // Save Final Armor
        if (!system.armor) system.armor = { pv: 0, resist: 0 };
        system.armor.pv = highestPV;

        // Encumbrance Penalties
        const encValue = Math.floor(system.encumbrance.max - system.encumbrance.value);
        let encDexPenalty = 0;
        let moveCap = null;

        if (encValue === 1) {
            encDexPenalty = 1;
            moveCap = 1; 
        } else if (encValue === 0) {
            encDexPenalty = 2; 
            moveCap = 1;
        } else if (encValue < 0) {
            system.conditions.immobile = true;
        }


        // =======================================================
        // 3. APPLY STAT MODIFIERS (Base + Drugs + Crit + Encumbrance)
        // =======================================================
        let strMod = 0, dexMod = 0, knowMod = 0, concMod = 0, chaMod = 0, coolMod = 0;
        let damageReduction = 0;

        // Drugs Logic
        if (actorData.items) {
            for (const item of actorData.items) {
                if (item.type === 'drug' && item.system.active) {
                    const m1 = item.system.mods.first;
                    if (m1.value !== 0 && m1.stat) {
                        if (m1.stat === 'str') strMod += m1.value;
                        if (m1.stat === 'dex') dexMod += m1.value;
                        if (m1.stat === 'know') knowMod += m1.value;
                        if (m1.stat === 'conc') concMod += m1.value;
                        if (m1.stat === 'cha') chaMod += m1.value;
                        if (m1.stat === 'cool') coolMod += m1.value;
                    }
                    const m2 = item.system.mods.second;
                    if (m2.value !== 0 && m2.stat) {
                        if (m2.stat === 'str') strMod += m2.value;
                        if (m2.stat === 'dex') dexMod += m2.value;
                        if (m2.stat === 'know') knowMod += m2.value;
                        if (m2.stat === 'conc') concMod += m2.value;
                        if (m2.stat === 'cha') chaMod += m2.value;
                        if (m2.stat === 'cool') coolMod += m2.value;
                    }
                    damageReduction += (item.system.damageReduction || 0);
                }
            }
        }
        system.wounds.damageReduction = damageReduction;

        // Critical Penalties
        const critModPhysical = isCritical ? -2 : 0;
        const critModMental = isCritical ? -1 : 0;

        // Final Calculation (Base + Crit + Drug + Encumbrance)
        // Clamp at 0 to prevent negatives
        let str = Math.max(0, (Number(system.stats.str?.value) || 0) + critModPhysical + strMod);
        let dex = Math.max(0, (Number(system.stats.dex?.value) || 0) + critModPhysical + dexMod - encDexPenalty);
        let know = Math.max(0, (Number(system.stats.know?.value) || 0) + knowMod);
        let conc = Math.max(0, (Number(system.stats.conc?.value) || 0) + critModMental + concMod);
        let cha = Math.max(0, (Number(system.stats.cha?.value) || 0) + chaMod);
        let cool = Math.max(0, (Number(system.stats.cool?.value) || 0) + critModMental + coolMod);

        // Update system values for display/rolls (In-Memory Only)
        system.stats.str.value = str;
        system.stats.dex.value = dex;
        system.stats.know.value = know;
        system.stats.conc.value = conc;
        system.stats.cha.value = cha;
        system.stats.cool.value = cool;


        // =======================================================
        // 4. RATINGS POINTS (2-1-0 Sort)
        // =======================================================
        const rawBody = str + dex;
        const rawBrains = know + conc;
        const rawBravado = cha + cool;

        let rankings = [{ id: "body", total: rawBody }, { id: "brains", total: rawBrains }, { id: "bravado", total: rawBravado }];
        rankings.sort((a, b) => b.total - a.total);

        if (system.ratings[rankings[0].id]) system.ratings[rankings[0].id].value = 2;
        if (system.ratings[rankings[1].id]) system.ratings[rankings[1].id].value = 1;
        if (system.ratings[rankings[2].id]) system.ratings[rankings[2].id].value = 0;


        // =======================================================
        // 5. INITIATIVE & MOVEMENT & HP
        // =======================================================
        if (system.stats.init) system.stats.init.value = dex + conc;

        // HP Max Calculation (Base + STR)
        // Check for Species Item First
        let hpBase = 10; 
        const speciesItem = actorData.items.find(i => i.type === 'species');
        if (speciesItem && speciesItem.system.hp) {
            hpBase = speciesItem.system.hp;
        } else {
            // Fallback to config
            const speciesKey = system.bio.species;
            const speciesConfig = CONFIG.SLA?.speciesStats[speciesKey];
            if (speciesConfig) hpBase = speciesConfig.hp;
        }
        system.hp.max = hpBase + str;

        // Movement Logic
        let closing = 0;
        let rushing = 0;

        if (speciesItem) {
             closing = speciesItem.system.move.closing;
             rushing = speciesItem.system.move.rushing;
             // While we are here, ensure bio matches item name for display
             system.bio.species = speciesItem.name;
        } else {
             const speciesKey = system.bio.species;
             const speciesConfig = CONFIG.SLA?.speciesStats[speciesKey];
             if (speciesConfig && speciesConfig.move) {
                closing = speciesConfig.move.closing;
                rushing = speciesConfig.move.rushing;
             }
        }

        const athletics = actorData.items.find(i => i.type === 'skill' && i.name.toLowerCase() === 'athletics');
        if (athletics) {
            rushing += Math.floor((athletics.system.rank || 0) / 2);
        }

        // Apply Movement Caps (Critical / Encumbrance)
        if (isCritical) {
            rushing = closing;
        }
        if (moveCap !== null) {
            rushing = Math.min(rushing, moveCap);
        }
        if (system.conditions.immobile || isDead) {
            closing = 0;
            rushing = 0;
        }

        if (!system.move) system.move = { closing: 0, rushing: 0 };
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
    const speciesStats = CONFIG.SLA?.speciesStats; 
    
    // 1. Prevent Negative HP
    if (changed.system?.hp?.value !== undefined) {
        if (changed.system.hp.value < 0) changed.system.hp.value = 0;
    }

    // 2. Enforce Max Stats based on SPECIES ITEM (Priority)
    // or CONFIG (Fallback)
    if (changed.system?.stats) {
        let limitData = null;
        
        // Check Item First
        const speciesItem = this.items.find(i => i.type === 'species');
        if (speciesItem) {
            limitData = speciesItem.system.stats;
        } else {
            // Check Config
            const currentSpecies = this.system.bio.species;
            const confData = speciesStats[currentSpecies];
            if (confData) limitData = confData.stats;
        }

        if (limitData) {
            for (const [key, updateData] of Object.entries(changed.system.stats)) {
                if (updateData?.value !== undefined) {
                    const statLimit = limitData[key];
                    // Check if limit exists and has max
                    if (statLimit && statLimit.max !== undefined) {
                        const max = statLimit.max;
                        if (updateData.value > max) {
                            updateData.value = max;
                            if (typeof ui !== "undefined") ui.notifications.warn(`${key.toUpperCase()} capped at ${max}`);
                        }
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

  /** * @override
   * Detects changes to calculated conditions and syncs them to Token Status Effects.
   */
  async _onUpdate(changed, options, userId) {
      await super._onUpdate(changed, options, userId);
      
      if (game.user.id !== userId) return;

      // Helper to sync condition state
      const sync = async (key, overlay = false) => {
          const isSet = this.system.conditions[key];
          const hasEffect = this.effects.some(e => e.statuses.has(key));
          
          if (isSet && !hasEffect) {
              await this.toggleStatusEffect(key, { active: true, overlay: overlay });
          } else if (!isSet && hasEffect) {
              await this.toggleStatusEffect(key, { active: false });
          }
      };

      await sync("critical");
      await sync("dead", true); // Overlay for dead
      await sync("immobile");
      await sync("stunned");
  }
}