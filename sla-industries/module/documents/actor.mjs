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
        
        // --- 1. WOUNDS & CONDITIONS LOGIC ---
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

        // RULE: Death (6 Wounds or 0 HP)
        const isDead = system.hp.value === 0 || woundCount >= 6;
        system.conditions.dead = isDead;

        // RULE: Critical (HP < 6, but not Dead)
        const isCritical = system.hp.value < 6 && !isDead;
        system.conditions.critical = isCritical;

        // RULE: Bleeding (Auto-flag for UI, toggling handled manually)
        const isFrother = system.bio.species?.toLowerCase() === "frother";
        const bleedingThreshold = isFrother ? 2 : 1;
        // We don't force bleeding here (to allow toggle), but we know it *should* bleed.

        // RULE: Stunned (Head Wound)
        if (w.head) system.conditions.stunned = true;

        // RULE: Immobile (Both Legs Wounded)
        if (w.lLeg && w.rLeg) system.conditions.immobile = true;


        // --- 2. APPLY DRUG MODIFIERS ---
        let strMod = 0, dexMod = 0, knowMod = 0, concMod = 0, chaMod = 0, coolMod = 0;
        let damageReduction = 0;

        if (actorData.items) {
            for (const item of actorData.items) {
                if (item.type === 'drug' && item.system.active) {
                    const m1 = item.system.mods.first;
                    const m2 = item.system.mods.second;
                    // Apply Mods
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

        // --- 3. CALCULATE STATS ---
        const critModPhysical = isCritical ? -2 : 0;
        const critModMental = isCritical ? -1 : 0;

        let str = Math.max(0, (Number(system.stats.str?.value) || 0) + critModPhysical + strMod);
        let dex = Math.max(0, (Number(system.stats.dex?.value) || 0) + critModPhysical + dexMod);
        let know = Math.max(0, (Number(system.stats.know?.value) || 0) + knowMod);
        let conc = Math.max(0, (Number(system.stats.conc?.value) || 0) + critModMental + concMod);
        let cha = Math.max(0, (Number(system.stats.cha?.value) || 0) + chaMod);
        let cool = Math.max(0, (Number(system.stats.cool?.value) || 0) + critModMental + coolMod);

        system.stats.str.value = str;
        system.stats.dex.value = dex;
        system.stats.know.value = know;
        system.stats.conc.value = conc;
        system.stats.cha.value = cha;
        system.stats.cool.value = cool;

        // --- 4. RATINGS POINTS ---
        const rawBody = str + dex;
        const rawBrains = know + conc;
        const rawBravado = cha + cool;

        let rankings = [{ id: "body", total: rawBody }, { id: "brains", total: rawBrains }, { id: "bravado", total: rawBravado }];
        rankings.sort((a, b) => b.total - a.total);

        if (system.ratings[rankings[0].id]) system.ratings[rankings[0].id].value = 2;
        if (system.ratings[rankings[1].id]) system.ratings[rankings[1].id].value = 1;
        if (system.ratings[rankings[2].id]) system.ratings[rankings[2].id].value = 0;

        // --- 5. INITIATIVE ---
        if (system.stats.init) system.stats.init.value = dex + conc;

        // --- 6. MOVEMENT ---
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

        if (system.conditions.immobile || isDead) { closing = 0; rushing = 0; }
        else if (isCritical) { rushing = closing; }

        if (!system.move) system.move = { closing: 0, rushing: 0 };
        system.move.closing = closing;
        system.move.rushing = rushing;

        // --- 7. ENCUMBRANCE & ARMOR ---
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
        system.encumbrance.max = Math.max(8, str * 3);
        
        // Apply Encumbrance Penalties to Move/Dex
        const encValue = Math.floor(system.encumbrance.max - system.encumbrance.value);
        if (encValue === 1) {
            system.stats.dex.value = Math.max(0, dex - 1);
            if (system.move.rushing > 1) system.move.rushing = 1;
        } else if (encValue === 0) {
            system.stats.dex.value = Math.max(0, dex - 2);
            if (system.move.rushing > 1) system.move.rushing = 1;
        } else if (encValue < 0) {
            system.conditions.immobile = true;
            system.move.closing = 0;
            system.move.rushing = 0;
        }

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
    const speciesStats = CONFIG.SLA?.speciesStats; 
    
    if (changed.system?.hp?.value !== undefined) {
        if (changed.system.hp.value < 0) changed.system.hp.value = 0;
    }

    if (speciesStats && changed.system?.stats) {
        const currentSpecies = this.system.bio.species;
        const limitData = speciesStats[currentSpecies];
        if (limitData) {
            for (const [key, updateData] of Object.entries(changed.system.stats)) {
                if (updateData?.value !== undefined) {
                    const statLimit = limitData.stats[key];
                    if (statLimit) {
                        const max = statLimit.max;
                        if (updateData.value > max) updateData.value = max;
                    }
                }
            }
        }
    }
  }
  
  getRollData() {
    const data = super.getRollData();
    if (data.stats) { for (let [k, v] of Object.entries(data.stats)) data[k] = v.value; }
    return data;
  }

  /** * @override
   * Detects changes to calculated conditions and syncs them to Token Status Effects.
   */
  async _onUpdate(changed, options, userId) {
      await super._onUpdate(changed, options, userId);
      
      // Only run on the client that initiated the update
      if (game.user.id !== userId) return;

      // 1. SYNC CRITICAL
      const isCritical = this.system.conditions.critical;
      const hasCritical = this.effects.some(e => e.statuses.has("critical"));

      if (isCritical && !hasCritical) {
          await this.toggleStatusEffect("critical", { active: true });
      } else if (!isCritical && hasCritical) {
          await this.toggleStatusEffect("critical", { active: false });
      }

      // 2. SYNC DEAD
      const isDead = this.system.conditions.dead;
      const hasDead = this.effects.some(e => e.statuses.has("dead"));

      if (isDead && !hasDead) {
          // Apply Dead overlay
          await this.toggleStatusEffect("dead", { active: true, overlay: true });
      } else if (!isDead && hasDead) {
          await this.toggleStatusEffect("dead", { active: false });
      }
      
      // 3. SYNC IMMOBILE
      const isImmobile = this.system.conditions.immobile;
      const hasImmobile = this.effects.some(e => e.statuses.has("immobile"));
      
      if (isImmobile && !hasImmobile) {
          await this.toggleStatusEffect("immobile", { active: true });
      } else if (!isImmobile && hasImmobile) {
          await this.toggleStatusEffect("immobile", { active: false });
      }
      
      // 4. SYNC STUNNED
      const isStunned = this.system.conditions.stunned;
      const hasStunned = this.effects.some(e => e.statuses.has("stunned"));
      
      if (isStunned && !hasStunned) {
          await this.toggleStatusEffect("stunned", { active: true });
      } else if (!isStunned && hasStunned) {
          await this.toggleStatusEffect("stunned", { active: false });
      }
  }
}