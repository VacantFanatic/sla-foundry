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
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }]
    });
  }

  /** @override */
  get template() {
    const path = "systems/sla-industries/templates/actor";
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

    if (actorData.type == 'character' || actorData.type == 'npc') {
      this._prepareItems(context);
    }

    context.rollData = context.actor.getRollData();

    // Species Dropdown
    const speciesList = CONFIG.SLA?.speciesStats || {};
    context.speciesOptions = Object.keys(speciesList).reduce((acc, key) => {
        acc[key] = speciesList[key].label;
        return acc;
    }, {});

    return context;
  }

  /** Organize Items */
  _prepareItems(context) {
    const gear = [];
    const skills = [];
    const traits = [];

    for (let i of context.items) {
      i.img = i.img || DEFAULT_TOKEN;
      if (i.type === 'item' || i.type === 'weapon' || i.type === 'armor') gear.push(i);
      else if (i.type === 'skill') skills.push(i);
      else if (i.type === 'trait') traits.push(i);
    }

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
    if (!this.isEditable) return;

    // Item Management
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      if (item) item.sheet.render(true);
    });

    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      if (item) {
          Dialog.confirm({
            title: `Delete ${item.name}?`,
            content: "<p>Are you sure?</p>",
            yes: () => { item.delete(); li.slideUp(200, () => this.render(false)); },
            defaultYes: false
          });
      }
    });

    html.find('.item-toggle').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.update({ "system.equipped": !item.system.equipped });
    });

    html.find('.item-create').click(this._onItemCreate.bind(this));
    html.find('.rollable').click(this._onRoll.bind(this));
  }

  /**
   * Main Roll Router
   */
  async _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    // 1. STAT ROLL
    if (dataset.rollType === 'stat') {
        const statKey = dataset.key.toLowerCase();
        const statLabel = statKey.toUpperCase();
        const statValue = this.actor.system.stats[statKey]?.value || 0;
        const penalty = this.actor.system.wounds.penalty || 0;
        const finalMod = statValue - penalty;

        let roll = new Roll("1d10");
        await roll.evaluate();
        
        let rawDie = roll.terms[0].results[0].result;
        let finalTotal = rawDie + finalMod;
        let penaltyHtml = penalty > 0 ? `<div style="font-size:0.8em; color:#f55;">Wound Penalty: -${penalty}</div>` : "";

        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `
            <div style="background:#222; border:1px solid #39ff14; color:#eee; padding:5px; font-family:'Roboto Condensed',sans-serif;">
                <h3 style="color:#39ff14; border-bottom:1px solid #555; margin:0 0 5px 0;">${statLabel} CHECK</h3>
                ${penaltyHtml}
                <div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.3); padding:5px;">
                    <span style="font-size:0.9em; color:#aaa;">SUCCESS DIE</span>
                    <div style="text-align:right;">
                         <span style="font-size:1.5em; font-weight:bold; color:#fff;">${finalTotal}</span>
                         <span style="font-size:0.8em; color:#777;">(Roll ${rawDie} + Mod ${finalMod})</span>
                    </div>
                </div>
            </div>`
        });
    }

    // 2. SKILL ROLL
    if (dataset.rollType === 'skill') {
        this._executeSkillRoll(element);
    }

    // 3. WEAPON ROLL
    if (dataset.rollType === 'item') {
        const itemId = $(element).parents('.item').data('itemId');
        const item = this.actor.items.get(itemId);

        if (item.type === 'weapon') {
            const skillKey = item.system.skill || "";
            const isMelee = ["melee", "unarmed", "thrown"].includes(skillKey);
            this._renderAttackDialog(item, isMelee);
        } else {
            item.sheet.render(true);
        }
    }
    
    // 4. INITIATIVE
    if (dataset.rollType === 'init') {
        await this.actor.rollInitiative({createCombatants: true});
    }
  }

  // --- HELPER: RENDER ATTACK DIALOG ---
  _renderAttackDialog(item, isMelee) {
      const recoil = item.system.recoil || 0;
      let dialogContent = `
        <form style="color:#eee; font-family:'Roboto Condensed',sans-serif;">
            <div class="form-group" style="margin-bottom:5px;">
                <label>Generic Modifier (+/-)</label>
                <input type="number" name="modifier" value="0" style="background:#333; color:#fff; border:1px solid #555; text-align:center; width:50px; float:right;"/>
            </div>
            <hr style="border:1px solid #444;">
      `;

      if (isMelee) {
          dialogContent += `
            <h3 style="border-bottom:1px solid #555; color:#39ff14; margin-bottom:5px;">Melee Modifiers</h3>
            <div style="display:grid; grid-template-columns: 1fr; gap: 5px;">
                <div><input type="checkbox" name="charging"/> Charging Target (-1 SD, +1 Auto Skill)</div>
                <div><input type="checkbox" name="targetCharged"/> Target Charged/Fast Move (-1 SD)</div>
                <div><input type="checkbox" name="sameTarget"/> Hit Same Target Last Round (+1 SD)</div>
                <div><input type="checkbox" name="breakOff"/> Target Breaking Off (+1 SD)</div>
                <div><input type="checkbox" name="natural"/> Natural Weapons (+1 SD)</div>
                <div><input type="checkbox" name="prone"/> Target Prone/Stunned (+2 SD)</div>
                <div class="form-group" style="margin-top:5px; display:flex; justify-content:space-between;">
                    <label>Combat Defence (Rank)</label>
                    <input type="number" name="combatDef" value="0" style="width:50px; background:#333; color:#fff; text-align:center;"/>
                </div>
                <div class="form-group" style="display:flex; justify-content:space-between;">
                    <label>Acrobatic Defence (Rank)</label>
                    <input type="number" name="acroDef" value="0" style="width:50px; background:#333; color:#fff; text-align:center;"/>
                </div>
            </div>`;
      } else {
          dialogContent += `
            <h3 style="border-bottom:1px solid #555; color:#39ff14; margin-bottom:5px;">Ranged Modifiers</h3>
            <div style="font-size:0.8em; color:#aaa; margin-bottom:5px;">Base Recoil: -${recoil} SD</div>
            <div style="display:grid; grid-template-columns: 1fr; gap: 5px;">
                <div class="form-group" style="display:flex; justify-content:space-between;">
                    <label>Target Cover</label>
                    <select name="cover" style="background:#333; color:#fff; width:120px;">
                        <option value="0">None</option>
                        <option value="-1">Light (-1 SD)</option>
                        <option value="-2">Heavy/Hidden (-2 SD)</option>
                    </select>
                </div>
                <div class="form-group" style="display:flex; justify-content:space-between;">
                    <label>Ammo Type</label>
                    <select name="ammo" style="background:#333; color:#fff; width:120px;">
                        <option value="std">Standard</option>
                        <option value="he">High Explosive (+1 DMG)</option>
                        <option value="ap">Armour Piercing (-2 PV)</option>
                        <option value="slug">Shotgun Slug (+1 DMG)</option>
                    </select>
                </div>
                <div class="form-group" style="display:flex; justify-content:space-between;">
                    <label>Firing Mode</label>
                    <select name="mode" style="background:#333; color:#fff; width:120px;">
                        <option value="single">Single</option>
                        <option value="burst">Burst (+2 DMG)</option>
                        <option value="auto">Full Auto (+4 DMG)</option>
                        <option value="suppress">Suppressive (+4 DMG)</option>
                    </select>
                </div>
                <div class="form-group" style="display:flex; justify-content:space-between;">
                    <label>Aiming</label>
                    <select name="aiming" style="background:#333; color:#fff; width:120px;">
                        <option value="none">None</option>
                        <option value="sd">+1 Success Die</option>
                        <option value="skill">+1 Skill Success</option>
                    </select>
                </div>
                <div class="form-group" style="display:flex; justify-content:space-between;">
                    <label>Dual Wielding</label>
                    <select name="dual" style="background:#333; color:#fff; width:120px;">
                        <option value="0">No</option>
                        <option value="-2">Same Target (-2 SD)</option>
                        <option value="-4">Diff Target (-4 SD)</option>
                    </select>
                </div>
                
                <hr style="border: 1px solid #444; width:100%;">
                
                <div><input type="checkbox" name="targetMoved"/> Target Moved Fast (-1 SD)</div>
                <div><input type="checkbox" name="blind"/> Firing Blind (-1 All Dice)</div>
                <div><input type="checkbox" name="longRange"/> Long Range (-1 Skill Die)</div>
                <div><input type="checkbox" name="prone"/> Target Prone/Stunned (+1 SD)</div>
            </div>`;
      }
      dialogContent += `</form>`;

      new Dialog({
          title: `Attack: ${item.name}`,
          content: dialogContent,
          buttons: {
              roll: {
                  label: "ROLL ATTACK",
                  callback: (html) => this._processWeaponRoll(item, html, isMelee)
              }
          },
          default: "roll"
      }, { classes: ["sla-dialog", "sla-sheet"] }).render(true);
  }

  // -------------------------------------------------------------
  // HELPER: PROCESS WEAPON ROLL
  // -------------------------------------------------------------
  async _processWeaponRoll(item, html, isMelee) {
      const form = html[0].querySelector("form");
      const genericMod = Number(form.modifier.value) || 0;
      
      const statKey = "dex"; 
      const statValue = this.actor.system.stats[statKey]?.value || 0;
      
      // Calculate Stats & Mods (Standard S5S Logic)
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
      let autoSkillSuccesses = 0; 
      let rankMod = 0; 
      let effectNote = "";
      
      // Damage & AD Variables
      let damageBonus = 0;
      let armorPen = 0;
      const ad = item.system.ad || 0; // <--- GET AD HERE

      if (isMelee) {
          // ... (Keep existing Melee Logic) ...
          const strValue = this.actor.system.stats.str?.value || 0; 
          if (strValue >= 7) damageBonus += 4;
          else if (strValue === 6) damageBonus += 2;
          else if (strValue === 5) damageBonus += 1;

          if (form.charging.checked) { successDieMod -= 1; autoSkillSuccesses += 1; }
          if (form.targetCharged.checked) { successDieMod -= 1; }
          if (form.sameTarget.checked) { successDieMod += 1; }
          if (form.breakOff.checked) { successDieMod += 1; }
          if (form.natural.checked) { successDieMod += 1; }
          if (form.prone.checked) { successDieMod += 2; }

          const combatDef = Number(form.combatDef.value) || 0;
          const acroDef = Number(form.acroDef.value) || 0;
          allDiceMod -= combatDef; 
          allDiceMod -= (acroDef * 2); 
      } else {
          // ... (Keep existing Ranged Logic) ...
          const mode = form.mode.value;
          if (mode === "burst") { effectNote += "Burst. "; damageBonus += 2; }
          if (mode === "auto") { effectNote += "Full Auto. "; damageBonus += 4; }
          if (mode === "suppress") { autoSkillSuccesses += 2; effectNote += "Suppressive. "; damageBonus += 4; }

          const ammo = form.ammo.value;
          if (ammo === "he") { damageBonus += 1; effectNote += "HE. "; }
          if (ammo === "ap") { armorPen = 2; effectNote += "AP. "; }
          if (ammo === "slug") { damageBonus += 1; effectNote += "Slug. "; }

          const cover = Number(form.cover.value) || 0;
          successDieMod += cover;
          const dual = Number(form.dual.value) || 0;
          successDieMod += dual;
          const aiming = form.aiming.value;
          if (aiming === "sd") successDieMod += 1;
          if (aiming === "skill") autoSkillSuccesses += 1;
          if (form.targetMoved.checked) successDieMod -= 1;
          if (form.blind.checked) allDiceMod -= 1;
          if (form.prone.checked) successDieMod += 1;
          if (form.longRange.checked) { rankMod -= 1; effectNote += "Long Range. "; }
          const recoil = item.system.recoil || 0;
          if (recoil > 0) successDieMod -= recoil;
      }

      const woundPenalty = this.actor.system.wounds.penalty || 0;
      allDiceMod -= woundPenalty;

      const baseModifier = statValue + rank + allDiceMod; 
      let effectiveRank = Math.max(0, rank + rankMod); 

      let formula = "1d10";
      if (effectiveRank > 0) formula += ` + ${effectiveRank}d10`;

      let roll = new Roll(formula);
      await roll.evaluate();

      const successRaw = roll.terms[0].results[0].result;
      const successTotal = successRaw + baseModifier + successDieMod;

      // MoS Calculation
      let mosCount = autoSkillSuccesses; 
      let skillDiceHtml = "";
      if (effectiveRank > 0 && roll.terms.length > 2) {
           roll.terms[2].results.forEach(r => {
               let val = r.result + baseModifier;
               let isSuccess = val >= 10;
               if (isSuccess) mosCount++;
               let style = isSuccess ? "color:#39ff14;font-weight:bold;" : "color:#aaa;";
               let border = isSuccess ? "1px solid #39ff14" : "1px solid #555";
               skillDiceHtml += `<div style="display:flex; flex-direction:column; align-items:center; margin:2px;"><span style="border:${border}; padding:2px 8px; border-radius:4px; ${style}">${val}</span><span style="font-size:0.7em; color:#555;">(${r.result})</span></div>`;
           });
      }
      if (autoSkillSuccesses > 0) {
          skillDiceHtml += `<div style="display:flex; flex-direction:column; align-items:center; margin:2px;"><span style="border:1px solid #39ff14; background:#39ff14; color:#000; padding:2px 8px; border-radius:4px; font-weight:bold;">+${autoSkillSuccesses}</span><span style="font-size:0.7em; color:#aaa;">(Auto)</span></div>`;
      }

      // Damage Calculation
      let mosDamage = 0;
      let hitLocation = "Standard";
      if (mosCount === 1) { mosDamage = 1; }
      else if (mosCount === 2) { mosDamage = 2; hitLocation = "Arm/Torso"; }
      else if (mosCount === 3) { mosDamage = 4; hitLocation = "Leg/Arm/Torso"; }
      else if (mosCount >= 4) { mosDamage = 6; hitLocation = "HEAD (or any)"; }

      const totalDamageBonus = mosDamage + damageBonus;
      const baseDamage = item.system.damage || "0";
      const finalDamageFormula = totalDamageBonus > 0 ? `${baseDamage} + ${totalDamageBonus}` : baseDamage;

      // Output Chat Card
      let modText = `Stat: ${statValue} | Rank: ${rank}`;
      if (allDiceMod !== 0) modText += ` | All: ${allDiceMod > 0 ? "+" : ""}${allDiceMod}`;
      if (successDieMod !== 0) modText += ` | SD: ${successDieMod > 0 ? "+" : ""}${successDieMod}`;
      if (effectNote) modText += `<br><em style="color:#f88;">${effectNote}</em>`;

      roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: `
          <div style="background:#222; border:1px solid #ff4400; color:#eee; padding:5px; font-family:'Roboto Condensed',sans-serif;">
              <div style="border-bottom:1px solid #555; margin-bottom:5px;">
                  <h3 style="color:#ff4400; margin:0;">ATTACK: ${item.name.toUpperCase()}</h3>
                  <div style="font-size:0.8em; color:#aaa;">${modText}</div>
              </div>
              <div style="display:flex; justify-content:space-between; background:rgba(255,68,0,0.1); padding:5px; margin-bottom:5px; border:1px solid #ff4400;">
                  <span style="font-weight:bold; color:#ff4400;">SUCCESS DIE</span>
                  <span style="font-size:1.5em; font-weight:bold; color:#fff;">${successTotal}</span>
              </div>
              <div style="margin-bottom:10px;">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                      <span style="font-size:0.8em; color:#aaa;">SKILL DICE</span>
                      <span style="font-size:0.9em; color:#39ff14;"><strong>${mosCount}</strong> Successes</span>
                  </div>
                  <div style="display:flex; flex-wrap:wrap;">${skillDiceHtml}</div>
              </div>
              <div style="background:#111; border:1px solid #555; padding:5px; margin-bottom:5px;">
                  <div style="display:flex; justify-content:space-between; font-size:0.8em; color:#ccc;">
                      <span>Hit: <strong style="color:#fff;">${hitLocation}</strong></span>
                      <span>Total Bonus: <strong style="color:#39ff14;">+${totalDamageBonus}</strong></span>
                  </div>
                  ${armorPen > 0 ? `<div style="font-size:0.7em; color:#f88; margin-top:2px;">Target PV reduced by ${armorPen}</div>` : ""}
              </div>

              <button class="roll-damage" data-damage="${finalDamageFormula}" data-ad="${ad}" data-weapon="${item.name}" style="background:#300; color:#f88; border:1px solid #a00; cursor:pointer; width:100%;">
                  <i class="fas fa-tint"></i> ROLL DAMAGE (${finalDamageFormula})
              </button>
          </div>`
      });
  }

  // --- HELPER: EXECUTE SKILL ROLL ---
  async _executeSkillRoll(element) {
      const itemId = $(element).parents('.item').data('itemId');
      const item = this.actor.items.get(itemId);
      
      const rank = item.system.rank || 0;
      const bonus = item.system.bonus || 0;
      const statKey = (item.system.stat || "dex").toLowerCase();
      const statValue = this.actor.system.stats[statKey]?.value || 
                        (this.actor.system.ratings && this.actor.system.ratings[statKey]?.value) || 0;

      const penalty = this.actor.system.wounds.penalty || 0;
      const modifier = statValue + rank + bonus - penalty;
      
      let formula = "1d10";
      if (rank > 0) formula += ` + ${rank}d10`;

      let roll = new Roll(formula);
      await roll.evaluate();

      const successRaw = roll.terms[0].results[0].result;
      const successTotal = successRaw + modifier;

      let skillDiceHtml = "";
      if (rank > 0 && roll.terms.length > 2) {
           roll.terms[2].results.forEach(r => {
               let val = r.result + modifier;
               let border = val >= 10 ? "1px solid #39ff14" : "1px solid #555";
               skillDiceHtml += `<div style="display:flex; flex-direction:column; align-items:center; margin:2px;"><span style="border:${border}; padding:2px 8px; border-radius:4px; font-weight:bold;">${val}</span><span style="font-size:0.7em; color:#555;">(${r.result})</span></div>`;
           });
      } else if (rank === 0) {
          skillDiceHtml = `<span style="font-style: italic; color: #555; font-size: 0.8em;">No Rank - Success Die Only</span>`;
      }

      let penaltyHtml = penalty > 0 ? `<span style="color:#f55;"> (Wounds: -${penalty})</span>` : "";

      roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: `
            <div style="background: #222; border: 1px solid #39ff14; color: #eee; padding: 5px; font-family:'Roboto Condensed',sans-serif;">
                <div style="border-bottom: 1px solid #555; margin-bottom:5px; padding-bottom:2px;">
                    <h3 style="color:#39ff14; margin:0;">${item.name.toUpperCase()}</h3>
                    <div style="font-size:0.8em; color:#aaa;">
                        Stat: ${statValue} | Rank: ${rank} | <strong>Mod: +${modifier}</strong> ${penaltyHtml}
                    </div>
                </div>
                <div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.3); padding:5px; margin-bottom:5px;">
                    <span style="font-size:0.9em; color:#aaa;">SUCCESS DIE</span>
                    <div style="text-align:right;">
                         <span style="font-size:1.5em; font-weight:bold; color:#fff;">${successTotal}</span>
                         <span style="font-size:0.8em; color:#777;">(Roll ${successRaw} + ${modifier})</span>
                    </div>
                </div>
                <div style="margin-top:5px;">
                    <span style="font-size:0.8em; font-weight:bold; color:#aaa;">SKILL DICE</span>
                    <div style="display:flex; flex-wrap:wrap; margin-top:2px;">${skillDiceHtml}</div>
                </div>
            </div>`
      });
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