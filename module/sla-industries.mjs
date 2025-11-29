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

/* -------------------------------------------- */
/* 1. DEFINE CONFIGURATION                      */
/* -------------------------------------------- */
const SLA_CONFIG = {
    // SPECIES DATA
    speciesStats: {
        "human": { label: "Human", hp: 14, move: { closing: 2, rushing: 5 }, stats: { str: {min:1, max:3}, dex: {min:1, max:4}, know: {min:2, max:5}, conc: {min:1, max:5}, cha: {min:1, max:5}, cool: {min:1, max:5}, luck: {min:1, max:6} } },
        "frother": { label: "Frother", hp: 15, move: { closing: 2, rushing: 5 }, stats: { str: {min:2, max:4}, dex: {min:2, max:4}, know: {min:1, max:5}, conc: {min:1, max:3}, cha: {min:0, max:4}, cool: {min:1, max:5}, luck: {min:1, max:3} } },
        "ebonite": { label: "Ebonite", hp: 14, move: { closing: 2, rushing: 5 }, stats: { str: {min:0, max:3}, dex: {min:1, max:4}, know: {min:1, max:5}, conc: {min:2, max:6}, cha: {min:1, max:5}, cool: {min:1, max:5}, luck: {min:2, max:6} } },
        "stormer313": { label: "Stormer 313", hp: 22, move: { closing: 3, rushing: 6 }, stats: { str: {min:3, max:6}, dex: {min:2, max:6}, know: {min:0, max:2}, conc: {min:0, max:3}, cha: {min:0, max:3}, cool: {min:3, max:6}, luck: {min:0, max:2} } },
        "stormer711": { label: "Stormer 711", hp: 20, move: { closing: 4, rushing: 6 }, stats: { str: {min:2, max:5}, dex: {min:3, max:5}, know: {min:0, max:3}, conc: {min:1, max:4}, cha: {min:0, max:2}, cool: {min:2, max:6}, luck: {min:0, max:2} } },
        "shaktar": { label: "Shaktar", hp: 19, move: { closing: 3, rushing: 6 }, stats: { str: {min:3, max:5}, dex: {min:2, max:5}, know: {min:1, max:4}, conc: {min:0, max:3}, cha: {min:1, max:3}, cool: {min:1, max:6}, luck: {min:0, max:3} } },
        "wraithen": { label: "Wraithen", hp: 14, move: { closing: 4, rushing: 8 }, stats: { str: {min:1, max:3}, dex: {min:3, max:6}, know: {min:1, max:4}, conc: {min:1, max:4}, cha: {min:1, max:4}, cool: {min:0, max:5}, luck: {min:1, max:4} } },
        "carrien": { label: "Adv. Carrien", hp: 20, move: { closing: 4, rushing: 7 }, stats: { str: {min:3, max:5}, dex: {min:1, max:5}, know: {min:0, max:2}, conc: {min:1, max:4}, cha: {min:0, max:3}, cool: {min:3, max:6}, luck: {min:0, max:3} } },
        "neophron": { label: "Neophron", hp: 11, move: { closing: 2, rushing: 5 }, stats: { str: {min:0, max:2}, dex: {min:0, max:3}, know: {min:2, max:6}, conc: {min:2, max:6}, cha: {min:3, max:6}, cool: {min:1, max:5}, luck: {min:0, max:3} } }
    },

    // COMBAT SKILLS LIST
    combatSkills: {
        "pistol": "Pistol",
        "rifle": "Rifle",
        "melee": "Melee",
        "unarmed": "Unarmed",
        "thrown": "Thrown",
        "heavy": "Heavy Weapons",
        "support": "Support Weapons"
    },

    // EBB DISCIPLINES
    ebbDisciplines: {
        "awareness": "Awareness",
        "blast": "Blast",
        "communicate": "Communicate",
        "enhance": "Enhance",
        "heal": "Heal",
        "protect": "Protect",
        "realityFolding": "Reality Folding",
        "senses": "Senses",
        "telekinesis": "Telekinesis",
        "thermal": "Thermal"
    }
};

/* -------------------------------------------- */
/* Init Hook                                   */
/* -------------------------------------------- */
Hooks.once('init', async function() {
  console.log("SLA INDUSTRIES | Initializing System...");

  // 1. Make config global
  CONFIG.SLA = SLA_CONFIG; 

  // 2. Register Classes
  game.boilerplate = { SlaActorSheet, SlaItemSheet, BoilerplateActor, BoilerplateItem };
  CONFIG.Actor.documentClass = BoilerplateActor;
  CONFIG.Item.documentClass = BoilerplateItem;

  // 3. Register Custom Ruler
  //CONFIG.Canvas.rulerClass = SLARuler;
  CONFIG.Token.rulerClass = SLATokenRuler;

  // 4. Combat Settings
  CONFIG.Combat.initiative = {
    formula: "1d10 + @stats.init.value",
    decimals: 2
  };

  // 5. Trackable Attributes (Token Bars)
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
  
  // -----------------------------------------------------------
  // 6. DEFINE CUSTOM STATUS EFFECTS
  // These map icons to the boolean flags in your system.
  // -----------------------------------------------------------
  CONFIG.statusEffects = [
    {
      id: "dead",
      label: "Dead",
      icon: "icons/svg/skull.svg",
      // Dead is usually handled by HP 0 logic, but this allows manual toggle
      changes: [{ key: "system.conditions.dead", mode: 5, value: true }] 
    },
    {
      id: "bleeding",
      label: "Bleeding",
      icon: "icons/svg/blood.svg",
      changes: [{ key: "system.conditions.bleeding", mode: 5, value: true }]
    },
    {
      id: "burning",
      label: "Burning",
      icon: "icons/svg/fire.svg",
      changes: [{ key: "system.conditions.burning", mode: 5, value: true }]
    },
    {
      id: "prone",
      label: "Prone",
      icon: "icons/svg/falling.svg",
      changes: [{ key: "system.conditions.prone", mode: 5, value: true }]
    },
    {
      id: "stunned",
      label: "Stunned",
      icon: "icons/svg/daze.svg",
      changes: [{ key: "system.conditions.stunned", mode: 5, value: true }]
    },
    {
      id: "immobile",
      label: "Immobile",
      icon: "icons/svg/net.svg",
      changes: [{ key: "system.conditions.immobile", mode: 5, value: true }]
    },
    {
      id: "critical",
      label: "Critical",
      icon: "icons/svg/degen.svg",
      changes: [{ key: "system.conditions.critical", mode: 5, value: true }]
    }
  ];

  // 7. Item Type Labels (Fixes [object Object] error)
	CONFIG.Item.typeLabels = {
		"item": "Item", 
		"skill": "Skill", 
		"trait": "Trait", 
		"weapon": "Weapon", 
		"armor": "Armor", 
		"ebbFormula": "Ebb Formula",
		"discipline": "Discipline",
		"drug": "Combat Drug" // <--- THIS LABEL IS CRITICAL
	};

  // 8. Register Sheets
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("sla-industries", SlaActorSheet, { 
      types: ["character", "npc"], 
      makeDefault: true, 
      label: "SLA Operative Sheet" 
  });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("sla-industries", SlaItemSheet, { 
      makeDefault: true, 
      label: "SLA Item Sheet" 
  });

  // 8. Load Templates
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
    
    // 1. ROLL DAMAGE BUTTON (From the Attack Card)
    const damageButton = html.find('.roll-damage');
    if (damageButton.length > 0) {
        damageButton.click(async ev => {
            ev.preventDefault();
            const damageFormula = ev.currentTarget.dataset.damage;
            const weaponName = ev.currentTarget.dataset.weapon;
            const ad = ev.currentTarget.dataset.ad || 0; 
            let roll = new Roll(damageFormula);
            await roll.evaluate();
            
            // Output Damage Card (Content hides default summary)
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

    // 2. APPLY DAMAGE BUTTON (Updates Targets)
    const applyButton = html.find('.apply-damage');
    if (applyButton.length > 0) {
        applyButton.click(async ev => {
            ev.preventDefault();
            const rawDamage = parseInt(ev.currentTarget.dataset.damage);
            const ad = parseInt(ev.currentTarget.dataset.ad) || 0;
            const targets = canvas.tokens.controlled;

            if (targets.length === 0) {
                ui.notifications.warn("Select a token on the map to apply damage.");
                return;
            }

            // Iterate through selected tokens
            for (let token of targets) {
                const actor = token.actor;
                if (!actor) continue;

                // A. ARMOR DAMAGE (Degrade Resistance first)
                let armorMsg = "";
                const armors = actor.items.filter(i => i.type === 'armor' && i.system.equipped);
                armors.sort((a, b) => (b.system.pv || 0) - (a.system.pv || 0));

                let highestPV = 0;

                if (armors.length > 0) {
                    const mainArmor = armors[0];
                    const currentRes = mainArmor.system.resistance?.value || 0;
                    
                    // Apply AD to Resistance
                    if (ad > 0 && currentRes > 0) {
                        const newRes = Math.max(0, currentRes - ad);
                        if (currentRes !== newRes) {
                            await mainArmor.update({ "system.resistance.value": newRes });
                            armorMsg = `<br><em>${mainArmor.name} degraded by ${ad} AD.</em>`;
                        }
                    }

                    // Recalculate PV based on NEW Resistance state
                    // We read the value again to ensure we have the post-update data if available,
                    // or we can calculate based on the variable we just set.
                    const finalRes = (ad > 0) ? Math.max(0, currentRes - ad) : currentRes;
                    const maxRes = mainArmor.system.resistance?.max || 1;
                    const basePV = mainArmor.system.pv || 0;

                    let effectivePV = basePV;
                    if (finalRes <= 0) effectivePV = 0;
                    else if (finalRes < (maxRes / 2)) effectivePV = Math.floor(basePV / 2);
                    
                    highestPV = effectivePV;
                }

                // B. APPLY HP DAMAGE
                const finalDamage = Math.max(0, rawDamage - highestPV);
                const currentHP = actor.system.hp.value;
                await actor.update({ "system.hp.value": currentHP - finalDamage });

                // C. NOTIFY & WOUND CHECK
                if (finalDamage > 0) {
                    let woundWarning = "";
                    if (finalDamage > (currentHP / 2)) {
                        woundWarning = `<div style="color:#f55; font-weight:bold; margin-top:5px; border-top:1px solid #555;">⚠️ MASSIVE DAMAGE: Apply a Wound!</div>`;
                    }
                    
                    ui.notifications.info(`${actor.name} takes ${finalDamage} damage! (PV ${highestPV})`);
                    
                    ChatMessage.create({
                        content: `
                        <div style="background:#220000; color:#fff; padding:5px; border:1px solid #a00;">
                            <strong>${actor.name}</strong> takes ${finalDamage} Damage.
                            <br><span style="font-size:0.8em; color:#aaa;">(Roll ${rawDamage} - PV ${highestPV})</span>
                            ${armorMsg}
                            ${woundWarning}
                        </div>`,
                        speaker: message.speaker
                    });
                } else {
                    ui.notifications.info(`${actor.name} resisted all damage (PV ${highestPV}).${armorMsg}`);
                }
            }
        });
    }
});