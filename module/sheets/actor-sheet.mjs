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

    context.system.stats = context.system.stats || {};
    context.system.ratings = context.system.ratings || {};
    context.system.wounds = context.system.wounds || {};
    context.system.move = context.system.move || {}; 
    context.system.conditions = context.system.conditions || {};

    if (actorData.type == 'character' || actorData.type == 'npc') {
      this._prepareItems(context);
    }

    context.rollData = context.actor.getRollData();

    const speciesList = CONFIG.SLA?.speciesStats || {};
    context.speciesOptions = Object.keys(speciesList).reduce((acc, key) => {
        acc[key] = speciesList[key].label;
        return acc;
    }, {});

    context.speciesItem = this.actor.items.find(i => i.type === "species");
    context.packageItem = this.actor.items.find(i => i.type === "package");

    context.enrichedBiography = await TextEditor.enrichHTML(this.actor.system.biography, {async: true, relativeTo: this.actor});
    context.enrichedAppearance = await TextEditor.enrichHTML(this.actor.system.appearance, {async: true, relativeTo: this.actor});
    context.enrichedNotes = await TextEditor.enrichHTML(this.actor.system.notes, {async: true, relativeTo: this.actor});

    return context;
  }

  _prepareItems(context) {
    const gear = [];
    const traits = [];
    const ebbFormulas = [];
    const disciplines = [];
    
    const skillsByStat = {
        "str": { label: "STR", items: [] },
        "dex": { label: "DEX", items: [] },
        "know": { label: "KNOW", items: [] },
        "conc": { label: "CONC", items: [] },
        "cha": { label: "CHA", items: [] },
        "cool": { label: "COOL", items: [] },
        "other": { label: "OTHER", items: [] }
    };

    for (let i of context.items) {
      i.img = i.img || DEFAULT_TOKEN;
      
      // INCLUDES MAGAZINE IN GEAR LIST
      if (i.type === 'item' || i.type === 'weapon' || i.type === 'armor' || i.type === 'drug' || i.type === 'magazine') {
          gear.push(i);
      }
      else if (i.type === 'trait') traits.push(i);
      else if (i.type === 'ebbFormula') ebbFormulas.push(i);
      else if (i.type === 'discipline') disciplines.push(i);
      
      else if (i.type === 'skill') {
          const stat = (i.system.stat || "dex").toLowerCase();
          if (skillsByStat[stat]) skillsByStat[stat].items.push(i);
          else skillsByStat["other"].items.push(i);
      }
    }

    const sortFn = (a, b) => a.name.localeCompare(b.name);
    
    gear.sort(sortFn);
    traits.sort(sortFn);
    ebbFormulas.sort(sortFn);
    disciplines.sort(sortFn);
    
    for (const key in skillsByStat) {
        skillsByStat[key].items.sort(sortFn);
    }

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

    context.gear = gear;
    context.traits = traits;
    context.disciplines = nestedDisciplines;
    context.skillsByStat = skillsByStat;
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

    if (dataset.rollType === 'item') {
        const itemId = $(element).parents('.item').data('itemId');
        const item = this.actor.items.get(itemId);
        if (item.type === 'weapon') {
            const skillKey = item.system.skill || "";
            const isMelee = ["melee", "unarmed", "thrown"].includes(skillKey);
            this._renderAttackDialog(item, isMelee);
        } else if (item.type === 'ebbFormula') {
            this._executeEbbRoll(item);
        } else {
            item.sheet.render(true);
        }
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
      // 1. SETUP & INPUTS
      const form = html[0].querySelector("form");
      if (!form) return;

      const statKey = "dex"; 
      const statValue = this.actor.system.stats[statKey]?.total ?? this.actor.system.stats[statKey]?.value ?? 0;
      const strValue = Number(this.actor.system.stats.str?.total ?? this.actor.system.stats.str?.value ?? 0); 

      const skillKey = item.system.skill; 
      let rank = 0;
      const combatSkills = CONFIG.SLA?.combatSkills || {};
      if (skillKey && combatSkills[skillKey]) {
          const targetName = combatSkills[skillKey];
          const skillItem = this.actor.items.find(i => i.type === 'skill' && i.name.toLowerCase() === targetName.toLowerCase());
          if (skillItem) rank = skillItem.system.rank;
      }

      // Safe Input Reading
      let mods = {
          successDie: 0,
          allDice: Number(form.modifier?.value) || 0, 
          rank: 0,
          damage: 0,
          autoSkillSuccesses: 0
      };

      let notes = []; 
      let flags = { rerollSD: false, rerollAll: false };

      // 2. CONDITIONS
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

      // 3. APPLY MODIFIERS
      if (isMelee) {
          this._applyMeleeModifiers(form, strValue, mods);
      } else {
          await this._applyRangedModifiers(item, form, mods, notes, flags);
      }

      const penalty = this.actor.system.wounds.penalty || 0;
      mods.allDice -= penalty;

      // 4. ROLL EVALUATION
      const baseModifier = statValue + rank + mods.allDice; 
      const skillDiceCount = Math.max(0, rank + 1 + mods.rank);
      
      const rollFormula = `1d10 + ${skillDiceCount}d10`;
      let roll = new Roll(rollFormula);
      await roll.evaluate();

      // 5. CALCULATE RESULTS
      const sdRaw = roll.terms[0].results[0].result;
      const sdTotal = sdRaw + baseModifier + mods.successDie;
      const isSuccess = sdTotal > 10;
      const resultColor = isSuccess ? '#39ff14' : '#f55';

      // Build Skill Dice HTML Manually (The Old Way)
      let skillDiceHtml = "";
      if (roll.terms.length > 2) {
           roll.terms[2].results.forEach(r => {
               let val = r.result + baseModifier;
               let border = val >= 10 ? "1px solid #39ff14" : "1px solid #555";
               let color = val >= 10 ? "#39ff14" : "#ccc"; // Added color logic
               skillDiceHtml += `<div style="display:flex; flex-direction:column; align-items:center; margin:2px;"><span style="border:${border}; color:${color}; padding:2px 8px; border-radius:4px; font-weight:bold;">${val}</span><span style="font-size:0.7em; color:#555;">(${r.result})</span></div>`;
           });
      }

      // Add Auto-Successes (if any)
      for(let i=0; i < mods.autoSkillSuccesses; i++) {
          skillDiceHtml += `<div style="display:flex; flex-direction:column; align-items:center; margin:2px;"><span style="border:1px solid #39ff14; color:#39ff14; padding:2px 8px; border-radius:4px; font-weight:bold;">Auto</span><span style="font-size:0.7em; color:#555;">(-)</span></div>`;
      }

      // Generate the standard tooltip HTML
      const tooltipHtml = this._generateTooltip(roll, baseModifier, mods.successDie);
      
      // Prepare Damage Data
      let finalDmgFormula = item.system.dmg;
      if (mods.damage !== 0 && finalDmgFormula) {
          finalDmgFormula = `${item.system.dmg} + ${mods.damage}`;
      }
      
      // Optional: Damage Button HTML (Only if success and damage exists)
      let damageBtnHtml = "";
      if (isSuccess && item.system.dmg && item.system.dmg !== "0") {
          damageBtnHtml = `
          <button class="roll-damage" data-damage="${finalDmgFormula}" data-ad="${item.system.ad || 0}" data-weapon="${item.name}" style="background:#300; color:#8a2be2; border:1px solid #8a2be2; cursor:pointer; width: 100%; margin-top:5px;">
              <i class="fas fa-tint"></i> ROLL DAMAGE (${finalDmgFormula})
          </button>`;
      }

      // 6. RENDER MESSAGE (Using Inline HTML String)
      roll.toMessage({
           speaker: ChatMessage.getSpeaker({ actor: this.actor }),
           content: `
           <div style="background: #222; border: 1px solid ${resultColor}; color: #eee; padding: 5px; font-family:'Roboto Condensed',sans-serif;">
               <h3 style="color:${resultColor}; border-bottom:1px solid #555; margin:0 0 5px 0;">${item.name.toUpperCase()}</h3>
               <div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.3); padding:5px; margin-bottom:5px;">
                   <span style="font-size:0.9em; color:#aaa;">SUCCESS DIE</span>
                   <span class="roll-toggle" style="font-size:1.5em; font-weight:bold; color:${resultColor}; cursor:pointer;">${sdTotal}</span>
               </div>
               
               ${tooltipHtml}
               
               <div style="display:flex; flex-wrap:wrap;">${skillDiceHtml}</div>
               
               ${notes.length > 0 ? `<div style="margin-top:5px; font-size:0.8em; border-top:1px dashed #555; padding-top:2px;">${notes.join(" ")}</div>` : ""}
               
               ${damageBtnHtml}
           </div>`
      });
  }

  async _executeEbbRoll(item) {
      const formulaRating = item.system.formulaRating || 7;
      const currentFlux = this.actor.system.stats.flux?.value || 0;
      const fluxCost = 1;

      if (currentFlux < fluxCost) { ui.notifications.error("Insufficient FLUX."); return; }
      await this.actor.update({ "system.stats.flux.value": Math.max(0, currentFlux - fluxCost) });

      const disciplineName = item.system.discipline;
      const statKey = "conc"; 
      const statValue = this.actor.system.stats[statKey]?.total ?? this.actor.system.stats[statKey]?.value ?? 0;
      
      let targetName = disciplineName;
      const ebbDisciplines = CONFIG.SLA?.ebbDisciplines || {};
      for (const [key, label] of Object.entries(ebbDisciplines)) {
          if (key === disciplineName || label === disciplineName) { targetName = label; break; }
      }

      const disciplineItem = this.actor.items.find(i => i.type === 'discipline' && i.name.toLowerCase() === targetName.toLowerCase());
      if (!disciplineItem) { ui.notifications.warn(`Missing Discipline: ${targetName}`); return; }

      const rank = disciplineItem.system.rank || 0;
      const effectiveName = disciplineItem.name;

      let globalMod = 0;
      if (this.actor.system.conditions?.prone) globalMod -= 1;
      if (this.actor.system.conditions?.stunned) globalMod -= 1;
      const penalty = this.actor.system.wounds.penalty || 0;
      const modifier = statValue + rank - penalty + globalMod;

      // FIXED RULE: 1d10 + (Rank + 1)d10
      const skillDiceCount = rank + 1;
      let formula = `1d10 + ${skillDiceCount}d10`;

      let roll = new Roll(formula);
      await roll.evaluate();

      const successRaw = roll.terms[0].results[0].result;
      const successTotal = successRaw + modifier;
      const isBaseSuccess = successTotal >= formulaRating;
      const resultColor = isBaseSuccess ? '#39ff14' : '#f55';

      let skillSuccesses = 0;
      let skillDiceHtml = "";
      
      if (roll.terms.length > 2) {
           roll.terms[2].results.forEach(r => {
               const val = r.result + modifier;
               const isSuccess = val >= formulaRating;
               if (isSuccess) skillSuccesses++;
               const border = isSuccess ? "1px solid #8a2be2" : "1px solid #555";
               const color = isSuccess ? "#39ff14" : "#aaa";
               skillDiceHtml += `<div style="display:flex; flex-direction:column; align-items:center; margin:2px;"><span style="border:${border}; padding:2px 8px; border-radius:4px; font-weight:bold; color:${color};">${val}</span><span style="font-size:0.7em; color:#555;">(${r.result})</span></div>`;
           });
      }

      let mosEffectText = "No effect.";
      let failureConsequence = "";
      const allDiceFailed = (!isBaseSuccess) && (skillSuccesses === 0);
      const isSuccessful = isBaseSuccess || (skillSuccesses >= 1);

      if (isSuccessful) {
          if (skillSuccesses === 2) mosEffectText = "+1 Damage";
          if (skillSuccesses === 3) mosEffectText = "+2 Damage / Repeat Ability";
          if (skillSuccesses >= 4) mosEffectText = "+4 Damage | Regain 1 FLUX"; 
      } else {
          if (allDiceFailed) {
              failureConsequence = "🤯 SEVERE FAILURE: -3 HP & -1 FLUX";
              await this.actor.update({ 
                  "system.hp.value": Math.max(0, this.actor.system.hp.value - 3),
                  "system.stats.flux.value": Math.max(0, this.actor.system.stats.flux.value - 1)
              });
          } else {
              failureConsequence = "Failed.";
          }
      }

      const dmgFormula = item.system.dmg || "0";
      const adValue = item.system.ad || 0;
      const penaltyHtml = penalty > 0 ? `<span style="color:#f55;"> (Wounds: -${penalty})</span>` : "";
      const tooltipHtml = this._generateTooltip(roll, modifier, 0);

      roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: `
            <div style="background: #111; border: 1px solid #8a2be2; color: #eee; padding: 5px; font-family:'Roboto Condensed',sans-serif;">
                <h3 style="color:#8a2be2; margin:0; border-bottom:1px solid #8a2be2;">${item.name.toUpperCase()} (FR: ${formulaRating})</h3>
                <div style="font-size: 0.8em; color: #aaa;">${effectiveName} (${rank}) | CONC ${statValue} ${penaltyHtml}</div>
                <div style="display:flex; justify-content:space-between; align-items:center; padding:5px; margin-bottom:5px;">
                    <span style="font-size:0.9em; font-weight:bold; color:#fff;">SUCCESS DIE</span>
                    <span class="roll-toggle" style="font-size:1.5em; font-weight:bold; color:${resultColor}; cursor:pointer;">${successTotal}</span>
                </div>
                ${tooltipHtml}
                <div style="margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between;"><span style="font-size:0.8em; color:#aaa;">FLUX DICE</span><span style="font-size:0.9em; font-weight:bold; color:#39ff14;">${skillSuccesses} Successes</span></div>
                    <div style="display:flex; flex-wrap:wrap; margin-top:5px;">${skillDiceHtml}</div>
                </div>
                <div style="font-size: 0.9em; padding: 5px; background: ${isSuccessful ? '#003000' : '#300000'}; border: 1px solid ${isSuccessful ? '#39ff14' : '#f00'};">
                    ${isSuccessful ? `✅ <strong>Success!</strong><br>${mosEffectText}` : `❌ <strong>Failure.</strong><br>${failureConsequence}`}
                </div>
                ${isSuccessful && dmgFormula !== "0" ? `
                <button class="roll-damage" data-damage="${dmgFormula}" data-ad="${adValue}" data-weapon="${item.name}" style="background:#300; color:#8a2be2; border:1px solid #8a2be2; cursor:pointer; width: 100%; margin-top:5px;">
                    <i class="fas fa-tint"></i> ROLL DAMAGE (${dmgFormula})
                </button>` : ""}
            </div>`
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