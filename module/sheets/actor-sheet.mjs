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

    // Initialize Objects
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
    const skills = [];
    const traits = [];
    const ebbFormulas = [];
    const disciplines = [];

    for (let i of context.items) {
      i.img = i.img || DEFAULT_TOKEN;
      if (i.type === 'item' || i.type === 'weapon' || i.type === 'armor' || i.type === 'drug') gear.push(i);
      else if (i.type === 'skill') skills.push(i);
      else if (i.type === 'trait') traits.push(i);
      else if (i.type === 'ebbFormula') ebbFormulas.push(i);
      else if (i.type === 'discipline') disciplines.push(i);
    }

    const sortFn = (a, b) => a.name.localeCompare(b.name);
    gear.sort(sortFn);
    skills.sort(sortFn);
    traits.sort(sortFn);
    ebbFormulas.sort(sortFn);
    disciplines.sort(sortFn);

    // Nest Formulas
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
    context.skills = skills;
    context.traits = traits;
    context.disciplines = nestedDisciplines; 
  }

  /* -------------------------------------------- */
  /* EVENT LISTENERS                             */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

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

    html.find('.item-reload').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.update({ "system.ammo": (item.system.maxAmmo || 0) });
    });

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
        if (isChecked && !isBleeding) {
             await this.actor.toggleStatusEffect("bleeding", { active: true });
        } else if (!isChecked) {
             const newState = { ...this.actor.system.wounds, [field.split('.').pop()]: false }; 
             let activeWounds = Object.values(newState).filter(v => v === true).length;
             if (activeWounds === 0 && isBleeding) await this.actor.toggleStatusEffect("bleeding", { active: false });
        }
    });
  }

  /* -------------------------------------------- */
  /* ROLL HANDLERS                               */
  /* -------------------------------------------- */

  async _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    let globalMod = 0;
    if (this.actor.system.conditions?.prone) globalMod -= 1;
    if (this.actor.system.conditions?.stunned) globalMod -= 1;

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

        let penaltyHtml = "";
        if (penalty > 0) penaltyHtml += `<div style="font-size:0.8em; color:#f55;">Wound Penalty: -${penalty}</div>`;
        if (globalMod !== 0) penaltyHtml += `<div style="font-size:0.8em; color:#aaa;">Conditions: ${globalMod}</div>`;

        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `
            <div style="background:#222; border:1px solid #39ff14; color:#eee; padding:5px; font-family:'Roboto Condensed',sans-serif;">
                <h3 style="color:#39ff14; border-bottom:1px solid #555; margin:0 0 5px 0;">${statLabel} CHECK</h3>
                ${penaltyHtml}
                <div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.3); padding:5px;">
                    <span style="font-size:0.9em; color:#aaa;">SUCCESS DIE</span>
                    <div style="text-align:right;">
                         <span style="font-size:1.5em; font-weight:bold; color:${finalTotal > 10 ? '#39ff14' : '#f55'};">${finalTotal}</span>
                         <span style="font-size:0.8em; color:#777;">(Roll ${rawDie} + Mod ${finalMod})</span>
                    </div>
                </div>
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

  // --- HELPER: RENDER WEAPON DIALOG (RESTORED) ---
  _renderAttackDialog(item, isMelee) {
      const recoil = item.system.recoil || 0;
      let dialogContent = `
        <form style="color:#eee; font-family:'Roboto Condensed',sans-serif;">
            <div class="form-group" style="margin-bottom:5px; display:flex; justify-content:space-between;">
                <label>Generic Modifier (+/-)</label>
                <input type="number" name="modifier" value="0" style="background:#333; color:#fff; border:1px solid #555; text-align:center; width:50px; float:right;"/>
            </div>
            <div class="form-group" style="margin-bottom:5px;">
                <label style="color:#39ff14;"><input type="checkbox" name="spendLuck"/> Spend Luck (Reroll)</label>
            </div>
            <hr style="border:1px solid #444;">
      `;

      if (isMelee) {
          // MELEE OPTIONS RESTORED
          dialogContent += `
            <h3 style="border-bottom:1px solid #555; color:#39ff14; margin-bottom:5px;">Melee Modifiers</h3>
            <div style="display:grid; grid-template-columns: 1fr; gap: 5px;">
                <div><input type="checkbox" name="charging"/> Charging (-1 SD, +1 Auto)</div>
                <div><input type="checkbox" name="targetCharged"/> Target Charged (-1 SD)</div>
                <div><input type="checkbox" name="sameTarget"/> Same Target (+1 SD)</div>
                <div><input type="checkbox" name="breakOff"/> Break Off (+1 SD)</div>
                <div><input type="checkbox" name="natural"/> Natural Wpn (+1 SD)</div>
                <div><input type="checkbox" name="prone"/> Target Prone (+2 SD)</div>
                <div class="form-group" style="margin-top:5px; display:flex; justify-content:space-between;">
                    <label>Combat Def</label>
                    <input type="number" name="combatDef" value="0" style="width:50px; background:#333; color:#fff; text-align:center;"/>
                </div>
                <div class="form-group" style="display:flex; justify-content:space-between;">
                    <label>Acrobatic Def</label>
                    <input type="number" name="acroDef" value="0" style="width:50px; background:#333; color:#fff; text-align:center;"/>
                </div>
            </div>`;
      } else {
          // RANGED OPTIONS RESTORED
          dialogContent += `
            <h3 style="border-bottom:1px solid #555; color:#39ff14; margin-bottom:5px;">Ranged Modifiers</h3>
            <div style="font-size:0.8em; color:#aaa; margin-bottom:5px;">Base Recoil: -${recoil} SD</div>
            <div style="display:grid; grid-template-columns: 1fr; gap: 5px;">
                <div class="form-group" style="display:flex; justify-content:space-between;">
                    <label>Target Cover</label>
                    <select name="cover" style="background:#333; color:#fff; width:120px;">
                        <option value="0">None</option>
                        <option value="-1">Light (-1 SD)</option>
                        <option value="-2">Heavy (-2 SD)</option>
                    </select>
                </div>
                <div class="form-group" style="display:flex; justify-content:space-between;">
                    <label>Ammo Type</label>
                    <select name="ammo" style="background:#333; color:#fff; width:120px;">
                        <option value="std">Standard</option>
                        <option value="he">HE (+1)</option>
                        <option value="ap">AP (-2 PV)</option>
                        <option value="slug">Slug (+1)</option>
                    </select>
                </div>
                <div class="form-group" style="display:flex; justify-content:space-between;">
                    <label>Firing Mode</label>
                    <select name="mode" style="background:#333; color:#fff; width:120px;">
                        <option value="single">Single</option>
                        <option value="burst">Burst (+2)</option>
                        <option value="auto">Auto (+4)</option>
                        <option value="suppress">Suppress (+4)</option>
                    </select>
                </div>
                <div class="form-group" style="display:flex; justify-content:space-between;">
                    <label>Aiming</label>
                    <select name="aiming" style="background:#333; color:#fff; width:120px;">
                        <option value="none">None</option>
                        <option value="sd">+1 SD</option>
                        <option value="skill">+1 Skill</option>
                    </select>
                </div>
                <div class="form-group" style="display:flex; justify-content:space-between;">
                    <label>Dual Wield</label>
                    <select name="dual" style="background:#333; color:#fff; width:120px;">
                        <option value="0">No</option>
                        <option value="-2">Same Target</option>
                        <option value="-4">Diff Target</option>
                    </select>
                </div>
                <hr style="border: 1px solid #444; width:100%;">
                <div><input type="checkbox" name="targetMoved"/> Target Moved Fast (-1 SD)</div>
                <div><input type="checkbox" name="blind"/> Firing Blind (-1 All Dice)</div>
                <div><input type="checkbox" name="longRange"/> Long Range (-1 Skill Die)</div>
                <div><input type="checkbox" name="prone"/> Target Prone (+1 SD)</div>
            </div>`;
      }
      dialogContent += `</form>`;

      new Dialog({
          title: `Attack: ${item.name}`,
          content: dialogContent,
          buttons: { roll: { label: "ROLL", callback: (html) => this._processWeaponRoll(item, html, isMelee) } },
          default: "roll"
      }, { classes: ["sla-dialog", "sla-sheet"] }).render(true);
  }

// --- ACTION: PROCESS WEAPON ROLL ---
  async _processWeaponRoll(item, html, isMelee) {
      const form = html[0].querySelector("form");
      const genericMod = Number(form.modifier.value) || 0;
      
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

      let successDieMod = 0; 
      let allDiceMod = genericMod;
      
      // Global Modifiers
      let globalMod = 0;
      if (this.actor.system.conditions?.prone) globalMod -= 1;
      if (this.actor.system.conditions?.stunned) globalMod -= 1;
      allDiceMod += globalMod;

      let autoSkillSuccesses = 0; 
      let rankMod = 0; 
      let damageBonus = 0; // STR / ROF / Ammo bonuses
      let armorPen = 0;
      let effectNote = "";

      // Check Luck Reroll
      let rerollSuccessDie = false;
      let rerollAll = false;
      if (form.spendLuck && form.spendLuck.checked) {
          const currentLuck = this.actor.system.stats.luck?.value || 0;
          if (currentLuck > 0) {
              rerollAll = true; 
              await this.actor.update({"system.stats.luck.value": currentLuck - 1});
              effectNote += "<strong style='color:#39ff14'>Luck Used. </strong>";
          } else { ui.notifications.warn("No Luck!"); }
      }

      const parseSlashVal = (valStr, index) => {
          const parts = String(valStr).split('/');
          if (parts.length === 1) return Number(parts[0]) || 0;
          const val = parts[index] !== undefined ? parts[index] : parts[parts.length - 1];
          return Number(val) || 0;
      };

      if (isMelee) {
          if (strValue >= 7) damageBonus += 4;
          else if (strValue === 6) damageBonus += 2;
          else if (strValue === 5) damageBonus += 1;

          if (form.charging.checked) { successDieMod -= 1; autoSkillSuccesses += 1; }
          if (form.targetCharged.checked) { successDieMod -= 1; }
          if (form.sameTarget.checked) { successDieMod += 1; }
          if (form.breakOff.checked) { successDieMod += 1; }
          if (form.natural.checked) { successDieMod += 1; }
          if (form.prone.checked) { successDieMod += 2; }
          
          allDiceMod -= (Number(form.combatDef.value) || 0); 
          allDiceMod -= (Number(form.acroDef.value) || 0) * 2; 
      } else {
          const mode = form.mode.value;
          let recoilIndex = 0;
          let ammoCost = 1;

          if (mode === "burst") { recoilIndex = 1; ammoCost = 3; damageBonus += 2; effectNote += "Burst. "; rerollSuccessDie = true; }
          else if (mode === "auto") { recoilIndex = 2; ammoCost = 10; damageBonus += 4; effectNote += "Full Auto. "; rerollAll = true; }
          else if (mode === "suppress") { 
              recoilIndex = 2; ammoCost = 20; autoSkillSuccesses += 2; damageBonus += 4; 
              effectNote += "Suppressive. "; 
              const supportSkill = this.actor.items.find(i => i.type === 'skill' && i.name.toLowerCase() === 'support weapons');
              rank = supportSkill ? supportSkill.system.rank : 0;
          }

          const recoilVal = parseSlashVal(item.system.recoil, recoilIndex);
          if (recoilVal > 0) successDieMod -= recoilVal;

          const currentAmmo = item.system.ammo || 0;
          if (currentAmmo < ammoCost) { ammoCost = currentAmmo; damageBonus -= 2; effectNote += "Low Ammo (-2 DMG). "; }
          await item.update({ "system.ammo": currentAmmo - ammoCost });

          const ammo = form.ammo.value;
          if (ammo === "he") { damageBonus += 1; effectNote += "HE. "; }
          if (ammo === "ap") { armorPen = 2; effectNote += "AP. "; }
          if (ammo === "slug") { damageBonus += 1; effectNote += "Slug. "; }
          
          const cover = Number(form.cover.value) || 0;
          successDieMod += cover;
          const dual = Number(form.dual.value) || 0;
          successDieMod += dual;

          const aiming = form.aiming.value;
          if (mode !== "suppress") {
              if (aiming === "sd") successDieMod += 1;
              if (aiming === "skill") autoSkillSuccesses += 1;
          }

          if (form.targetMoved.checked) successDieMod -= 1;
          if (form.blind.checked) allDiceMod -= 1;
          if (form.prone.checked) successDieMod += 1;
          if (form.longRange.checked) { rankMod -= 1; effectNote += "Long Range. "; }
      }

      const penalty = this.actor.system.wounds.penalty || 0;
      allDiceMod -= penalty;

      const baseModifier = statValue + rank + allDiceMod; 
      let effectiveRank = Math.max(0, rank + rankMod); 
      let formula = "1d10";
      if (effectiveRank > 0) formula += ` + ${effectiveRank}d10`;

      let roll = new Roll(formula);
      await roll.evaluate();

      if (rerollSuccessDie) {
          const sdVal = roll.terms[0].results[0].result + baseModifier + successDieMod;
          if (sdVal < 10) {
              let newRoll = new Roll(formula); await newRoll.evaluate();
              roll = newRoll; 
          }
      }
      if (rerollAll) {
           const sdVal = roll.terms[0].results[0].result + baseModifier + successDieMod;
           if (sdVal < 10) {
               let newRoll = new Roll(formula); await newRoll.evaluate();
               roll = newRoll;
           }
      }

      const successRaw = roll.terms[0].results[0].result;
      const successTotal = successRaw + baseModifier + successDieMod;

      let mosCount = autoSkillSuccesses; 
      let skillDiceHtml = "";
      if (effectiveRank > 0 && roll.terms.length > 2) {
           roll.terms[2].results.forEach(r => {
               let val = r.result + baseModifier;
               let isSuccess = val >= 10;
               if (isSuccess) mosCount++;
               let border = isSuccess ? "1px solid #39ff14" : "1px solid #555";
               skillDiceHtml += `<div style="display:flex; flex-direction:column; align-items:center; margin:2px;"><span style="border:${border}; padding:2px 8px; border-radius:4px; font-weight:bold;">${val}</span><span style="font-size:0.7em; color:#555;">(${r.result})</span></div>`;
           });
      }
      if (autoSkillSuccesses > 0) skillDiceHtml += `<div style="display:flex; flex-direction:column; align-items:center; margin:2px;"><span style="border:1px solid #39ff14; background:#39ff14; color:#000; padding:2px 8px; border-radius:4px; font-weight:bold;">+${autoSkillSuccesses}</span><span style="font-size:0.7em; color:#aaa;">(Auto)</span></div>`;

      const ad = item.system.ad || 0;
      const baseDamage = item.system.damage || "0";

      // --- MOS CHOICE LOGIC ---
      let buttonsHtml = "";
      
      const getFormula = (extra) => {
          const total = damageBonus + extra; // Combine Static Modifiers + MoS Modifier
          return total > 0 ? `${baseDamage} + ${total}` : baseDamage;
      };

      if (mosCount === 2) {
          // Choice: +2 DMG OR Hit Arm (+0 DMG)
          buttonsHtml += `
          <button class="roll-damage" data-damage="${getFormula(2)}" data-ad="${ad}" data-weapon="${item.name}" style="background:#300; color:#f88; border:1px solid #a00; margin-bottom:4px;">
              <i class="fas fa-crosshairs"></i> <strong>+2 DMG</strong> (Torso)
          </button>
          <button class="roll-damage" data-damage="${getFormula(0)}" data-ad="${ad}" data-weapon="${item.name}" style="background:#222; color:#ccc; border:1px solid #555;">
              <i class="fas fa-bullseye"></i> <strong>Hit Arm</strong> (No Bonus)
          </button>`;
      } else if (mosCount === 3) {
          // Choice: +4 DMG OR Hit Leg (+0 DMG)
          buttonsHtml += `
          <button class="roll-damage" data-damage="${getFormula(4)}" data-ad="${ad}" data-weapon="${item.name}" style="background:#300; color:#f88; border:1px solid #a00; margin-bottom:4px;">
              <i class="fas fa-crosshairs"></i> <strong>+4 DMG</strong> (Torso)
          </button>
          <button class="roll-damage" data-damage="${getFormula(0)}" data-ad="${ad}" data-weapon="${item.name}" style="background:#222; color:#ccc; border:1px solid #555;">
              <i class="fas fa-bullseye"></i> <strong>Hit Leg</strong> (No Bonus)
          </button>`;
      } else if (mosCount >= 4) {
          // MoS 4: +6 DMG AND Head Shot (No choice, just awesome)
          buttonsHtml += `
          <button class="roll-damage" data-damage="${getFormula(6)}" data-ad="${ad}" data-weapon="${item.name}" style="background:#500; color:#fff; border:1px solid #f00; font-weight:bold;">
              <i class="fas fa-skull"></i> <strong>+6 DMG & HEAD SHOT</strong>
          </button>`;
      } else {
          // MoS 0 or 1: Standard Damage
          const bonus = mosCount === 1 ? 1 : 0;
          const label = bonus > 0 ? `+${bonus} DMG` : "Roll Damage";
          buttonsHtml += `
          <button class="roll-damage" data-damage="${getFormula(bonus)}" data-ad="${ad}" data-weapon="${item.name}" style="background:#300; color:#f88; border:1px solid #a00;">
              <i class="fas fa-tint"></i> ${label}
          </button>`;
      }

      const resultColor = successTotal > 10 ? '#39ff14' : '#f55';

      let modText = `Stat: ${statValue} | Rank: ${rank}`;
      if (allDiceMod !== 0) modText += ` | All: ${allDiceMod > 0 ? "+" : ""}${allDiceMod}`;
      if (successDieMod !== 0) modText += ` | SD: ${successDieMod > 0 ? "+" : ""}${successDieMod}`;
      if (damageBonus !== 0) modText += ` | <strong>Flat Dmg: +${damageBonus}</strong>`; // Show static bonus
      if (effectNote) modText += `<br><em style="color:#f88;">${effectNote}</em>`;

      roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: `
          <div style="background:#222; border:1px solid #ff4400; color:#eee; padding:5px; font-family:'Roboto Condensed',sans-serif;">
              <h3 style="color:#ff4400; margin:0; border-bottom:1px solid #555;">ATTACK: ${item.name.toUpperCase()}</h3>
              <div style="font-size:0.8em; color:#aaa;">${modText}</div>
              <div style="display:flex; justify-content:space-between; background:rgba(255,68,0,0.1); padding:5px; margin:5px 0;">
                  <span style="font-weight:bold; color:#ff4400;">SUCCESS DIE</span>
                  <span style="font-size:1.5em; font-weight:bold; color:${resultColor};">${successTotal}</span>
              </div>
              <div style="margin-bottom:10px;">
                  <span style="font-size:0.8em; color:#aaa;">SKILL DICE (${mosCount})</span>
                  <div style="display:flex; flex-wrap:wrap;">${skillDiceHtml}</div>
              </div>
              
              <div style="background:#111; border:1px solid #555; padding:5px; margin-bottom:5px;">
                  ${armorPen > 0 ? `<div style="font-size:0.7em; color:#f88; text-align:center;">Target PV reduced by ${armorPen}</div>` : ""}
                  ${buttonsHtml}
              </div>
          </div>`
      });
  }

  // --- ACTION: EXECUTE SKILL ROLL ---
  async _executeSkillRoll(element) {
      const itemId = $(element).parents('.item').data('itemId');
      const item = this.actor.items.get(itemId);
      
      const rank = item.system.rank || 0;
      const bonus = item.system.bonus || 0;
      const statKey = (item.system.stat || "dex").toLowerCase();
      const statValue = this.actor.system.stats[statKey]?.total ?? this.actor.system.stats[statKey]?.value ?? 0;

      let globalMod = 0;
      if (this.actor.system.conditions?.prone) globalMod -= 1;
      if (this.actor.system.conditions?.stunned) globalMod -= 1;

      const penalty = this.actor.system.wounds.penalty || 0;
      const modifier = statValue + rank + bonus - penalty + globalMod;
      
      // Rule: Rank + 1 Skill Dice
      const skillDiceCount = rank + 1;
      let formula = `1d10 + ${skillDiceCount}d10`;

      let roll = new Roll(formula);
      await roll.evaluate();
      const successRaw = roll.terms[0].results[0].result;
      const successTotal = successRaw + modifier;

      let skillDiceHtml = "";
      if (roll.terms.length > 2) {
           roll.terms[2].results.forEach(r => {
               let val = r.result + modifier;
               let border = val >= 10 ? "1px solid #39ff14" : "1px solid #555";
               skillDiceHtml += `<div style="display:flex; flex-direction:column; align-items:center; margin:2px;"><span style="border:${border}; padding:2px 8px; border-radius:4px; font-weight:bold;">${val}</span><span style="font-size:0.7em; color:#555;">(${r.result})</span></div>`;
           });
      }

      const resultColor = successTotal > 10 ? '#39ff14' : '#f55';

      // Generate Tooltip
      const tooltipHtml = `
          <div class="dice-tooltip" style="display:none; margin-top:10px; padding-top:5px; border-top:1px solid #444; font-size:0.8em; text-align:left;">
              <div><strong>Raw:</strong> ${successRaw} + Mod ${modifier}</div>
          </div>`;

      roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: `
            <div style="background: #222; border: 1px solid #39ff14; color: #eee; padding: 5px; font-family:'Roboto Condensed',sans-serif;">
                <h3 style="color:#39ff14; border-bottom:1px solid #555; margin:0 0 5px 0;">${item.name.toUpperCase()}</h3>
                <div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.3); padding:5px; margin-bottom:5px;">
                    <span style="font-size:0.9em; color:#aaa;">SUCCESS DIE</span>
                    <span class="roll-toggle" style="font-size:1.5em; font-weight:bold; color:${resultColor}; cursor:pointer;">${successTotal}</span>
                </div>
                ${tooltipHtml}
                <div style="display:flex; flex-wrap:wrap;">${skillDiceHtml}</div>
            </div>`
      });
  }

  // --- ACTION: EXECUTE EBB ROLL ---
  async _executeEbbRoll(item) {
      const formulaRating = item.system.formulaRating || 7;
      const currentFlux = this.actor.system.stats.flux?.value || 0;
      const fluxCost = 1;

      if (currentFlux < fluxCost) {
          ui.notifications.error(`Insufficient FLUX (${currentFlux}).`);
          return; 
      }
      
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

      const skillDiceCount = rank + 1;
      let formula = `1d10 + ${skillDiceCount}d10`;

      let roll = new Roll(formula);
      await roll.evaluate();

      const successRaw = roll.terms[0].results[0].result;
      const successTotal = successRaw + modifier;
      const isBaseSuccess = successTotal >= formulaRating;

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
              failureConsequence = "Formula failed.";
          }
      }

      const dmgFormula = item.system.dmg || "0";
      const adValue = item.system.ad || 0;
      let penaltyHtml = "";
      if (penalty > 0) penaltyHtml += `<span style="color:#f55;"> (Wounds: -${penalty})</span>`;
      if (globalMod !== 0) penaltyHtml += `<span style="color:#aaa;"> (Conditions: ${globalMod})</span>`;

      // Tooltip
      const resultColor = isBaseSuccess ? '#39ff14' : '#f55';
      const tooltipHtml = `
          <div class="dice-tooltip" style="display:none; margin-top:10px; padding-top:5px; border-top:1px solid #444; font-size:0.8em; text-align:left;">
              <div><strong>Raw:</strong> ${successRaw} + Mod ${modifier}</div>
          </div>`;

      roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: `
            <div style="background: #111; border: 1px solid #8a2be2; color: #eee; padding: 5px; font-family:'Roboto Condensed',sans-serif;">
                <h3 style="color:#8a2be2; margin:0; border-bottom:1px solid #8a2be2;">${item.name.toUpperCase()} (FR: ${formulaRating})</h3>
                <div style="font-size: 0.8em; color: #aaa;">
                    ${effectiveName} (${rank}) | CONC ${statValue} ${penaltyHtml}
                </div>
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

  // --- DROPS (SPECIES & PACKAGES) ---
  async _onDropItem(event, data) {
    if ( !this.actor.isOwner ) return false;
    const item = await Item.implementation.fromDropData(data);
    const itemData = item.toObject();

    // Helper: Handle Skill Array (Create or Increment)
    const processSkills = async (skillsArray, sourceFlag) => {
        // 1. Validate Data
        if (!skillsArray || !Array.isArray(skillsArray) || skillsArray.length === 0) return;

        const toCreate = [];
        const toUpdate = [];

        for (const skillData of skillsArray) {
            // 2. Check if Actor already has this skill (Name + Type match)
            // We use toLowerCase to be forgiving on casing
            const existing = this.actor.items.find(i => 
                i.name.toLowerCase() === skillData.name.toLowerCase() && 
                i.type === skillData.type
            );

            if (existing) {
                // 3. UPDATE: Increment Rank
                const currentRank = existing.system.rank || 0;
                const newRank = currentRank + 1;
                
                toUpdate.push({
                    _id: existing.id,
                    "system.rank": newRank
                });
                
                ui.notifications.info(`Upgraded ${existing.name} to Rank ${newRank}`);
            } else {
                // 4. CREATE: Add new item
                const newSkill = foundry.utils.deepClone(skillData);
                delete newSkill._id; // Ensure a new ID is generated
                
                // Default rank to 1 if missing
                if (!newSkill.system.rank) newSkill.system.rank = 1;
                
                // Flag source
                if (!newSkill.flags) newSkill.flags = {};
                if (!newSkill.flags["sla-industries"]) newSkill.flags["sla-industries"] = {};
                newSkill.flags["sla-industries"][sourceFlag] = true;
                
                toCreate.push(newSkill);
            }
        }

        // 5. Commit Changes
        if (toCreate.length > 0) {
            await this.actor.createEmbeddedDocuments("Item", toCreate);
            ui.notifications.info(`Added ${toCreate.length} new skills.`);
        }
        if (toUpdate.length > 0) {
            await this.actor.updateEmbeddedDocuments("Item", toUpdate);
        }
    };

    // CASE 1: SPECIES
    if (itemData.type === "species") {
        // Remove old species
        const existing = this.actor.items.find(i => i.type === "species");
        if (existing) await existing.delete();

        // Add new species
        await this.actor.createEmbeddedDocuments("Item", [itemData]);
        await this.actor.update({ "system.bio.species": itemData.name });

        // Apply Stats
        const stats = itemData.system.stats;
        if (stats) {
            const updates = {};
            for (const [key, val] of Object.entries(stats)) {
                updates[`system.stats.${key}.value`] = val.min;
            }
            await this.actor.update(updates);
        }
        
        // Apply Skills
        await processSkills(itemData.system.skills, "fromSpecies");
        return;
    }
    
    // CASE 2: PACKAGE
    if (itemData.type === "package") {
        // Check Stat Requirements
        const reqs = itemData.system.requirements || {};
        for (const [key, minVal] of Object.entries(reqs)) {
            const actorStat = this.actor.system.stats[key]?.value || 0;
            if (actorStat < minVal) { 
                ui.notifications.error(`Requirement not met: ${key.toUpperCase()} must be ${minVal}+`); 
                return; 
            }
        }

        // Remove old package
        const existing = this.actor.items.find(i => i.type === "package");
        if (existing) await existing.delete();

        // Add new package
        await this.actor.createEmbeddedDocuments("Item", [itemData]);
        await this.actor.update({ "system.bio.package": itemData.name });
        
        // Apply Skills
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
}