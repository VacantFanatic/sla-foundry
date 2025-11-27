import { onManageActiveEffect, prepareActiveEffectCategories } from "../helpers/effects.mjs";

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class SlaActorSheet extends ActorSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sla-industries", "sheet", "actor"],
      template: "systems/sla-industries/templates/actor/actor-sheet.hbs",
      width: 850,
      height: 850,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }]
    });
  }

  /** @override */
  get template() {
    const path = "systems/sla-industries/templates/actor";
    // Dynamic Switch: Use Red Sheet for NPCs, Grey Sheet for Players
    if (this.actor.type === 'npc') return `${path}/actor-npc-sheet.hbs`;
    return `${path}/actor-sheet.hbs`;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    const context = await super.getData();
    const actorData = context.data;
    context.system = actorData.system;
    context.flags = actorData.flags;

    // Prepare Items (Group into Skills, Traits, Gear)
    if (actorData.type == 'character' || actorData.type == 'npc') {
      this._prepareItems(context);
    }

    context.rollData = context.actor.getRollData();

    // --- PREPARE SPECIES DROPDOWN ---
    // Reads from the global config we set in sla-industries.mjs
    const speciesList = CONFIG.SLA.speciesStats;
    context.speciesOptions = Object.keys(speciesList).reduce((acc, key) => {
        acc[key] = speciesList[key].label;
        return acc;
    }, {});

    // Prepare active effects
    context.effects = prepareActiveEffectCategories(this.actor.effects);

    return context;
  }

  /**
   * Organize and classify Items for Character sheets.
   */
  _prepareItems(context) {
    const gear = [];
    const skills = [];
    const traits = [];

    for (let i of context.items) {
      i.img = i.img || DEFAULT_TOKEN;
      // Gear includes generic items, weapons, and armor
      if (i.type === 'item' || i.type === 'weapon' || i.type === 'armor') {
        gear.push(i);
      }
      else if (i.type === 'skill') {
        skills.push(i);
      }
      else if (i.type === 'trait') {
        traits.push(i);
      }
    }

    // Sort Alphabetically for cleaner lists
    gear.sort((a, b) => a.name.localeCompare(b.name));
    skills.sort((a, b) => a.name.localeCompare(b.name));
    traits.sort((a, b) => a.name.localeCompare(b.name));

    context.gear = gear;
    context.skills = skills;
    context.traits = traits;
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // -------------------------------------------------------------
    // ITEM MANAGEMENT
    // -------------------------------------------------------------

    // Edit Item (Pencil)
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      if (item) item.sheet.render(true);
    });

    // Delete Item (Trashcan)
    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      if (item) {
          Dialog.confirm({
            title: `Delete ${item.name}?`,
            content: "<p>Are you sure you want to delete this item?</p>",
            yes: () => {
                 item.delete();
                 li.slideUp(200, () => this.render(false));
            },
            defaultYes: false
          });
      }
    });

    // Toggle Item (Equip Shield Icon)
    html.find('.item-toggle').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      // Flip the 'equipped' boolean
      item.update({ "system.equipped": !item.system.equipped });
    });

    // Create Item (+ Button)
    html.find('.item-create').click(this._onItemCreate.bind(this));

    // -------------------------------------------------------------
    // ROLL HANDLERS
    // -------------------------------------------------------------
    html.find('.rollable').click(this._onRoll.bind(this));
    html.find(".effect-control").click(ev => onManageActiveEffect(ev, this.actor));
  }

  /**
   * Handle clickable rolls.
   * Logic: S5S System (Success Die + Skill Dice)
   */
  async _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    // -----------------------------------------------------
    // 1. STAT ROLL (Simple Check)
    // -----------------------------------------------------
    if (dataset.rollType === 'stat') {
        const statKey = dataset.key.toLowerCase();
        const statLabel = statKey.toUpperCase();
        const statValue = this.actor.system.stats[statKey]?.value || 0;
        
        // Apply Wound Penalty
        const penalty = this.actor.system.wounds.penalty || 0;
        const finalMod = statValue - penalty;

        let roll = new Roll("1d10");
        await roll.evaluate();
        
        let rawDie = roll.terms[0].results[0].result;
        let finalTotal = rawDie + finalMod;

        let penaltyHtml = penalty > 0 ? `<div style="font-size:0.8em; color:#f55;">Wound Penalty: -${penalty}</div>` : "";

        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            // CONTENT overrides default flavor text to hide the grey box
            content: `
                <div style="background: #222; border: 1px solid #39ff14; color: #eee; padding: 5px; font-family: 'Roboto Condensed', sans-serif;">
                    <h3 style="color:#39ff14; border-bottom:1px solid #555; margin:0 0 5px 0;">${statLabel} CHECK</h3>
                    ${penaltyHtml}
                    <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.3); padding: 5px; margin-bottom: 5px;">
                        <span style="font-size: 0.9em; color: #aaa;">SUCCESS DIE</span>
                        <div style="text-align: right;">
                             <span style="font-size: 1.5em; font-weight: bold; color: #fff;">${finalTotal}</span>
                             <span style="font-size: 0.8em; color: #777;">(Roll ${rawDie} + Mod ${finalMod})</span>
                        </div>
                    </div>
                </div>`
        });
    }

    // -----------------------------------------------------
    // 2. SKILL ROLL (S5S: Success Die + Skill Dice)
    // -----------------------------------------------------
    if (dataset.rollType === 'skill') {
        const itemId = $(element).parents('.item').data('itemId');
        const item = this.actor.items.get(itemId);
        
        const rank = item.system.rank || 0;
        const bonus = item.system.bonus || 0;
        
        // Find Stat
        let statInput = item.system.stat || "dex";
        let statKey = statInput.trim().toLowerCase(); 
        let statValue = 0;

        if (this.actor.system.stats[statKey]) {
            statValue = this.actor.system.stats[statKey].value;
        } else if (this.actor.system.ratings && this.actor.system.ratings[statKey]) {
             statValue = this.actor.system.ratings[statKey].value;
        }

        // Apply Wounds
        const penalty = this.actor.system.wounds.penalty || 0;
        const modifier = statValue + rank + bonus - penalty;
        
        // Build Formula
        let formula = "1d10";
        if (rank > 0) formula += ` + ${rank}d10`;

        let roll = new Roll(formula);
        await roll.evaluate();

        // Process Results
        const successRaw = roll.terms[0].results[0].result;
        const successTotal = successRaw + modifier;

        let skillDiceHtml = "";
        if (rank > 0 && roll.terms.length > 2) {
            const skillResults = roll.terms[2].results;
            skillResults.forEach(r => {
                let val = r.result + modifier;
                // Highlight successes (TN 10+)
                let border = val >= 10 ? "1px solid #39ff14" : "1px solid #555";
                let bg = val >= 10 ? "background: rgba(57, 255, 20, 0.1);" : "";
                
                skillDiceHtml += `
                    <div style="display: flex; flex-direction: column; align-items: center; margin: 2px;">
                        <span style="font-size: 1.2em; font-weight: bold; padding: 2px 8px; background: #111; border: ${border}; border-radius: 4px; ${bg}">${val}</span>
                        <span style="font-size: 0.7em; color: #555;">(${r.result})</span>
                    </div>`;
            });
        } else if (rank === 0) {
            skillDiceHtml = `<span style="font-style: italic; color: #555; font-size: 0.8em;">No Rank - Success Die Only</span>`;
        }

        let penaltyHtml = penalty > 0 ? `<span style="color:#f55;"> (Wounds: -${penalty})</span>` : "";

        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `
                <div style="background: #222; border: 1px solid #39ff14; color: #eee; padding: 5px; font-family: 'Roboto Condensed', sans-serif;">
                    <div style="border-bottom: 1px solid #555; margin-bottom: 5px; padding-bottom: 2px;">
                        <h3 style="color:#39ff14; margin: 0;">${item.name.toUpperCase()}</h3>
                        <div style="font-size: 0.8em; color: #aaa;">
                            Stat: ${statValue} | Rank: ${rank} | <strong>Mod: +${modifier}</strong> ${penaltyHtml}
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(30, 255, 30, 0.1); padding: 5px; margin-bottom: 5px; border: 1px solid #39ff14;">
                        <span style="font-size: 0.9em; font-weight: bold; color: #39ff14;">SUCCESS DIE</span>
                        <div style="text-align: right;">
                             <span style="font-size: 1.5em; font-weight: bold; color: #fff;">${successTotal}</span>
                             <span style="font-size: 0.8em; color: #777;">(Roll ${successRaw} + ${modifier})</span>
                        </div>
                    </div>
                    <div style="margin-top: 5px;">
                        <span style="font-size: 0.8em; font-weight: bold; color: #aaa;">SKILL DICE</span>
                        <div style="display: flex; flex-wrap: wrap; margin-top: 2px;">
                            ${skillDiceHtml}
                        </div>
                    </div>
                </div>`
        });
    }

    // -----------------------------------------------------
    // 3. ITEM/WEAPON ROLL (Attack + Damage Button)
    // -----------------------------------------------------
    if (dataset.rollType === 'item') {
        const itemId = $(element).parents('.item').data('itemId');
        const item = this.actor.items.get(itemId);

        // Only Weapons Roll
        if (item.type === 'weapon') {
            
            // A. FIND LINKED SKILL
            const skillKey = item.system.skill; 
            const statKey = "dex"; // Default attack stat
            const statValue = this.actor.system.stats[statKey]?.value || 0;
            
            let rank = 0;
            let skillName = "Unskilled";

            // Look up skill by name via Config
            if (skillKey && CONFIG.SLA.combatSkills[skillKey]) {
                const targetName = CONFIG.SLA.combatSkills[skillKey];
                const skillItem = this.actor.items.find(i => i.type === 'skill' && i.name.toLowerCase() === targetName.toLowerCase());
                if (skillItem) {
                    rank = skillItem.system.rank;
                    skillName = skillItem.name;
                }
            }

            // B. CALCULATE MODIFIER (Stat + Rank - Wounds)
            const penalty = this.actor.system.wounds.penalty || 0;
            const totalMod = statValue + rank - penalty;

            // C. ROLL S5S ATTACK
            let formula = "1d10";
            if (rank > 0) formula += ` + ${rank}d10`;

            let roll = new Roll(formula);
            await roll.evaluate();

            const successRaw = roll.terms[0].results[0].result;
            const successTotal = successRaw + totalMod;

            let skillDiceHtml = "";
            if (rank > 0 && roll.terms.length > 2) {
                 roll.terms[2].results.forEach(r => {
                     let val = r.result + totalMod;
                     let style = val >= 10 ? "color:#39ff14;font-weight:bold;" : "color:#aaa;";
                     skillDiceHtml += `<span style="border:1px solid #555;padding:2px 5px;margin:2px;${style}">${val}</span>`;
                 });
            } else if (rank === 0 && skillKey) {
                skillDiceHtml = `<span style="color:#f55; font-size:0.8em;">Skill '${CONFIG.SLA.combatSkills[skillKey]}' not found.</span>`;
            }

            const damageFormula = item.system.damage || "0";
            let penaltyHtml = penalty > 0 ? `<span style="color:#f55;"> (Wounds: -${penalty})</span>` : "";

            roll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content: `
                <div style="background:#222; border:1px solid #ff4400; color:#eee; padding:5px; font-family: 'Roboto Condensed', sans-serif;">
                    
                    <div style="border-bottom: 1px solid #555; margin-bottom: 5px;">
                        <h3 style="color:#ff4400; margin:0;">ATTACK: ${item.name.toUpperCase()}</h3>
                        <div style="font-size:0.8em; color:#aaa;">
                            DEX: ${statValue} | Skill: ${rank} (${skillName}) | <strong>Mod: +${totalMod}</strong> ${penaltyHtml}
                        </div>
                    </div>

                    <div style="display:flex; justify-content:space-between; background:rgba(255,68,0,0.1); padding:5px; margin-bottom:5px; border:1px solid #ff4400;">
                        <span style="font-weight:bold; color:#ff4400;">SUCCESS DIE</span>
                        <span style="font-size:1.5em; font-weight:bold; color:#fff;">${successTotal}</span>
                    </div>
                    
                    <div style="margin-bottom:10px;">
                        <span style="font-size:0.8em; color:#aaa;">SKILL DICE</span>
                        <div style="display:flex; flex-wrap:wrap;">${skillDiceHtml}</div>
                    </div>

                    <button class="roll-damage" data-damage="${damageFormula}" data-weapon="${item.name}" style="background:#111; color:#eee; border:1px solid #555; cursor:pointer; width: 100%;">
                        <i class="fas fa-tint" style="color:#a00;"></i> ROLL DAMAGE (${damageFormula})
                    </button>

                </div>`
            });
        } else {
            // If not a weapon, just show the item sheet
            item.sheet.render(true);
        }
    }
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;
    const name = `New ${type.capitalize()}`;
    const itemData = { name: name, type: type };
    return await Item.create(itemData, {parent: this.actor});
  }
}