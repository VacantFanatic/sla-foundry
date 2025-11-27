// Import document classes.
import { BoilerplateActor } from "./documents/actor.mjs";
import { BoilerplateItem } from "./documents/item.mjs";

// Import sheet classes.
import { SlaActorSheet } from "./sheets/actor-sheet.mjs";
import { SlaItemSheet } from "./sheets/item-sheet.mjs";

// Import ruler.
import { SLARuler } from "./canvas/sla-ruler.mjs";

// Import helpers.
import { preloadHandlebarsTemplates } from "./helpers/templates.mjs";

/* -------------------------------------------- */
/* 1. DEFINE CONFIGURATION                      */
/* -------------------------------------------- */
const SLA_CONFIG = {
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
    combatSkills: {
        "pistol": "Pistol", "rifle": "Rifle", "melee": "Melee", "unarmed": "Unarmed", "thrown": "Thrown", "heavy": "Heavy Weapons", "support": "Support Weapons"
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
  CONFIG.Canvas.rulerClass = SLARuler;

  CONFIG.Combat.initiative = {
    formula: "1d10 + @stats.init.value",
    decimals: 2
  };
  
  // -----------------------------------------------------------
  // NEW: CUSTOM STATUS EFFECTS (Conditions)
  // -----------------------------------------------------------
  CONFIG.statusEffects = [
    { id: "dead", label: "Dead", icon: "icons/svg/skull.svg" },
    { id: "bleeding", label: "Bleeding", icon: "icons/svg/blood.svg" },
    { id: "burning", label: "Burning", icon: "icons/svg/fire.svg" },
    { id: "critical", label: "Critical", icon: "icons/svg/degen.svg" }, // Usually HP <= 0
    { id: "prone", label: "Prone", icon: "icons/svg/falling.svg" },
    { id: "stunned", label: "Stunned", icon: "icons/svg/daze.svg" },
    { id: "immobile", label: "Immobile", icon: "icons/svg/net.svg" }
  ];

  CONFIG.Actor.trackableAttributes = {
    character: { bar: ["attributes.hp", "attributes.flux"], value: ["move.closing", "move.rushing", "encumbrance.value"] },
    npc: { bar: ["attributes.hp"], value: ["move.closing", "move.rushing"] }
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
            
            // FIX: Get AD directly from the button attribute
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

    // 2. APPLY DAMAGE & AD
    const applyButton = html.find('.apply-damage');
    if (applyButton.length > 0) {
        applyButton.click(async ev => {
            ev.preventDefault();
            const rawDamage = parseInt(ev.currentTarget.dataset.damage);
            const ad = parseInt(ev.currentTarget.dataset.ad) || 0;
            const targets = canvas.tokens.controlled;

            if (targets.length === 0) return ui.notifications.warn("Select a token.");

            for (let token of targets) {
                const actor = token.actor;
                if (!actor) continue;

                // --- A. APPLY ARMOR DAMAGE ---
                let armorMsg = "";
                const armors = actor.items.filter(i => i.type === 'armor' && i.system.equipped);
                armors.sort((a, b) => (b.system.pv || 0) - (a.system.pv || 0));

                if (armors.length > 0 && ad > 0) {
                    const mainArmor = armors[0];
                    const currentRes = mainArmor.system.resistance?.value || 0;
                    const newRes = Math.max(0, currentRes - ad);
                    if (currentRes !== newRes) {
                        await mainArmor.update({ "system.resistance.value": newRes });
                        armorMsg = `<br><em>${mainArmor.name} degraded by ${ad} AD.</em>`;
                    }
                }

                // --- B. RECALCULATE PV ---
                const updatedArmor = actor.items.filter(i => i.type === 'armor' && i.system.equipped);
                let highestPV = 0;
                for (let arm of updatedArmor) {
                    let pv = arm.system.pv || 0;
                    let res = arm.system.resistance;
                    if (res) {
                        if (res.value <= 0) pv = 0;
                        else if (res.value < (res.max / 2)) pv = Math.floor(pv / 2);
                    }
                    if (pv > highestPV) highestPV = pv;
                }

                // --- C. APPLY HP DAMAGE ---
                const finalDamage = Math.max(0, rawDamage - highestPV);
                const currentHP = actor.system.hp.value;
                const newHP = currentHP - finalDamage;
                await actor.update({ "system.hp.value": newHP });

                // --- D. CHECK WOUND THRESHOLD ---
                // "Wounds are caused... from a single attack that causes a character to lose more than 50% of their remaining Hit Points."
                let woundWarning = "";
                if (finalDamage > (currentHP / 2)) {
                    woundWarning = `<div style="color:#f55; font-weight:bold; margin-top:5px; border-top:1px solid #555;">⚠️ MASSIVE DAMAGE: Apply a Wound!</div>`;
                }

                // --- E. NOTIFY ---
                if (finalDamage > 0) {
                    ui.notifications.info(`${actor.name} takes ${finalDamage} damage!`);
                    
                    // Create floating text
                    if (canvas.interface?.createScrollingText) {
                        canvas.interface.createScrollingText(token.center, `-${finalDamage}`, {
                            anchor: CONST.TEXT_ANCHOR_POINTS.TOP,
                            fill: "0xFF0000", stroke: "0x000000", strokeThickness: 4, jitter: 0.25
                        });
                    }

                    // Chat Confirmation
                    ChatMessage.create({
                        content: `
                        <div style="background:#220000; color:#fff; padding:5px; border:1px solid #a00;">
                            <strong>${actor.name}</strong> takes ${finalDamage} Damage.
                            <br><span style="font-size:0.8em; color:#aaa;">(Roll ${rawDamage} - PV ${highestPV})</span>
                            ${armorMsg}
                            ${woundWarning}
                        </div>`
                    });

                } else {
                    ui.notifications.info(`${actor.name} resisted all damage (PV ${highestPV}).`);
                }
            }
        });
    }
});