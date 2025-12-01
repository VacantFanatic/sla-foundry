// Import document classes.
import { BoilerplateActor } from "./documents/actor.mjs";
import { BoilerplateItem } from "./documents/item.mjs";

// Import sheet classes.
import { SlaActorSheet } from "./sheets/actor-sheet.mjs";
import { SlaItemSheet } from "./sheets/item-sheet.mjs";

// Import custom ruler (V13)
import { SLATokenRuler } from "./canvas/sla-ruler.mjs"; 

// Import helpers.
import { preloadHandlebarsTemplates } from "./helpers/templates.mjs";

/* -------------------------------------------- */
/* 1. DEFINE CONFIGURATION                      */
/* -------------------------------------------- */
const SLA_CONFIG = {
    // SPECIES DATA
    speciesStats: {
        "human": { label: "Human", move: { closing: 2, rushing: 5 }, stats: { str: {min:1, max:3}, dex: {min:1, max:4}, know: {min:2, max:5}, conc: {min:1, max:5}, cha: {min:1, max:5}, cool: {min:1, max:5}, luck: {min:1, max:6} } },
        "frother": { label: "Frother", move: { closing: 2, rushing: 5 }, stats: { str: {min:2, max:4}, dex: {min:2, max:4}, know: {min:1, max:5}, conc: {min:1, max:3}, cha: {min:0, max:4}, cool: {min:1, max:5}, luck: {min:1, max:3} } },
        "ebonite": { label: "Ebonite", move: { closing: 2, rushing: 5 }, stats: { str: {min:0, max:3}, dex: {min:1, max:4}, know: {min:1, max:5}, conc: {min:2, max:6}, cha: {min:1, max:5}, cool: {min:1, max:5}, luck: {min:2, max:6} } },
        "stormer313": { label: "Stormer 313", move: { closing: 3, rushing: 6 }, stats: { str: {min:3, max:6}, dex: {min:2, max:6}, know: {min:0, max:2}, conc: {min:0, max:3}, cha: {min:0, max:3}, cool: {min:3, max:6}, luck: {min:0, max:2} } },
        "stormer711": { label: "Stormer 711", move: { closing: 4, rushing: 6 }, stats: { str: {min:2, max:5}, dex: {min:3, max:5}, know: {min:0, max:3}, conc: {min:1, max:4}, cha: {min:0, max:2}, cool: {min:2, max:6}, luck: {min:0, max:2} } },
        "shaktar": { label: "Shaktar", move: { closing: 3, rushing: 6 }, stats: { str: {min:3, max:5}, dex: {min:2, max:5}, know: {min:1, max:4}, conc: {min:0, max:3}, cha: {min:1, max:3}, cool: {min:1, max:6}, luck: {min:0, max:3} } },
        "wraithen": { label: "Wraithen", move: { closing: 4, rushing: 8 }, stats: { str: {min:1, max:3}, dex: {min:3, max:6}, know: {min:1, max:4}, conc: {min:1, max:4}, cha: {min:1, max:4}, cool: {min:0, max:5}, luck: {min:1, max:4} } },
        "carrien": { label: "Adv. Carrien", move: { closing: 4, rushing: 7 }, stats: { str: {min:3, max:5}, dex: {min:1, max:5}, know: {min:0, max:2}, conc: {min:1, max:4}, cha: {min:0, max:3}, cool: {min:3, max:6}, luck: {min:0, max:3} } },
        "neophron": { label: "Neophron", move: { closing: 2, rushing: 5 }, stats: { str: {min:0, max:2}, dex: {min:0, max:3}, know: {min:2, max:6}, conc: {min:2, max:6}, cha: {min:3, max:6}, cool: {min:1, max:5}, luck: {min:0, max:3} } }
    },

    // COMBAT SKILLS LIST
    combatSkills: {
        "pistol": "Pistol", "rifle": "Rifle", "melee": "Melee", "unarmed": "Unarmed", "thrown": "Thrown", "heavy": "Heavy Weapons", "support": "Support Weapons"
    },

    // EBB DISCIPLINES
    ebbDisciplines: {
        "awareness": "Awareness", "blast": "Blast", "communicate": "Communicate", "enhance": "Enhance", "heal": "Heal", "protect": "Protect", "realityFolding": "Reality Folding", "senses": "Senses", "telekinesis": "Telekinesis", "thermal": "Thermal"
    }
};

/* -------------------------------------------- */
/* Init Hook                                   */
/* -------------------------------------------- */
Hooks.once('init', async function() {
  console.log("SLA INDUSTRIES | Initializing System...");

  CONFIG.SLA = SLA_CONFIG; 

  game.boilerplate = { SlaActorSheet, SlaItemSheet, BoilerplateActor, BoilerplateItem };
  CONFIG.Actor.documentClass = BoilerplateActor;
  CONFIG.Item.documentClass = BoilerplateItem;
  
  // REGISTER CUSTOM V13 TOKEN RULER
  CONFIG.Token.rulerClass = SLATokenRuler;

  CONFIG.Combat.initiative = {
    formula: "1d10 + @stats.init.value",
    decimals: 2
  };

  CONFIG.Actor.trackableAttributes = {
    character: {
      bar: ["attributes.hp", "attributes.flux"],
      value: ["move.closing", "move.rushing", "encumbrance.value"]
    },
    npc: {
      bar: ["attributes.hp"],
      value: ["move.closing", "move.rushing"]
    }
  };

  CONFIG.Item.typeLabels = {
    "item": "Item", "skill": "Skill", "trait": "Trait", "weapon": "Weapon", "armor": "Armor", "ebbFormula": "Ebb Formula", "discipline": "Discipline", "drug": "Combat Drug"
  };

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("sla-industries", SlaActorSheet, { types: ["character", "npc"], makeDefault: true, label: "SLA Operative Sheet" });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("sla-industries", SlaItemSheet, { makeDefault: true, label: "SLA Item Sheet" });

  return preloadHandlebarsTemplates();
});

/* -------------------------------------------- */
/* Helpers                                     */
/* -------------------------------------------- */
Handlebars.registerHelper('toLowerCase', function (str) { return str ? str.toLowerCase() : ""; });
Handlebars.registerHelper('eq', function (a, b) { return a === b; });
Handlebars.registerHelper('or', function (a, b) { return a || b; });
Handlebars.registerHelper('gt', function (a, b) { return a > b; });
Handlebars.registerHelper('and', function (a, b) { return a && b; });

/* -------------------------------------------- */
/* Chat Listeners (Buttons)                    */
/* -------------------------------------------- */
Hooks.on('renderChatMessage', (message, html, data) => {
    
    // 1. ROLL DAMAGE BUTTON
    const damageButton = html.find('.roll-damage');
    if (damageButton.length > 0) {
        damageButton.click(async ev => {
            ev.preventDefault();
            const damageFormula = ev.currentTarget.dataset.damage;
            const weaponName = ev.currentTarget.dataset.weapon;
            const ad = ev.currentTarget.dataset.ad || 0; 
            let roll = new Roll(damageFormula);
            await roll.evaluate();
            
            roll.toMessage({
                speaker: message.speaker,
                content: `
                <div style="background:#110000;border:1px solid #a00;color:#eee;padding:5px;font-family:'Roboto Condensed',sans-serif;">
                    <h3 style="color:#f00;margin:0;border-bottom:1px solid #500;">DAMAGE: ${weaponName}</h3>
                    <div style="text-align:center;margin:10px 0;">
                        <div style="font-size:2em;font-weight:bold;color:#fff;">${roll.total} <span style="font-size:0.4em;color:#777;">DMG</span></div>
                        <div style="font-size:1em;color:#f88;">(AD: ${ad})</div>
                    </div>
                    <button class="apply-damage" data-damage="${roll.total}" data-ad="${ad}" style="background:#300;color:#f88;border:1px solid #a00;width:100%;">
                        <i class="fas fa-skull"></i> APPLY DAMAGE & AD
                    </button>
                </div>`
            });
        });
    }

    // 2. APPLY DAMAGE BUTTON (Interactive Choice)
    const applyButton = html.find('.apply-damage');
    if (applyButton.length > 0) {
        applyButton.click(async ev => {
            ev.preventDefault();
            const rawDamage = parseInt(ev.currentTarget.dataset.damage);
            const ad = parseInt(ev.currentTarget.dataset.ad) || 0;

            // 1. Check availability
            const selected = canvas.tokens.controlled;
            const targeted = Array.from(game.user.targets);
            
            if (selected.length === 0 && targeted.length === 0) {
                return ui.notifications.warn("Select or Target a token first.");
            }

            // 2. Define the Damage Logic Function
            const executeDamageBatch = async (tokensToDamage) => {
                for (let token of tokensToDamage) {
                    const actor = token.actor;
                    if (!actor) continue;

                    // A. ARMOR DAMAGE
                    let armorMsg = "";
                    const armors = actor.items.filter(i => i.type === 'armor' && i.system.equipped);
                    armors.sort((a, b) => (b.system.pv || 0) - (a.system.pv || 0));
                    let highestPV = 0;

                    if (armors.length > 0) {
                        const mainArmor = armors[0];
                        const currentRes = mainArmor.system.resistance?.value || 0;
                        
                        if (ad > 0 && currentRes > 0) {
                            const newRes = Math.max(0, currentRes - ad);
                            if (currentRes !== newRes) {
                                await mainArmor.update({ "system.resistance.value": newRes });
                                armorMsg = `<br><em>${mainArmor.name} degraded by ${ad} AD.</em>`;
                            }
                        }
                        const updatedRes = (ad > 0) ? Math.max(0, currentRes - ad) : currentRes;
                        const basePV = mainArmor.system.pv || 0;
                        let effectivePV = basePV;
                        if (updatedRes <= 0) effectivePV = 0;
                        else if (updatedRes < (mainArmor.system.resistance?.max / 2)) effectivePV = Math.floor(basePV / 2);
                        highestPV = effectivePV;
                    }

                    // B. APPLY HP DAMAGE
                    const finalDamage = Math.max(0, rawDamage - highestPV);
                    const currentHP = actor.system.hp.value;
                    await actor.update({ "system.hp.value": currentHP - finalDamage });

                    // C. NOTIFY
                    if (finalDamage > 0) {
                        let woundWarning = "";
                        if (finalDamage > (currentHP / 2)) woundWarning = `<div style="color:#f55; font-weight:bold; margin-top:5px; border-top:1px solid #555;">⚠️ MASSIVE DAMAGE: Apply a Wound!</div>`;
                        
                        ui.notifications.info(`${actor.name} takes ${finalDamage} damage!`);
                        ChatMessage.create({
                            content: `<div style="background:#220000; color:#fff; padding:5px; border:1px solid #a00;"><strong>${actor.name}</strong> takes ${finalDamage} Damage.<br><span style="font-size:0.8em; color:#aaa;">(Roll ${rawDamage} - PV ${highestPV})</span>${armorMsg}${woundWarning}</div>`,
                            speaker: message.speaker
                        });
                    } else {
                        ui.notifications.info(`${actor.name} resisted all damage (PV ${highestPV}).${armorMsg}`);
                    }
                }
            };

            // 3. Render Choice Dialog
            let contentHtml = `<p>Apply <strong>${rawDamage}</strong> Damage (AD: ${ad}) to...</p><form><div class="form-group">`;
            
            // Auto-select Targeted if available, otherwise Selected
            const targetChecked = targeted.length > 0 ? "checked" : "";
            const selectChecked = targeted.length === 0 ? "checked" : "";

            if (targeted.length > 0) {
                contentHtml += `<div><input type="radio" name="targetMode" value="targeted" ${targetChecked}> Targeted Tokens (${targeted.length})</div>`;
            } else {
                contentHtml += `<div style="color:#555; font-style:italic;"><input type="radio" disabled> No Targets (T key)</div>`;
            }

            if (selected.length > 0) {
                contentHtml += `<div><input type="radio" name="targetMode" value="selected" ${selectChecked}> Selected Tokens (${selected.length})</div>`;
            } else {
                 contentHtml += `<div style="color:#555; font-style:italic;"><input type="radio" disabled> No Selections</div>`;
            }
            
            contentHtml += `</div></form>`;

            new Dialog({
                title: "Apply Damage",
                content: contentHtml,
                buttons: {
                    apply: {
                        label: "APPLY",
                        callback: (html) => {
                            const mode = html.find('input[name="targetMode"]:checked').val();
                            if (mode === "targeted") executeDamageBatch(targeted);
                            else if (mode === "selected") executeDamageBatch(selected);
                            else ui.notifications.warn("No valid target method selected.");
                        }
                    }
                },
                default: "apply"
            }, { classes: ["sla-dialog"] }).render(true);
        });
    }
});