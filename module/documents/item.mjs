/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class BoilerplateItem extends Item {

  prepareDerivedData() {
    super.prepareDerivedData();
  }

  getRollData() {
    if (!this.actor) return null;
    const rollData = this.actor.getRollData();
    rollData.item = foundry.utils.deepClone(this.system);
    return rollData;
  }

  /* -------------------------------------------- */
  /* NEW: Roll Function                          */
  /* -------------------------------------------- */

  /**
   * Handle clickable rolls.
   * @param {Object} options   Options which configure how the roll is handled
   */
  async roll(options = {}) {
    const item = this;
    const system = this.system;
    const actor = this.actor;

    // 1. Initialize Base Stats (Change these property names to match your schema)
    let baseDamage = system.damage || 0;
    let baseAD = system.attackDice || 0; // Attack Dice
    let modifiers = { damage: 0, ad: 0, pv: 0, name: "Standard" };

    // 2. Find Loaded Magazine
    // We assume the weapon stores the magazine's ID in 'system.magazineId'
    if (system.magazineId) {
      const magazine = actor.items.get(system.magazineId);

      if (magazine) {
        // Get the ammo type from the magazine
        const ammoType = magazine.system.ammoType || "standard";

        // Retrieve the modifiers from CONFIG (defined in config.mjs)
        const configMods = CONFIG.SLA.ammoModifiers[ammoType];

        if (configMods) {
          modifiers = {
            ...configMods,
            name: CONFIG.SLA.ammoTypes[ammoType]
          };

          // Debugging log
          console.log(`SLA | Rolling with ${modifiers.name}: +${modifiers.damage} DMG, +${modifiers.ad} AD`);
        }
      }
    }

    // 3. Apply Modifiers
    const finalDamage = baseDamage + modifiers.damage;
    const finalAD = baseAD + modifiers.ad;

    // 4. Create the Dialog (Without Ammo Select)
    // We still use a dialog to let the player add situational modifiers
    const content = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/chat/roll-dialog.hbs", {
      item: item,
      stats: { damage: finalDamage, ad: finalAD },
      ammoName: modifiers.name // Show them what ammo is loaded
    });

    return new Promise(resolve => {
      new Dialog({
        title: `${item.name}: Attack Roll`,
        content: content,
        buttons: {
          roll: {
            label: "Roll",
            callback: html => {
              // 5. Execute the Roll logic
              // Example Formula: (AD)d10 + Skill
              // You will need to adjust this formula to match your exact rules
              const rollFormula = `${finalAD}d10 + @skills.guns.value`;

              const roll = new Roll(rollFormula, actor.getRollData());

              roll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor: actor }),
                flavor: `
                  <h3>${item.name} Attack</h3>
                  <p><strong>Ammo:</strong> ${modifiers.name}</p>
                  <p><strong>Damage:</strong> ${finalDamage} (PV ${modifiers.pv})</p>
                `,
                flags: {
                  sla: {
                    isAP: modifiers.pv < 0 ? true : false,
                    pvMod: modifiers.pv
                  }
                }
              });
              resolve(roll);
            }
          }
        },
        default: "roll"
      }).render(true);
    });
  }

  /* -------------------------------------------- */
  /* End of New Roll Function                    */
  /* -------------------------------------------- */

  /**
   * Toggle the Active state of a drug/item and create/delete Active Effects.
   */
  async toggleActive() {
    // ... (Keep your existing toggleActive code here exactly as it was) ...
    // 1. Toggle Boolean
    const newState = !this.system.active;
    await this.update({ "system.active": newState });

    // 2. Handle Active Effect
    if (!this.actor) return;

    if (newState) {
      // ENABLED: Create Effect
      const effectData = {
        name: this.name,
        icon: this.img,
        origin: this.uuid,
        disabled: false,
        duration: { seconds: this._getDurationSeconds(this.system.duration) },
        changes: []
      };

      // Map Mods to Changes
      if (this.type === 'drug') {
        // Mod 1
        const m1 = this.system.mods.first;
        if (m1.value !== 0) {
          effectData.changes.push({
            key: `system.stats.${m1.stat}.value`,
            mode: 2, // ADD
            value: m1.value
          });
        }
        // Mod 2
        const m2 = this.system.mods.second;
        if (m2.value !== 0) {
          effectData.changes.push({
            key: `system.stats.${m2.stat}.value`,
            mode: 2, // ADD
            value: m2.value
          });
        }
        // Damage Reduction
        if (this.system.damageReduction !== 0) {
          effectData.changes.push({
            key: `system.wounds.damageReduction`,
            mode: 2, // ADD
            value: this.system.damageReduction
          });
        }
      }

      if (effectData.changes.length > 0) {
        await this.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
        ui.notifications.info(`${this.name} applied.`);
      }

    } else {
      // DISABLED: Find and Delete Effect
      const effect = this.actor.effects.find(e => e.origin === this.uuid);
      if (effect) {
        await effect.delete();
        ui.notifications.info(`${this.name} removed.`);
      }
    }
  }

  // Helper to guess seconds from string
  _getDurationSeconds(str) {
    if (!str) return null;
    const s = str.toLowerCase();
    if (s.includes("hour")) return parseInt(s) * 3600;
    if (s.includes("min")) return parseInt(s) * 60;
    return null;
  }

  /**
   * @override
   * Triggered before an Item is updated in the database.
   */
  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);

    // Check if we are updating the system data of a Skill or Discipline
    if ((this.type === 'skill' || this.type === 'discipline') && changed.system) {

      // Check if Rank is being modified
      if (changed.system.rank !== undefined) {
        const newRank = changed.system.rank;
        const maxRank = 4; // HARD CAP

        // If the new rank exceeds the limit
        if (newRank > maxRank) {
          // Force it back to the limit
          changed.system.rank = maxRank;

          // Notify the user
          if (typeof ui !== "undefined") {
            ui.notifications.warn(`${this.name} Rank capped at ${maxRank}.`);
          }
        }
      }
    }
  }
}