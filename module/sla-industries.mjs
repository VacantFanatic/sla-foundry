// Import document classes.
import { BoilerplateActor } from "./documents/actor.mjs";
import { BoilerplateItem } from "./documents/item.mjs";

// Import sheet classes.
import { SlaActorSheet } from "./sheets/actor-sheet.mjs";
import { SlaItemSheet } from "./sheets/item-sheet.mjs";

// Import helpers.
import { preloadHandlebarsTemplates } from "./helpers/templates.mjs";

/* -------------------------------------------- */
/* 1. DEFINE CONFIGURATION                      */
/* -------------------------------------------- */
const SLA_CONFIG = {
    // SPECIES DATA
    speciesStats: {
        "human": { label: "Human", stats: { str: {min:1, max:3}, dex: {min:1, max:4}, know: {min:2, max:5}, conc: {min:1, max:5}, cha: {min:1, max:5}, cool: {min:1, max:5}, luck: {min:1, max:6} } },
        "frother": { label: "Frother", stats: { str: {min:2, max:4}, dex: {min:2, max:4}, know: {min:1, max:5}, conc: {min:1, max:3}, cha: {min:0, max:4}, cool: {min:1, max:5}, luck: {min:1, max:3} } },
        "ebonite": { label: "Ebonite", stats: { str: {min:0, max:3}, dex: {min:1, max:4}, know: {min:1, max:5}, conc: {min:2, max:6}, cha: {min:1, max:5}, cool: {min:1, max:5}, luck: {min:2, max:6} } },
        "stormer313": { label: "Stormer 313", stats: { str: {min:3, max:6}, dex: {min:2, max:6}, know: {min:0, max:2}, conc: {min:0, max:3}, cha: {min:0, max:3}, cool: {min:3, max:6}, luck: {min:0, max:2} } },
        "stormer711": { label: "Stormer 711", stats: { str: {min:2, max:5}, dex: {min:3, max:5}, know: {min:0, max:3}, conc: {min:1, max:4}, cha: {min:0, max:2}, cool: {min:2, max:6}, luck: {min:0, max:2} } },
        "shaktar": { label: "Shaktar", stats: { str: {min:3, max:5}, dex: {min:2, max:5}, know: {min:1, max:4}, conc: {min:0, max:3}, cha: {min:1, max:3}, cool: {min:1, max:6}, luck: {min:0, max:3} } },
        "wraithen": { label: "Wraithen", stats: { str: {min:1, max:3}, dex: {min:3, max:6}, know: {min:1, max:4}, conc: {min:1, max:4}, cha: {min:1, max:4}, cool: {min:0, max:5}, luck: {min:1, max:4} } },
        "carrien": { label: "Adv. Carrien", stats: { str: {min:3, max:5}, dex: {min:1, max:5}, know: {min:0, max:2}, conc: {min:1, max:4}, cha: {min:0, max:3}, cool: {min:3, max:6}, luck: {min:0, max:3} } },
        "neophron": { label: "Neophron", stats: { str: {min:0, max:2}, dex: {min:0, max:3}, know: {min:2, max:6}, conc: {min:2, max:6}, cha: {min:3, max:6}, cool: {min:1, max:5}, luck: {min:0, max:3} } }
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

  // 3. Register Sheets
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("sla-industries", SlaActorSheet, { types: ["character", "npc"], makeDefault: true, label: "SLA Operative Sheet" });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("sla-industries", SlaItemSheet, { makeDefault: true, label: "SLA Item Sheet" });

  // 4. Load Templates
  return preloadHandlebarsTemplates();
});

/* -------------------------------------------- */
/* Handlebars Helpers                          */
/* -------------------------------------------- */

// NOTE: We REMOVED 'selectOptions' because Foundry provides it natively.
// Overwriting it caused the [object Object] error.

Handlebars.registerHelper('toLowerCase', function (str) { return str ? str.toLowerCase() : ""; });
Handlebars.registerHelper('eq', function (a, b) { return a === b; });
Handlebars.registerHelper('or', function (a, b) { return a || b; });
Handlebars.registerHelper('gt', function (a, b) { return a > b; });

/* -------------------------------------------- */
/* Chat Listener (Damage Button)               */
/* -------------------------------------------- */
Hooks.on('renderChatMessage', (message, html, data) => {
    const damageButton = html.find('.roll-damage');
    if (damageButton.length > 0) {
        damageButton.click(async ev => {
            ev.preventDefault();
            const damageFormula = ev.currentTarget.dataset.damage;
            const weaponName = ev.currentTarget.dataset.weapon;
            let roll = new Roll(damageFormula);
            await roll.evaluate();
            roll.toMessage({
                speaker: message.speaker,
                flavor: `<div style="background:#110000;border:1px solid #a00;color:#eee;padding:5px;"><h3 style="color:#f00;margin:0;border-bottom:1px solid #500;">DAMAGE: ${weaponName}</h3><div style="text-align:center;font-size:1.5em;font-weight:bold;margin-top:5px;">${roll.total} <span style="font-size:0.5em;color:#777;">(Points)</span></div></div>`
            });
        });
    }
});