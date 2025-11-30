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

    if (!system.stats || !system.ratings) return;

    if (actorData.type === 'character' || actorData.type === 'npc') {
        
        // 1. WOUNDS & CONDITIONS
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

        system.conditions = system.conditions || {};
        const isDead = system.hp.value === 0 || woundCount >= 6;
        system.conditions.dead = isDead;
        const isCritical = system.hp.value < 6 && !isDead;
        system.conditions.critical = isCritical;

        if (w.head) system.conditions.stunned = true;
        if (w.lLeg && w.rLeg) system.conditions.immobile = true;

        // 2. DRUG MODIFIERS
        let strMod = 0, dexMod = 0, knowMod = 0, concMod = 0, chaMod = 0, coolMod = 0;
        let damageReduction = 0;

        if (actorData.items) {
            for (const item of actorData.items) {
                if (item.type === 'drug' && item.system.active) {
                    const m1 = item.system.mods.first;
                    const m2 = item.system.mods.second;
                    const apply = (mod) => {
                        if (mod.stat === 'str') strMod += mod.value;
                        if (mod.stat === 'dex') dexMod += mod.value;
                        if (mod.stat === 'know') knowMod += mod.value;
                        if (mod.stat === 'conc') concMod += mod.value;
                        if (mod.stat === 'cha') chaMod += mod.value;
                        if (mod.stat === 'cool') coolMod += mod.value;
                    };
                    if (m1.value !== 0) apply(m1);
                    if (m2.value !== 0) apply(m2);
                    damageReduction += (item.system.damageReduction || 0);
                }
            }
        }
        system.wounds.damageReduction = damageReduction;

        // 3. ENCUMBRANCE (Needs Raw STR for Max)
        const baseStr = Number(system.stats.str?.value) || 0;
        let totalWeight = 0;
        let highestPV = 0;

        if (actorData.items) {
            for (const item of actorData.items) {
                const itemData = item.system;
                if (itemData?.weight) totalWeight += (itemData.weight * (itemData.quantity || 1));
                if (item.type === 'armor' && itemData?.equipped) {
                    let currentPV = itemData.pv || 0;
                    const res = itemData.resistance;
                    if (res) {
                        if (res.value <= 0) currentPV = 0;
                        else if (res.value < (res.max / 2)) currentPV = Math.floor(currentPV / 2);
                    }
                    if (currentPV > highestPV) highestPV = currentPV; 
                }
            }
        }
        
        system.encumbrance.value = Math.round(totalWeight * 10) / 10;
        system.encumbrance.max = Math.max(8, baseStr * 3);
        
        const encValue = Math.floor(system.encumbrance.max - system.encumbrance.value);
        let encDexPenalty = 0;
        let moveCap = null;

        if (encValue === 1) { encDexPenalty = 1; moveCap = 1; }
        else if (encValue === 0) { encDexPenalty = 2; moveCap = 1; }
        else if (encValue < 0) { system.conditions.immobile = true; }

        // 4. CALCULATE EFFECTIVE STATS (Base + Modifiers)
        const critModPhysical = isCritical ? -2 : 0;
        const critModMental = isCritical ? -1 : 0;

        // Local variables for calculation
        const effStr = Math.max(0, (Number(system.stats.str?.value) || 0) + critModPhysical + strMod);
        const effDex = Math.max(0, (Number(system.stats.dex?.value) || 0) + critModPhysical + dexMod - encDexPenalty);
        const effKnow = Math.max(0, (Number(system.stats.know?.value) || 0) + knowMod);
        const effConc = Math.max(0, (Number(system.stats.conc?.value) || 0) + critModMental + concMod);
        const effCha = Math.max(0, (Number(system.stats.cha?.value) || 0) + chaMod);
        const effCool = Math.max(0, (Number(system.stats.cool?.value) || 0) + critModMental + coolMod);

        // SAVE TO .total (Do NOT overwrite .value)
        system.stats.str.total = effStr;
        system.stats.dex.total = effDex;
        system.stats.know.total = effKnow;
        system.stats.conc.total = effConc;
        system.stats.cha.total = effCha;
        system.stats.cool.total = effCool;

        // 5. RATINGS POINTS (Use Effective Stats)
        const rawBody = effStr + effDex;
        const rawBrains = effKnow + effConc;
        const rawBravado = effCha + effCool;

        let rankings = [{ id: "body", total: rawBody }, { id: "brains", total: rawBrains }, { id: "bravado", total: rawBravado }];
        rankings.sort((a, b) => b.total - a.total);

        if (system.ratings[rankings[0].id]) system.ratings[rankings[0].id].value = 2;
        if (system.ratings[rankings[1].id]) system.ratings[rankings[1].id].value = 1;
        if (system.ratings[rankings[2].id]) system.ratings[rankings[2].id].value = 0;

        // 6. INITIATIVE & MOVEMENT & HP
        if (system.stats.init) system.stats.init.value = effDex + effConc;

        // HP uses Effective STR
        let hpBase = 10; 
        const speciesItem = actorData.items.find(i => i.type === 'species');
        if (speciesItem && speciesItem.system.hp) {
            hpBase = speciesItem.system.hp;
        } else {
            const speciesKey = system.bio.species;
            const speciesConfig = CONFIG.SLA?.speciesStats?.[speciesKey];
            if (speciesConfig) hpBase = speciesConfig.hp;
        }
        system.hp.max = hpBase + effStr;

        // Movement
        let closing = 0;
        let rushing = 0;

        if (speciesItem) {
             closing = speciesItem.system.move.closing;
             rushing = speciesItem.system.move.rushing;
             system.bio.species = speciesItem.name;
        } else {
             const speciesKey = system.bio.species;
             const speciesConfig = CONFIG.SLA?.speciesStats?.[speciesKey];
             if (speciesConfig?.move) {
                closing = speciesConfig.move.closing;
                rushing = speciesConfig.move.rushing;
             }
        }

        const athletics = actorData.items.find(i => i.type === 'skill' && i.name.toLowerCase() === 'athletics');
        if (athletics) {
            rushing += Math.floor((athletics.system.rank || 0) / 2);
        }

        if (isCritical) rushing = closing;
        if (moveCap !== null) rushing = Math.min(rushing, moveCap);
        if (system.conditions.immobile || isDead) { closing = 0; rushing = 0; }

        if (!system.move) system.move = { closing: 0, rushing: 0 };
        system.move.closing = closing;
        system.move.rushing = rushing;
        
        if (!system.armor) system.armor = { pv: 0, resist: 0 };
        system.armor.pv = highestPV;
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
    
    if (changed.system?.hp?.value !== undefined) {
        if (changed.system.hp.value < 0) changed.system.hp.value = 0;
    }
    
    // Max Stats check - Use BASE value for check
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
  
  getRollData() {
    const data = super.getRollData();
    if (data.stats) {
      for (let [k, v] of Object.entries(data.stats)) {
        // Expose both value (Base) and total (Effective) to rolls
        data[k] = v.total !== undefined ? v.total : v.value;
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
          
          // Only toggle if there is a mismatch
          if (isSet && !hasEffect) {
              await this.toggleStatusEffect(key, { active: true, overlay: overlay });
          } else if (!isSet && hasEffect) {
              await this.toggleStatusEffect(key, { active: false });
          }
      };

      // ONLY sync conditions that are calculated by math
      // Manual conditions (Bleeding, Prone) are handled by the Sheet Button directly
      await sync("critical");
      await sync("dead", true); // Overlay for dead
      
      // Immobile is calculated (Encumbrance/Legs), so we sync it
      await sync("immobile");
      
      // Stunned is tricky. It can be Manual OR Calculated (Head wound).
      // If we include it here, Head Wound forces it ON.
      // If we exclude it, the Head Wound logic in prepareDerivedData won't show an icon.
      // We will keep it here to enforce Head Wound rules.
      await sync("stunned");
  }
}