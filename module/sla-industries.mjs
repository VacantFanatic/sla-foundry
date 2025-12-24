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

import { migrateWorld, CURRENT_MIGRATION_VERSION } from "./migration.mjs";

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
  
  game.settings.register("sla-industries", "systemMigrationVersion", {
    name: "System Migration Version",
    scope: "world",
    config: false,  // Hide from UI
    type: String,
    default: "0.0.0"
  });
  
  CONFIG.statusEffects = [
    { id: "dead", label: "EFFECT.StatusDead", icon: "icons/svg/skull.svg" },
    { id: "prone", label: "Prone", icon: "icons/svg/falling.svg" },
    { id: "stunned", label: "Stunned", icon: "icons/svg/daze.svg" },
    { id: "blind", label: "Blind", icon: "icons/svg/blind.svg" },
    { id: "burning", label: "Burning", icon: "icons/svg/fire.svg" },
    { id: "bleeding", label: "Bleeding", icon: "icons/svg/blood.svg" },
    { id: "immobile", label: "Immobile", icon: "icons/svg/net.svg" },
    { id: "critical", label: "Critical", icon: "icons/svg/skull.svg" }
  ];

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
  
  // REGISTER HANDLEBARS HELPERS
  Handlebars.registerHelper('capitalize', function(str) {
    if (typeof str !== 'string') return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  });

  Handlebars.registerHelper('upper', function(str) {
    if (typeof str !== 'string') return '';
    return str.toUpperCase();
  });

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
/* Global Listeners (Rolling & Applying Damage) */
/* -------------------------------------------- */
Hooks.once("ready", async function() {
    
    // 1. Check current schema version
    const currentVersion = game.settings.get("sla-industries", "systemMigrationVersion");

    // 2. If world is older than our code, Run Migration
    // Note: This is a simple string check. For complex versioning (1.10 vs 1.9), 
    // you might need `isNewerVersion()` helper provided by Foundry.
    if (foundry.utils.isNewerVersion(CURRENT_MIGRATION_VERSION, currentVersion)) {
        await migrateWorld();
    }
	
	// =========================================================
    // PART 1: ROLL DAMAGE (Standard Button & Tactical Choices)
    // =========================================================
    
    // FIX: Remove existing listener before adding new one to prevent double rolls
    $(document.body).off("click", ".chat-btn-wound, .chat-btn-damage, .damage-roll");
    
    $(document.body).on("click", ".chat-btn-wound, .chat-btn-damage, .damage-roll", async (ev) => {
        ev.preventDefault();
        const btn = $(ev.currentTarget);
        const card = btn.closest(".sla-chat-card");
        
        // Determine Action Type
        const action = btn.data("action") || "standard";
        
        // 1. Get Actor
        const uuid = card.data("actor-uuid");
        const actorId = card.data("actor-id");
        let actor = uuid ? await fromUuid(uuid) : game.actors.get(actorId);

        if (!actor) return ui.notifications.error("SLA | Actor not found.");
        if (!actor.isOwner) return ui.notifications.warn("You do not own this actor.");

        // 2. Data Setup
        let rollFormula = "";
        let flavorText = "";
        let adValue = Number(btn.data("ad") || 0);

        // Disable button to prevent double clicks
        btn.prop("disabled", true);

        // --- BRANCH A: TACTICAL CHOICE (MOS 2/3) ---
        if (action === "damage" || action === "wound") {
            const baseFormula = String(btn.data("base-formula") || "0");
            const bonus = Number(btn.data("damage-bonus") || 0);

            // DAMAGE CHOICE
            if (action === "damage") {
                flavorText = `<span style="color:#39ff14">Tactical Choice: +${bonus} Damage</span>`;
                rollFormula = `${baseFormula} + ${bonus}`;
            } 
            // WOUND CHOICE
            else if (action === "wound") {
                const location = btn.data("location");
                let woundSuccess = false;
                
                // Update Wounds Logic
                const wounds = actor.system.wounds;
                if (location === "arm") {
                    if (!wounds.larm) { await actor.update({"system.wounds.larm": true}); woundSuccess = true; flavorText = `<span style="color:#ff4444">Snapped Left Arm!</span>`; }
                    else if (!wounds.rarm) { await actor.update({"system.wounds.rarm": true}); woundSuccess = true; flavorText = `<span style="color:#ff4444">Snapped Right Arm!</span>`; }
                } else if (location === "leg") {
                    if (!wounds.lleg) { await actor.update({"system.wounds.lleg": true}); woundSuccess = true; flavorText = `<span style="color:#ff4444">Broken Left Leg!</span>`; }
                    else if (!wounds.rleg) { await actor.update({"system.wounds.rleg": true}); woundSuccess = true; flavorText = `<span style="color:#ff4444">Broken Right Leg!</span>`; }
                }

                if (woundSuccess) {
                    // Success: Roll Base Only
                    rollFormula = baseFormula;
                } else {
                    // Failure: Fallback to Damage
                    flavorText = `<span style="color:orange">Limbs Gone! Reverting to +${bonus} Dmg.</span>`;
                    rollFormula = `${baseFormula} + ${bonus}`;
                }
            }
        }

        // --- BRANCH B: STANDARD ROLL (Normal Hit) ---
        else {
            rollFormula = String(btn.data("formula") || "0");
            flavorText = "Standard Damage Roll";
        }

        // 3. EXECUTE ROLL & RENDER CARD
        console.log("SLA | Rolling Damage:", rollFormula);
        let roll = new Roll(rollFormula);
        await roll.evaluate();

        const templateData = {
            damageTotal: roll.total,
            adValue: adValue,
            flavor: flavorText
        };
        
        const content = await renderTemplate("systems/sla-industries/templates/chat/chat-damage.hbs", templateData);

        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: actor }),
            content: content
        });
    });


    // =========================================================
    // PART 2: APPLY DAMAGE (Reduces HP & Armor)
    // =========================================================
    
    // FIX: Remove existing listener first
    $(document.body).off("click", ".apply-damage-btn");

    $(document.body).on("click", ".apply-damage-btn", async (ev) => {
        ev.preventDefault();
        const btn = $(ev.currentTarget);
        
        // 1. Get Data from Button
        const rawDamage = Number(btn.data("dmg"));
        const ad = Number(btn.data("ad"));
        const type = btn.data("target"); 

        // 2. Find Victim (Selected or Target)
        let victim = null;
        if (type === "selected") {
            victim = canvas.tokens.controlled[0]?.actor;
            if (!victim) return ui.notifications.warn("No token selected.");
        } else {
            victim = game.user.targets.first()?.actor;
            if (!victim) return ui.notifications.warn("No target designated.");
        }

        // 3. ARMOR LOGIC (Find Equipped Armor)
        const armorItem = victim.items.find(i => i.type === "armor" && i.system.equipped);
        
        let targetPV = 0;
        let armorData = null; // Replaces 'armorUpdateMsg' string

        // A. Determine PV (Protection Value)
        if (armorItem) {
            targetPV = armorItem.system.pv || 0;
        } else if (victim.system.armor?.pv) {
            // Natural Armor Fallback (NPCs)
            targetPV = victim.system.armor.pv || 0;
        }

        // B. Apply AD (Armor Degradation)
        if (armorItem && ad > 0) {
            const currentRes = armorItem.system.resistance?.value || 0;
            const newRes = Math.max(0, currentRes - ad);
            
            // Update the Item
            await armorItem.update({ "system.resistance.value": newRes });
            
            // Prepare Data for Template
            armorData = {
                current: currentRes,
                new: newRes,
                ad: ad
            };
        }

        // 4. DAMAGE CALCULATION (Dmg - PV)
        let finalDamage = Math.max(0, rawDamage - targetPV);

        // 5. APPLY TO HP
        let currentHP = victim.system.hp.value;
        let newHP = currentHP - finalDamage;

        await victim.update({ "system.hp.value": newHP });

        // 6. CHAT REPORT (Moved to Partial)
        const templateData = {
            victimName: victim.name,
            rawDamage: rawDamage,
            targetPV: targetPV,
            finalDamage: finalDamage,
            hpData: {
                old: currentHP,
                new: newHP
            },
            armorData: armorData
        };

        const content = await renderTemplate("systems/sla-industries/templates/chat/chat-damage-result.hbs", templateData);

        ChatMessage.create({
            content: content
        });
    });
    
    // =========================================================
    // PART 3: TOGGLE ROLL TOOLTIP (Click the Number)
    // =========================================================
    
    // FIX: Remove existing listener first
    $(document.body).off("click", ".roll-toggle");

    $(document.body).on("click", ".roll-toggle", (ev) => {
        ev.preventDefault();
        const btn = $(ev.currentTarget);
        const card = btn.closest(".sla-chat-card");
        const tooltip = card.find(".dice-tooltip");
        
        if (tooltip.length) {
            tooltip.slideToggle(200);
        }
    });

});