export const SLA = {};

SLA.ammoTypes = {
  "standard": "Standard",
  "he": "High Explosive (HE)",
  "ap": "Armour Piercing (AP)",
  "shotgun_std": "Shotgun Shot (Standard)",
  "shotgun_slug": "Shotgun Slug"
};

// Define the math for each type
SLA.ammoModifiers = {
  "standard": { damage: 0, ad: 0, pv: 0 },
  "he": { damage: 1, ad: 1, pv: 0 },
  "ap": { damage: 0, ad: 0, pv: -2 }, // Handled during damage application
  "shotgun_std": { damage: 0, ad: 0, pv: 0 },
  "shotgun_slug": { damage: 1, ad: -1, pv: 0 }
};

// 1. STATS (Used by Skills & Drugs)
SLA.stats = {
  str: "Strength",
  dex: "Dexterity",
  know: "Knowledge",
  conc: "Concentration",
  cha: "Charisma",
  cool: "Cool",
  luck: "Luck",
  end: "Endurance"
};

// 2. SKILL TYPES (Used by Skills)
// *If your skill sheet looks for 'config.skillTypes'*
SLA.skillTypes = {
  general: "General",
  combat: "Combat",
  knowledge: "Knowledge",
  technical: "Technical"
};

// 3. COMBAT SKILLS (Used by Weapons/Ebb)
// *If your Ebb sheet looks for 'config.combatSkills' or 'config.skills'*
SLA.combatSkills = {
  pistol: "Pistol",
  rifle: "Rifle",
  melee: "Melee",
  unarmed: "Unarmed",
  throw: "Throwing"
};

// 4. DISCIPLINES (Used by Ebb Formulas)
// *This is the most likely cause for Ebb crash*
SLA.disciplineSkills = {
  awareness: "Awareness",
  blast: "Blast",
  communicate: "Communicate",
  enhance: "Enhance",
  heal: "Heal",
  protect: "Protect",
  realityFold: "Reality Fold",
  senses: "Senses",
  telekinesis: "Telekinesis",
  thermal: "Thermal"
};

// 5. INITIATIVE FORMULA
SLA.combatInitiative = {
  formula: "1d10 + @stats.init.value",
  decimals: 2
};

// 6. STATUS EFFECTS
SLA.statusEffects = [
  { id: "dead", name: "EFFECT.StatusDead", img: "icons/svg/skull.svg" },
  { id: "prone", name: "Prone", img: "icons/svg/falling.svg" },
  { id: "stunned", name: "Stunned", img: "icons/svg/daze.svg" },
  { id: "blind", name: "Blind", img: "icons/svg/blind.svg" },
  { id: "burning", name: "Burning", img: "icons/svg/fire.svg" },
  { id: "bleeding", name: "Bleeding", img: "icons/svg/blood.svg" },
  { id: "immobile", name: "Immobile", img: "icons/svg/net.svg" },
  { id: "critical", name: "Critical", img: "icons/svg/skull.svg" }
];

// 7. TRACKABLE ATTRIBUTES (Bars)
SLA.trackableAttributes = {
  character: {
    bar: ["attributes.hp", "attributes.flux"],
    value: ["move.closing", "move.rushing", "encumbrance.value"]
  },
  npc: {
    bar: ["attributes.hp"],
    value: ["move.closing", "move.rushing"]
  }
};

