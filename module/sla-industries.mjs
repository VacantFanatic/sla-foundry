// Import document classes.
import { BoilerplateActor } from "./documents/actor.mjs";
import { BoilerplateItem } from "./documents/item.mjs";

// Import sheet classes.
import { SlaActorSheet } from "./sheets/actor-sheet.mjs";
import { SlaItemSheet } from "./sheets/item-sheet.mjs";

// Import ruler.
import { SLATokenRuler } from "./canvas/sla-ruler.mjs";

// Import helpers.
import { preloadHandlebarsTemplates } from "./helpers/templates.mjs";
import { SLA } from "./config.mjs";

/* -------------------------------------------- */
/* Init Hook                                   */
/* -------------------------------------------- */
Hooks.once('init', async function() {
  console.log("SLA INDUSTRIES | Initializing System...");

  CONFIG.SLA = SLA; 

  game.boilerplate = { SlaActorSheet, SlaItemSheet, BoilerplateActor, BoilerplateItem };
  CONFIG.Actor.documentClass = BoilerplateActor;
  CONFIG.Item.documentClass = BoilerplateItem;
  
  // REGISTER CUSTOM TOKEN RULER
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

  // --- THIS FIXES THE DROPDOWN LABELS ---
  CONFIG.Item.typeLabels = {
    "item": "Item / Gear", 
    "skill": "Skill", 
    "trait": "Trait", 
    "weapon": "Weapon", 
    "armor": "Armor", 
    "ebbFormula": "Ebb Formula", 
    "discipline": "Ebb Discipline", 
    "drug": "Combat Drug", 
    "magazine": "Magazine",
    "species": "Species",
    "package": "Training Package"
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
/* Chat Listeners (Buttons & Toggles)           */
/* -------------------------------------------- */
Hooks.on('renderChatMessage', (message, html, data) => {
    
    // 1. ROLL DAMAGE BUTTON
    const damageButton = html.find('.roll-damage');
    if (damageButton.length > 0) {
        damageButton.click(async ev => {
            ev.preventDefault();
            const damageFormula = ev.currentTarget.dataset.damage;
            const weaponName = ev.currentTarget.dataset.weapon || "Weapon";
            const ad = ev.currentTarget.dataset.ad || 0; 

            if (!damageFormula) return;

            let roll = new Roll(damageFormula);
            await roll.evaluate();

            // --- USE RENDER TEMPLATE HERE ---
            const templateData = {
                weaponName: weaponName.toUpperCase(),
                damageTotal: roll.total,
                ad: ad
            };
            
            // Render the new partial
            const chatContent = await renderTemplate("systems/sla-industries/templates/chat/chat-damage.hbs", templateData);

            roll.toMessage({
                speaker: message.speaker,
                content: chatContent
            });
        });
    }

    // 2. APPLY DAMAGE BUTTON
    const applyButton = html.find('.apply-damage');
    if (applyButton.length > 0) {
        applyButton.click(async ev => {
            // ... (Your existing Apply Damage logic remains exactly the same) ...
            ev.preventDefault();
            const rawDamage = parseInt(ev.currentTarget.dataset.damage);
            const ad = parseInt(ev.currentTarget.dataset.ad) || 0;
            const targets = canvas.tokens.controlled;

            if (targets.length === 0) return ui.notifications.warn("Select a token on the map to apply damage.");

            for (let token of targets) {
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
                    if (finalDamage > (currentHP / 2)) {
                        woundWarning = `<div style="color:#f55; font-weight:bold; margin-top:5px; border-top:1px solid #555;">⚠️ MASSIVE DAMAGE: Apply a Wound!</div>`;
                    }
                    
                    ui.notifications.info(`${actor.name} takes ${finalDamage} damage! (Roll ${rawDamage} - PV ${highestPV})${armorMsg}`);
                    
                    ChatMessage.create({
                        content: `<div style="background:#220000; color:#fff; padding:5px; border:1px solid #a00;"><strong>${actor.name}</strong> takes ${finalDamage} Damage.<br><span style="font-size:0.8em; color:#aaa;">(Roll ${rawDamage} - PV ${highestPV})</span>${armorMsg}${woundWarning}</div>`,
                        speaker: message.speaker
                    });
                } else {
                    ui.notifications.info(`${actor.name} resisted all damage (PV ${highestPV}).${armorMsg}`);
                }
            }
        });
    }

    // 3. TOGGLE ROLL BREAKDOWN (Keep as is)
    html.find('.roll-toggle').click(ev => {
        ev.preventDefault();
        const toggler = $(ev.currentTarget);
        const tooltip = toggler.parents('.message-content').find('.dice-tooltip');
        if (tooltip.is(':visible')) tooltip.slideUp(200);
        else tooltip.slideDown(200);
    });
});