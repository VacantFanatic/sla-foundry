/**
 * Extend the basic ActorSheet
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
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main", group: "primary" }]
    });
  }

  /** @override */
  get template() {
    const path = "systems/sla-industries/templates/actor";
    if (this.actor.type === 'npc') return `${path}/actor-npc-sheet.hbs`;
    return `${path}/actor-sheet.hbs`;
  }

  /* -------------------------------------------- */
  /* DATA PREPARATION                            */
  /* -------------------------------------------- */

  /** @override */
  async getData() {
    const context = await super.getData();
    const actorData = context.data;
    
    if (!actorData || !actorData.system) return context; 
    
    context.system = actorData.system;
    context.flags = actorData.flags;

    // ... (Keep your existing stats/ratings/wounds initialization) ...
    context.system.stats = context.system.stats || {};
    context.system.ratings = context.system.ratings || {};
    context.system.wounds = context.system.wounds || {};
    context.system.move = context.system.move || {}; 
    context.system.conditions = context.system.conditions || {};

    if (actorData.type == 'character' || actorData.type == 'npc') {
      this._prepareItems(context);
    }

    context.rollData = context.actor.getRollData();

    // ... (Keep existing speciesList logic) ...

    context.speciesItem = this.actor.items.find(i => i.type === "species");
    context.packageItem = this.actor.items.find(i => i.type === "package");

    // --- NEW: CHECK IF EBONITE ---
    // Returns true if species exists AND name contains "ebonite" (case-insensitive)
    if (context.speciesItem && context.speciesItem.name) {
        context.isEbonite = context.speciesItem.name.toLowerCase().includes("ebonite");
    } else {
        context.isEbonite = false;
    }

    context.enrichedBiography = await TextEditor.enrichHTML(this.actor.system.biography, {async: true, relativeTo: this.actor});
    context.enrichedAppearance = await TextEditor.enrichHTML(this.actor.system.appearance, {async: true, relativeTo: this.actor});
    context.enrichedNotes = await TextEditor.enrichHTML(this.actor.system.notes, {async: true, relativeTo: this.actor});

    return context;
  }

_prepareItems(context) {
    // 1. Initialize Containers
    const inventory = {
        weapon:   { label: "Weapons", items: [] },
        armor:    { label: "Armor", items: [] },
        magazine: { label: "Ammunition", items: [] },
        drug:     { label: "Drugs", items: [] },
        item:     { label: "Gear", items: [] }
    };

    const traits = [];
    const ebbFormulas = [];
    const disciplines = [];
    const skills = [];
    
    // Skill Buckets
    const skillsByStat = {
        "str": { label: "STR", items: [] },
        "dex": { label: "DEX", items: [] },
        "know": { label: "KNOW", items: [] },
        "conc": { label: "CONC", items: [] },
        "cha": { label: "CHA", items: [] },
        "cool": { label: "COOL", items: [] },
        "other": { label: "OTHER", items: [] }
    };

    // Separate Arrays for Combat Tab
    const weapons = [];
    const armors = [];

    // 2. Sort Items into Containers
    for (let i of context.items) {
      i.img = i.img || DEFAULT_TOKEN;
      
      // INVENTORY GROUPS
      if (inventory[i.type]) {
          inventory[i.type].items.push(i);
      }

      // COMBAT TAB SPECIFIC
      if (i.type === 'weapon') {
          // --- NEW: RELOAD LOGIC ---
          // Hide reload button if skill is melee or unarmed
          const skillKey = (i.system.skill || "").toLowerCase();
          i.isReloadable = !["melee", "unarmed"].includes(skillKey);
          
          weapons.push(i);
      }
      
      if (i.type === 'armor') armors.push(i);

      // OTHER ITEMS
      if (i.type === 'trait') traits.push(i);
      else if (i.type === 'ebbFormula') ebbFormulas.push(i);
      else if (i.type === 'discipline') disciplines.push(i);
      
      else if (i.type === 'skill') {
          const stat = (i.system.stat || "dex").toLowerCase();
          if (skillsByStat[stat]) skillsByStat[stat].items.push(i);
          else skillsByStat["other"].items.push(i);
          skills.push(i);
      }
    }

    // 3. Sorting Function (Alphabetical)
    const sortFn = (a, b) => a.name.localeCompare(b.name);
    
    // Sort every list
    Object.values(inventory).forEach(cat => cat.items.sort(sortFn));
    traits.sort(sortFn);
    ebbFormulas.sort(sortFn);
    disciplines.sort(sortFn);
    weapons.sort(sortFn);
    armors.sort(sortFn);
    skills.sort(sortFn);
    
    for (const key in skillsByStat) {
        skillsByStat[key].items.sort(sortFn);
    }

    // 4. Ebb Nesting Logic
    const configDis = CONFIG.SLA?.ebbDisciplines || {};
    const nestedDisciplines = [];
    const rawFormulas = [...ebbFormulas];

    disciplines.forEach(d => {
        d.formulas = [];
        nestedDisciplines.push(d);
    });

    rawFormulas.forEach(f => {
        const key = f.system.discipline;
        const parent = nestedDisciplines.find(d => d.name === key || d.name === configDis[key]);
        if (parent) parent.formulas.push(f);
    });

    // 5. Assign to Context
    context.inventory = inventory; 
    context.traits = traits;
    context.disciplines = nestedDisciplines;
    context.skillsByStat = skillsByStat;
    
    context.weapons = weapons;
    context.armors = armors;
    context.skills = skills;
  }

  /* -------------------------------------------- */
  /* EVENT LISTENERS                             */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // HEADER DELETE
    html.find('.chip-delete[data-type="species"]').click(async ev => {
        ev.preventDefault(); ev.stopPropagation();
        const speciesItem = this.actor.items.find(i => i.type === "species");
        if (!speciesItem) return;
        Dialog.confirm({
            title: "Remove Species?", content: `<p>Remove <strong>${speciesItem.name}</strong>?</p>`,
            yes: async () => {
                const skillsToDelete = this.actor.items.filter(i => i.getFlag("sla-industries", "fromSpecies")).map(i => i.id);
                await this.actor.deleteEmbeddedDocuments("Item", [speciesItem.id, ...skillsToDelete]);
                const resets = { "system.bio.species": "" };
                ["str","dex","know","conc","cha","cool"].forEach(k => resets[`system.stats.${k}.value`] = 1);
                await this.actor.update(resets);
            }
        });
    });
	
	// --- NEW: INLINE ITEM EDITING (For Armor Resist) ---
    html.find('.inline-edit').change(async ev => {
        ev.preventDefault();
        const input = ev.currentTarget;
        const itemId = input.dataset.itemId || $(input).parents(".item").data("itemId");
        
        // Safety check if we can't find the item
        if (!itemId) return;

        const item = this.actor.items.get(itemId);
        const field = input.dataset.field; // "system.resistance.value"
        
        if (item && field) {
            // Use Number() to ensure it's saved as a number, not a string
            await item.update({ [field]: Number(input.value) });
        }
    });

    html.find('.chip-delete[data-type="package"]').click(async ev => {
        ev.preventDefault(); ev.stopPropagation();
        const packageItem = this.actor.items.find(i => i.type === "package");
        if (!packageItem) return;
        Dialog.confirm({
            title: "Remove Package?", content: `<p>Remove <strong>${packageItem.name}</strong>?</p>`,
            yes: async () => {
                const skillsToDelete = this.actor.items.filter(i => i.getFlag("sla-industries", "fromPackage")).map(i => i.id);
                await this.actor.deleteEmbeddedDocuments("Item", [packageItem.id, ...skillsToDelete]);
                await this.actor.update({ "system.bio.package": "" });
            }
        });
    });

    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      if (item) item.sheet.render(true);
    });

    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      if (item) Dialog.confirm({ title: "Delete Item?", content: "<p>Are you sure?</p>", yes: () => { item.delete(); li.slideUp(200, () => this.render(false)); } });
    });

    html.find('.item-toggle').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      if (item.type === 'drug') item.toggleActive();
      else item.update({ "system.equipped": !item.system.equipped });
    });

    // RELOAD HANDLER
    html.find('.item-reload').click(this._onReloadWeapon.bind(this));

    html.find('.item-create').click(this._onItemCreate.bind(this));
    html.find('.rollable').click(this._onRoll.bind(this));
    
    html.find('.condition-toggle').click(async ev => {
      ev.preventDefault();
      const conditionId = ev.currentTarget.dataset.condition;
      await this.actor.toggleStatusEffect(conditionId);
    });

    html.find('.wound-checkbox').change(async ev => {
        const target = ev.currentTarget;
        const isChecked = target.checked;
        const field = target.name; 
        await this.actor.update({ [field]: isChecked });
        
        const isBleeding = this.actor.effects.some(e => e.statuses.has("bleeding"));
        if (isChecked) {
             if (!isBleeding) await this.actor.toggleStatusEffect("bleeding", { active: true });
        } else {
             const newState = { ...this.actor.system.wounds, [field.split('.').pop()]: false }; 
             let activeWounds = Object.values(newState).filter(v => v === true).length;
             if (activeWounds === 0 && isBleeding) await this.actor.toggleStatusEffect("bleeding", { active: false });
        }
    });
  }

  // --- RELOAD LOGIC (Match by Linked Weapon Name) ---
  async _onReloadWeapon(event) {
      event.preventDefault();
      const li = $(event.currentTarget).parents(".item");
      const weapon = this.actor.items.get(li.data("itemId"));
      const weaponName = weapon.name;

      // Find all magazines that claim to link to this weapon
      const candidates = this.actor.items.filter(i => 
          i.type === "magazine" && 
          i.system.linkedWeapon === weaponName && 
          (i.system.quantity > 0)
      );

      if (candidates.length === 0) {
          return ui.notifications.warn(`No magazines found linked to: '${weaponName}'`);
      }

      // If only one match, just do it
      if (candidates.length === 1) {
          return this._performReload(weapon, candidates[0]);
      }

      // If multiple matches, Prompt User
      let content = `<p>Select magazine to load into <strong>${weaponName}</strong>:</p>`;
      content += `<div class="form-group"><select id="magazine-select" style="width:100%; box-sizing:border-box;">`;
      candidates.forEach(c => {
          content += `<option value="${c.id}">${c.name} (Qty: ${c.system.quantity})</option>`;
      });
      content += `</select></div><br>`;

      new Dialog({
          title: "Select Ammunition",
          content: content,
          buttons: {
              load: {
                  label: "Load Magazine",
                  callback: (html) => {
                      const magId = html.find('#magazine-select').val();
                      const mag = this.actor.items.get(magId);
                      if (mag) this._performReload(weapon, mag);
                  }
              }
          },
          default: "load"
      }, { classes: ["sla-dialog", "sla-sheet"] }).render(true);
  }

  async _performReload(weapon, magazine) {
      // 1. Determine Capacity from Magazine
      const capacity = magazine.system.ammoCapacity || 10;

      // 2. Update Weapon Ammo AND Max Ammo (so we know the clip size)
      await weapon.update({ 
          "system.ammo": capacity,
          "system.maxAmmo": capacity 
      });

      // 3. Consume Magazine
      const newQty = (magazine.system.quantity || 1) - 1;
      
      if (newQty <= 0) {
          await magazine.delete();
          ui.notifications.info(`Reloaded ${weapon.name} with ${magazine.name}. Magazine depleted.`);
      } else {
          await magazine.update({ "system.quantity": newQty });
          ui.notifications.info(`Reloaded ${weapon.name} with ${magazine.name}. ${newQty} remaining.`);
      }
  }

  /* -------------------------------------------- */
  /* ROLL HANDLERS                               */
  /* -------------------------------------------- */


/* Handle clickable rolls.
 * @param {Event} event   The originating click event
 * @private
 */
async _onRoll(event) {
  event.preventDefault();
  const element = event.currentTarget;
  const dataset = element.dataset;

  // Handle Item Rolls (triggered by your crosshairs icon)
	if (dataset.rollType === 'item') {
        const itemId = $(element).parents('.item').data('itemId');
        const item = this.actor.items.get(itemId);
        if (item.type === 'weapon') {
            const skillKey = item.system.skill || "";
            const isMelee = ["melee", "unarmed", "thrown"].includes(skillKey);
            
            // ADD AWAIT HERE
            await this._renderAttackDialog(item, isMelee);
            
        } else if (item.type === 'ebbFormula') {
            this._executeEbbRoll(item);
        } else {
            item.sheet.render(true);
        }
    }
	
    let globalMod = 0;
    if (this.actor.system.conditions?.prone) globalMod -= 1;
    if (this.actor.system.conditions?.stunned) globalMod -= 1;

    // STAT ROLL
    if (dataset.rollType === 'stat') {
        const statKey = dataset.key.toLowerCase();
        const statLabel = statKey.toUpperCase();
        const statValue = this.actor.system.stats[statKey]?.total ?? this.actor.system.stats[statKey]?.value ?? 0;
        const penalty = this.actor.system.wounds.penalty || 0;
        const finalMod = statValue - penalty + globalMod;

        let roll = new Roll("1d10");
		// --- DICE SO NICE: FORCE BLACK SUCCESS DIE ---
		// Target the first term (1d10)
		if (roll.terms.length > 0 && roll.terms[0].constructor.name === "Die") {
          roll.terms[0].options.appearance = {
              foreground: "#FFFFFF", // White Text
              background: "#000000", // Black Body
              edge: "#333333"        // Dark Grey Outline
          };
		}
		// ---------------------------------------------
        await roll.evaluate();
        
        let rawDie = roll.terms[0].results[0].result;
        let finalTotal = rawDie + finalMod;
        const resultColor = finalTotal > 10 ? '#39ff14' : '#f55';

        const tooltipHtml = this._generateTooltip(roll, finalMod, 0);

        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `
            <div style="background:#222; border:1px solid #39ff14; color:#eee; padding:5px; font-family:'Roboto Condensed';">
                <h3 style="color:#39ff14; border-bottom:1px solid #555; margin:0 0 5px 0;">${statLabel} CHECK</h3>
                <div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.3); padding:5px;">
                    <span style="font-size:0.9em; color:#aaa;">SUCCESS DIE</span>
                    <div style="text-align:right;">
                         <span class="roll-toggle" style="font-size:1.5em; font-weight:bold; color:${resultColor}; cursor:pointer;" title="Click for details">${finalTotal}</span>
                    </div>
                </div>
                ${tooltipHtml}
            </div>`
        });
    }

    if (dataset.rollType === 'skill') {
        this._executeSkillRoll(element);
    }
    
    if (dataset.rollType === 'init') {
        await this.actor.rollInitiative({createCombatants: true});
    }
  }

 // --- DIALOG ---
  async _renderAttackDialog(item, isMelee) {
    const templateData = {
      item: item,
      isMelee: isMelee,
      recoil: item.system.recoil || 0
    };

    const content = await renderTemplate("systems/sla-industries/templates/dialogs/attack-dialog.hbs", templateData);

    new Dialog({
      title: `Attack: ${item.name}`,
      content: content,
      buttons: {
        roll: {
          label: "ROLL",
          callback: (html) => this._processWeaponRoll(item, html, isMelee)
        }
      },
      default: "roll"
    }, {
      classes: ["sla-dialog", "sla-sheet"]
    }).render(true);
  }
  
	async _executeSkillRoll(element) {
      // 1. GET ITEM & DATA
      const itemId = $(element).parents('.item').data('itemId');
      const item = this.actor.items.get(itemId);
      if (!item) return;

      const statKey = item.system.stat || "dex";
      const statValue = this.actor.system.stats[statKey]?.total ?? this.actor.system.stats[statKey]?.value ?? 0;
      
      // Default rank to 0 if missing
      const rank = item.system.rank || 0;

      // 2. MODIFIERS (Wounds, Prone, Stunned)
      let globalMod = 0;
      if (this.actor.system.conditions?.prone) globalMod -= 1;
      if (this.actor.system.conditions?.stunned) globalMod -= 1;
      const penalty = this.actor.system.wounds.penalty || 0;
      
      const baseModifier = statValue + rank + globalMod - penalty;

      // 3. ROLL FORMULA
      // CORRECTION: 1 Success Die + (Rank + 1) Skill Dice
      const skillDiceCount = rank + 1;
      const rollFormula = `1d10 + ${skillDiceCount}d10`;

      let roll = new Roll(rollFormula);
	  // --- DICE SO NICE: FORCE BLACK SUCCESS DIE ---
		// Target the first term (1d10)
		if (roll.terms.length > 0 && roll.terms[0].constructor.name === "Die") {
          roll.terms[0].options.appearance = {
              foreground: "#FFFFFF", // White Text
              background: "#000000", // Black Body
              edge: "#333333"        // Dark Grey Outline
          };
		}
		// ---------------------------------------------
      await roll.evaluate();

      // 4. CALCULATE SUCCESS
      const TN = 11;
      const sdRaw = roll.terms[0].results[0].result;
      const sdTotal = sdRaw + baseModifier;
      const isSuccess = sdTotal >= TN;
      const resultColor = isSuccess ? '#39ff14' : '#f55';

      // 5. PROCESS SKILL DICE (MOS)
      let skillDiceData = [];
      let skillSuccessCount = 0;
      
      if (roll.terms.length > 2) {
           roll.terms[2].results.forEach(r => {
               let val = r.result + baseModifier;
               let isHit = val >= TN; 
               if (isHit) skillSuccessCount++;
               
               skillDiceData.push({
                   raw: r.result,
                   total: val,
                   borderColor: isHit ? "#39ff14" : "#555",
                   textColor: isHit ? "#39ff14" : "#ccc"
               });
           });
      }

      // 6. RENDER TEMPLATE
      const templateData = {
          borderColor: resultColor,
          headerColor: resultColor,
          resultColor: resultColor,
          itemName: item.name.toUpperCase(),
          successTotal: sdTotal,
          tooltip: this._generateTooltip(roll, baseModifier, 0),
          skillDice: skillDiceData,
          notes: "", 
          showDamageButton: false, 
          mos: {
              isSuccess: isSuccess,
              hits: skillSuccessCount,
              effect: isSuccess ? `Margin of Success: ${skillSuccessCount}` : "Failed"
          }
      };

      const chatContent = await renderTemplate("systems/sla-industries/templates/chat/chat-weapon-rolls.hbs", templateData);

      roll.toMessage({
           speaker: ChatMessage.getSpeaker({ actor: this.actor }),
           content: chatContent
      });
  }

  // --- HELPERS: HTML GENERATION ---
  _generateTooltip(roll, baseModifier, successDieMod) {
      let html = `<div class="dice-tooltip" style="display:none; margin-top:10px; padding-top:5px; border-top:1px solid #444; font-size:0.8em; color:#ccc;">`;
      const sdRaw = roll.terms[0].results[0].result;
      const sdTotal = sdRaw + baseModifier + successDieMod;
      html += `<div><strong>Success Die:</strong> Raw ${sdRaw} + Base ${baseModifier} + SD Mod ${successDieMod} = <strong>${sdTotal}</strong></div>`;
      if (roll.terms.length > 2) {
          html += `<div style="border-top:1px dashed #444; margin-top:2px;"><strong>Skill Dice (Base ${baseModifier}):</strong></div>`;
          html += `<div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:2px;">`;
          roll.terms[2].results.forEach(r => {
             html += `<span style="background:#222; border:1px solid #555; padding:1px 4px;">${r.result} + ${baseModifier} = <strong>${r.result+baseModifier}</strong></span>`;
          });
          html += `</div>`;
      }
      html += `</div>`;
      return html;
  }

async _processWeaponRoll(item, html, isMelee) {
      const form = html[0].querySelector("form");
      if (!form) return;

      // 1. SETUP
      const statKey = "dex"; 
      const statValue = this.actor.system.stats[statKey]?.total ?? this.actor.system.stats[statKey]?.value ?? 0;
      const strValue = Number(this.actor.system.stats.str?.total ?? this.actor.system.stats.str?.value ?? 0); 

      // Skill Lookup
      const skillInput = item.system.skill; 
      let rank = 0;
      let targetSkillName = "";
      const combatSkills = CONFIG.SLA?.combatSkills || {};

      if (skillInput && combatSkills[skillInput]) targetSkillName = combatSkills[skillInput];
      else if (skillInput) targetSkillName = skillInput;

      if (targetSkillName) {
          const skillItem = this.actor.items.find(i => i.type === 'skill' && i.name.trim().toLowerCase() === targetSkillName.trim().toLowerCase());
          if (skillItem) rank = Number(skillItem.system.rank) || 0;
      }

      // Input Reading
      let mods = {
          successDie: 0,
          allDice: Number(form.modifier?.value) || 0, 
          rank: 0, 
          damage: 0,
          autoSkillSuccesses: 0
      };

      let notes = []; 
      let flags = { rerollSD: false, rerollAll: false };

      // Conditions
      if (this.actor.system.conditions?.prone) mods.allDice -= 1;
      if (this.actor.system.conditions?.stunned) mods.allDice -= 1;

      if (form.spendLuck?.checked) {
          const currentLuck = this.actor.system.stats.luck?.value || 0;
          if (currentLuck > 0) {
              flags.rerollAll = true; 
              await this.actor.update({"system.stats.luck.value": currentLuck - 1});
              notes.push("<strong style='color:#39ff14'>Luck Used.</strong>");
          } else { 
              ui.notifications.warn("No Luck remaining!"); 
          }
      }

      // Apply Modifiers
      if (isMelee) this._applyMeleeModifiers(form, strValue, mods);
      else await this._applyRangedModifiers(item, form, mods, notes, flags);

      const penalty = this.actor.system.wounds.penalty || 0;
      mods.allDice -= penalty;

      // 4. ROLL
      const baseModifier = statValue + rank + mods.allDice; 
      const skillDiceCount = Math.max(0, rank + 1 + mods.rank);
      const rollFormula = `1d10 + ${skillDiceCount}d10`;
      
      let roll = new Roll(rollFormula);
	  // --- DICE SO NICE: FORCE BLACK SUCCESS DIE ---
		// Target the first term (1d10)
		if (roll.terms.length > 0 && roll.terms[0].constructor.name === "Die") {
          roll.terms[0].options.appearance = {
              foreground: "#FFFFFF", // White Text
              background: "#000000", // Black Body
              edge: "#333333"        // Dark Grey Outline
          };
		}
		// ---------------------------------------------
      await roll.evaluate();

      // 5. RESULTS
      const TN = 11;
      const sdRaw = roll.terms[0].results[0].result;
      const sdTotal = sdRaw + baseModifier + mods.successDie;
      const isSuccess = sdTotal >= TN;
      const resultColor = isSuccess ? '#39ff14' : '#f55';

      // MOS Calculation
      let skillDiceData = [];
      let skillSuccessCount = 0;
      
      if (roll.terms.length > 2) {
           roll.terms[2].results.forEach(r => {
               let val = r.result + baseModifier;
               let isHit = val >= TN; 
               if (isHit) skillSuccessCount++;
               skillDiceData.push({
                   raw: r.result,
                   total: val,
                   borderColor: isHit ? "#39ff14" : "#555",
                   textColor: isHit ? "#39ff14" : "#ccc"
               });
           });
      }
      skillSuccessCount += mods.autoSkillSuccesses;
      for(let i=0; i < mods.autoSkillSuccesses; i++) {
          skillDiceData.push({ raw: "-", total: "Auto", borderColor: "#39ff14", textColor: "#39ff14" });
      }

      // --- NEW MOS LOGIC ---
      let mosDamageBonus = 0;
      let mosEffectText = "Standard Hit";
      let mosChoiceData = { hasChoice: false, choiceType: "", choiceDmg: 0 };
      
      if (isSuccess) {
          if (skillSuccessCount === 1) { 
              mosDamageBonus = 1; 
              mosEffectText = "+1 Damage"; 
          }
          else if (skillSuccessCount === 2) { 
              // CHOICE: Wound (Arm) OR +2 Dmg
              mosEffectText = "MOS 2: Choose Effect";
              mosChoiceData = { hasChoice: true, choiceType: "arm", choiceDmg: 2 };
          }
          else if (skillSuccessCount === 3) { 
              // CHOICE: Wound (Leg) OR +4 Dmg
              mosEffectText = "MOS 3: Choose Effect";
              mosChoiceData = { hasChoice: true, choiceType: "leg", choiceDmg: 4 };
          }
          else if (skillSuccessCount >= 4) { 
              mosDamageBonus = 6; 
              mosEffectText = "<strong style='color:#ff5555'>HEAD SHOT</strong> (+6 DMG)"; 
          }
      }

      // Damage Calculation
      // Note: If user has a choice, we DO NOT add the bonus yet. They must click the button.
      let rawBase = item.system.damage || item.system.dmg || "0";
      let baseDmg = String(rawBase);
      let totalMod = mods.damage + mosDamageBonus;
      
      let finalDmgFormula = baseDmg;
      if (totalMod !== 0) {
          if (baseDmg === "0" || baseDmg === "") finalDmgFormula = String(totalMod);
          else finalDmgFormula = `${baseDmg} ${totalMod > 0 ? "+" : ""} ${totalMod}`;
      }

      let showButton = isSuccess && (finalDmgFormula && finalDmgFormula !== "0");

      // 1. CAPTURE AD VALUE (Ensure it's a number)
      const adValue = Number(item.system.ad) || 0;

      // Render
      const templateData = {
          actorUuid: this.actor.uuid, 
          borderColor: resultColor,
          headerColor: resultColor,
          resultColor: resultColor,
          itemName: item.name.toUpperCase(),
          successTotal: sdTotal,
          tooltip: this._generateTooltip(roll, baseModifier, mods.successDie),
          skillDice: skillDiceData,
          notes: notes.join(" "),
          showDamageButton: showButton,
          dmgFormula: finalDmgFormula,
          
          adValue: adValue, // <--- CRITICAL FIX: Pass AD to template
          
          mos: {
              isSuccess: isSuccess,
              hits: skillSuccessCount,
              effect: mosEffectText,
              ...mosChoiceData 
          }
      };

      const chatContent = await renderTemplate("systems/sla-industries/templates/chat/chat-weapon-rolls.hbs", templateData);

      roll.toMessage({
           speaker: ChatMessage.getSpeaker({ actor: this.actor }),
           content: chatContent
      });
  }

	async _executeEbbRoll(item) {
      const formulaRating = item.system.formulaRating || 7;
      const currentFlux = this.actor.system.stats.flux?.value || 0;
      const fluxCost = 1; // Most formulas cost 1 Flux

      // 1. Check & Consume Flux
      if (currentFlux < fluxCost) { 
          ui.notifications.error("Insufficient FLUX."); 
          return; 
      }
      await this.actor.update({ "system.stats.flux.value": Math.max(0, currentFlux - fluxCost) });

      // 2. Resolve Discipline Rank
      // We need to find the parent Discipline to get the Rank
      const disciplineName = item.system.discipline;
      const statKey = "conc"; // Ebb is usually Concentration based
      const statValue = this.actor.system.stats[statKey]?.total ?? this.actor.system.stats[statKey]?.value ?? 0;
      
      let targetName = disciplineName;
      // Handle short names vs full names if you have a config map
      const ebbDisciplines = CONFIG.SLA?.ebbDisciplines || {};
      for (const [key, label] of Object.entries(ebbDisciplines)) {
          if (key === disciplineName || label === disciplineName) { targetName = label; break; }
      }

      const disciplineItem = this.actor.items.find(i => i.type === 'discipline' && i.name.toLowerCase() === targetName.toLowerCase());
      if (!disciplineItem) { 
          ui.notifications.warn(`Missing Discipline Item: ${targetName}`); 
          return; 
      }

      const rank = disciplineItem.system.rank || 0;
      
      // 3. Modifiers
      let globalMod = 0;
      if (this.actor.system.conditions?.prone) globalMod -= 1;
      if (this.actor.system.conditions?.stunned) globalMod -= 1;
      const penalty = this.actor.system.wounds.penalty || 0;
      
      const modifier = statValue + rank - penalty + globalMod;

      // 4. Roll Formula: 1d10 + (Rank + 1)d10
      const skillDiceCount = rank + 1;
      const rollFormula = `1d10 + ${skillDiceCount}d10`;

      let roll = new Roll(rollFormula);
	  // --- DICE SO NICE: FORCE BLACK SUCCESS DIE ---
		// Target the first term (1d10)
		if (roll.terms.length > 0 && roll.terms[0].constructor.name === "Die") {
          roll.terms[0].options.appearance = {
              foreground: "#FFFFFF", // White Text
              background: "#000000", // Black Body
              edge: "#333333"        // Dark Grey Outline
          };
		}
		// ---------------------------------------------
      await roll.evaluate();

      // 5. Calculate Success (Target Number is the Formula Rating)
      const successRaw = roll.terms[0].results[0].result;
      const successTotal = successRaw + modifier;
      const isBaseSuccess = successTotal >= formulaRating;
      const resultColor = isBaseSuccess ? '#39ff14' : '#f55';

      // 6. Process Skill/Flux Dice
      let skillDiceData = [];
      let skillSuccesses = 0;

      if (roll.terms.length > 2) {
           roll.terms[2].results.forEach(r => {
               let val = r.result + modifier;
               // For Ebb, the TN for skill dice is ALSO the Formula Rating
               let isHit = val >= formulaRating; 
               if (isHit) skillSuccesses++;
               
               skillDiceData.push({
                   raw: r.result,
                   total: val,
                   borderColor: isHit ? "#39ff14" : "#555",
                   textColor: isHit ? "#39ff14" : "#ccc"
               });
           });
      }

      // 7. Determine MOS Effects (Specific to Ebb)
      let mosEffectText = "Standard Success";
      let failureConsequence = "Failed";
      
      const allDiceFailed = (!isBaseSuccess) && (skillSuccesses === 0);
      const isSuccessful = isBaseSuccess || (skillSuccesses >= 1); // Ebb succeeds if EITHER success die OR skill dice hit

      if (isSuccessful) {
          if (skillSuccesses === 2) mosEffectText = "+1 Damage / Effect";
          else if (skillSuccesses === 3) mosEffectText = "+2 Damage / Repeat Ability";
          else if (skillSuccesses >= 4) mosEffectText = "<strong style='color:#39ff14'>CRITICAL:</strong> +4 Dmg | Regain 1 FLUX";
      } else {
          if (allDiceFailed) {
              failureConsequence = "<strong style='color:#ff5555'>SEVERE FAILURE:</strong> -3 HP & -1 Extra FLUX";
              // Auto-apply punishment? Or just warn?
              // await this.actor.update({ 
              //    "system.hp.value": Math.max(0, this.actor.system.hp.value - 3),
              //    "system.stats.flux.value": Math.max(0, this.actor.system.stats.flux.value - 1)
              // });
          }
      }

      // 8. Damage Calculation (For Offensive Formulas)
      let rawBase = item.system.dmg || item.system.damage || "0";
      let baseDmg = String(rawBase);
      let mosDamageBonus = 0;

      // Map MOS to damage if applicable
      if (isSuccessful) {
          if (skillSuccesses === 2) mosDamageBonus = 1;
          if (skillSuccesses === 3) mosDamageBonus = 2;
          if (skillSuccesses >= 4) mosDamageBonus = 4;
      }

      let finalDmgFormula = baseDmg;
      if (baseDmg !== "0" && baseDmg !== "") {
           let sign = mosDamageBonus > 0 ? "+" : "";
           if (mosDamageBonus > 0) finalDmgFormula = `${baseDmg} ${sign} ${mosDamageBonus}`;
      }

      // Show damage button if formula exists AND not "0"
      let showButton = isSuccessful && (finalDmgFormula && finalDmgFormula !== "0");

      // 9. Render Template
      const templateData = {
          borderColor: resultColor,
          headerColor: resultColor,
          resultColor: resultColor,
          itemName: item.name.toUpperCase(),
          successTotal: successTotal,
          tooltip: this._generateTooltip(roll, modifier, 0),
          skillDice: skillDiceData,
          notes: `<strong>Formula Rating:</strong> ${formulaRating}`, 
          showDamageButton: showButton,
          dmgFormula: finalDmgFormula,
          adValue: item.system.ad || 0,
          mos: {
              isSuccess: isSuccessful,
              hits: skillSuccesses,
              effect: isSuccessful ? mosEffectText : failureConsequence
          }
      };

      const chatContent = await renderTemplate("systems/sla-industries/templates/chat/chat-weapon-rolls.hbs", templateData);

      roll.toMessage({
           speaker: ChatMessage.getSpeaker({ actor: this.actor }),
           content: chatContent
      });
  }

  // ... (Existing Drop/Create Logic) ...
  async _onDropItem(event, data) {
    if ( !this.actor.isOwner ) return false;
    const item = await Item.implementation.fromDropData(data);
    const itemData = item.toObject();

    // Helper: Handle Skill Array
    const processSkills = async (skillsArray, sourceFlag) => {
        if (!skillsArray || !Array.isArray(skillsArray) || skillsArray.length === 0) return;
        const toCreate = [];
        const toUpdate = [];
        for (const skillData of skillsArray) {
            const existing = this.actor.items.find(i => i.name.toLowerCase() === skillData.name.toLowerCase() && i.type === skillData.type);
            if (existing) {
                const currentRank = existing.system.rank || 0;
                toUpdate.push({ _id: existing.id, "system.rank": currentRank + 1 });
                ui.notifications.info(`Upgraded ${existing.name} to Rank ${currentRank + 1}`);
            } else {
                const newSkill = foundry.utils.deepClone(skillData);
                delete newSkill._id;
                if (!newSkill.system.rank) newSkill.system.rank = 1;
                if (!newSkill.flags) newSkill.flags = {};
                if (!newSkill.flags["sla-industries"]) newSkill.flags["sla-industries"] = {};
                newSkill.flags["sla-industries"][sourceFlag] = true;
                toCreate.push(newSkill);
            }
        }
        if (toCreate.length > 0) await this.actor.createEmbeddedDocuments("Item", toCreate);
        if (toUpdate.length > 0) await this.actor.updateEmbeddedDocuments("Item", toUpdate);
    };

    if (itemData.type === "species") {
        const existing = this.actor.items.find(i => i.type === "species");
        if (existing) await existing.delete();
        await this.actor.createEmbeddedDocuments("Item", [itemData]);
        await this.actor.update({ "system.bio.species": itemData.name });
        if (itemData.system.stats) {
            const updates = {};
            for (const [key, val] of Object.entries(itemData.system.stats)) updates[`system.stats.${key}.value`] = val.min;
            await this.actor.update(updates);
        }
        await processSkills(itemData.system.skills, "fromSpecies");
        return;
    }
    
    if (itemData.type === "package") {
        const reqs = itemData.system.requirements || {};
        for (const [key, minVal] of Object.entries(reqs)) {
            const actorStat = this.actor.system.stats[key]?.value || 0;
            if (actorStat < minVal) { ui.notifications.error(`Req: ${key.toUpperCase()} must be ${minVal}+`); return; }
        }
        const existing = this.actor.items.find(i => i.type === "package");
        if (existing) await existing.delete();
        await this.actor.createEmbeddedDocuments("Item", [itemData]);
        await this.actor.update({ "system.bio.package": itemData.name });
        await processSkills(itemData.system.skills, "fromPackage");
        return;
    }

    return super._onDropItem(event, data);
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;
    const name = `New ${type.capitalize()}`;
    const itemData = { name: name, type: type };
    return await Item.create(itemData, {parent: this.actor});
  }
  
  // --- HELPER: MELEE LOGIC ---
  _applyMeleeModifiers(form, strValue, mods) {
      // STR Bonus
      if (strValue >= 7) mods.damage += 4;
      else if (strValue === 6) mods.damage += 2;
      else if (strValue === 5) mods.damage += 1;

      // Checkboxes (Use ?.checked)
      if (form.charging?.checked) { mods.successDie -= 1; mods.autoSkillSuccesses += 1; }
      if (form.targetCharged?.checked) mods.successDie -= 1;
      if (form.sameTarget?.checked) mods.successDie += 1;
      if (form.breakOff?.checked) mods.successDie += 1;
      if (form.natural?.checked) mods.successDie += 1;
      if (form.prone?.checked) mods.successDie += 2;

      // Defense Inputs (Use ?.value)
      mods.allDice -= (Number(form.combatDef?.value) || 0); 
      mods.allDice -= ((Number(form.acroDef?.value) || 0) * 2);
  }

  // --- HELPER: RANGED LOGIC ---
  async _applyRangedModifiers(item, form, mods, notes, flags) {
      // Use ?.value. If mode is missing, default to "single"
      const mode = form.mode?.value || "single";
      
      const parseSlashVal = (valStr, index) => {
          const parts = String(valStr).split('/');
          if (parts.length === 1) return Number(parts[0]) || 0;
          const val = parts[index] !== undefined ? parts[index] : parts[parts.length - 1];
          return Number(val) || 0;
      };

      // 1. Fire Modes
      let recoilIndex = 0;
      let ammoCost = 1;

      switch (mode) {
          case "burst":
              recoilIndex = 1; ammoCost = 3; mods.damage += 2; 
              notes.push("Burst."); flags.rerollSD = true;
              break;
          case "auto":
              recoilIndex = 2; ammoCost = 10; mods.damage += 4; 
              notes.push("Full Auto."); flags.rerollAll = true;
              break;
          case "suppress":
              recoilIndex = 2; ammoCost = 20; mods.autoSkillSuccesses += 2; mods.damage += 4; 
              notes.push("Suppressive."); flags.rerollAll = true;
              break;
      }

      // 2. Recoil
      const recoilVal = parseSlashVal(item.system.recoil, recoilIndex);
      if (recoilVal > 0) mods.successDie -= recoilVal;

      // 3. Ammo Consumption
      const currentAmmo = item.system.ammo || 0;
      if (currentAmmo < ammoCost) { 
          ammoCost = currentAmmo; 
          mods.damage -= 2; 
          notes.push("Low Ammo (-2 DMG)."); 
      }
      await item.update({ "system.ammo": currentAmmo - ammoCost });

      // 4. Other Ranged Inputs (Use ?.value or ?.checked)
      mods.successDie += (Number(form.cover?.value) || 0);
      mods.successDie += (Number(form.dual?.value) || 0);
      
      if (form.targetMoved?.checked) mods.successDie -= 1;
      if (form.blind?.checked) mods.allDice -= 1;
      // Note: Prone exists in both Melee and Ranged in your HBS, so this is safe, but ?.checked is safer
      if (form.prone?.checked) mods.successDie += 1;
      
      if (form.longRange?.checked) { 
          mods.rank -= 1; 
          notes.push("Long Range."); 
      }
      
      if (mode !== "suppress") {
          const aimVal = form.aiming?.value;
          if (aimVal === "sd") mods.successDie += 1;
          if (aimVal === "skill") mods.autoSkillSuccesses += 1;
      }
  }
  
  // --- HELPERS: HTML GENERATION ---
  _generateTooltip(roll, baseModifier, successDieMod) {
      let html = `<div class="dice-tooltip" style="display:none; margin-top:10px; padding-top:5px; border-top:1px solid #444; font-size:0.8em; color:#ccc;">`;
      
      // Safety check for terms
      if (!roll.terms || roll.terms.length === 0) return "";

      const sdRaw = roll.terms[0].results[0]?.result || 0;
      const sdTotal = sdRaw + baseModifier + successDieMod;
      
      html += `<div><strong>Success Die:</strong> Raw ${sdRaw} + Base ${baseModifier} + SD Mod ${successDieMod} = <strong>${sdTotal}</strong></div>`;
      
      if (roll.terms.length > 2) {
          html += `<div style="border-top:1px dashed #444; margin-top:2px;"><strong>Skill Dice (Base ${baseModifier}):</strong></div>`;
          html += `<div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:2px;">`;
          
          // Iterate over Skill Dice results
          roll.terms[2].results.forEach(r => {
             html += `<span style="background:#222; border:1px solid #555; padding:1px 4px;">${r.result} + ${baseModifier} = <strong>${r.result+baseModifier}</strong></span>`;
          });
          html += `</div>`;
      }
      html += `</div>`;
      return html;
  }
}