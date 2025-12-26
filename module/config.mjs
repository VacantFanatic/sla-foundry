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
  telepathy: "Telepathy",
  telekinesis: "Telekinesis",
  pyrokinesis: "Pyrokinesis",
  cryokinesis: "Cryokinesis",
  biokinesis: "Biokinesis",
  necroun: "Necroun"
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

// 8. SPECIES STATS (Initial & Max)
SLA.speciesStats = {
  "human": {
    label: "Human",
    stats: {
      str: { min: 1, max: 3 },
      dex: { min: 1, max: 4 },
      know: { min: 2, max: 5 },
      conc: { min: 1, max: 5 },
      cha: { min: 1, max: 5 },
      cool: { min: 1, max: 5 },
      luck: { min: 1, max: 6 }
    }
  },
  "frother": {
    label: "Frother",
    stats: {
      str: { min: 2, max: 4 },
      dex: { min: 2, max: 4 },
      know: { min: 1, max: 5 },
      conc: { min: 1, max: 3 },
      cha: { min: 0, max: 4 },
      cool: { min: 1, max: 5 },
      luck: { min: 1, max: 3 }
    }
  },
  "ebonite": {
    label: "Ebonite",
    stats: {
      str: { min: 0, max: 3 },
      dex: { min: 1, max: 4 },
      know: { min: 1, max: 5 },
      conc: { min: 2, max: 6 },
      cha: { min: 1, max: 5 },
      cool: { min: 1, max: 5 },
      luck: { min: 2, max: 6 }
    }
  },
  "stormer313": {
    label: "Stormer 313 'Malice'",
    stats: {
      str: { min: 3, max: 6 },
      dex: { min: 2, max: 6 },
      know: { min: 0, max: 2 },
      conc: { min: 0, max: 3 },
      cha: { min: 0, max: 3 },
      cool: { min: 3, max: 6 },
      luck: { min: 0, max: 2 }
    }
  },
  "stormer711": {
    label: "Stormer 711 'Xeno'",
    stats: {
      str: { min: 2, max: 5 },
      dex: { min: 3, max: 5 },
      know: { min: 0, max: 3 },
      conc: { min: 1, max: 4 },
      cha: { min: 0, max: 2 },
      cool: { min: 2, max: 6 },
      luck: { min: 0, max: 2 }
    }
  },
  "shaktar": {
    label: "Shaktar",
    stats: {
      str: { min: 3, max: 5 },
      dex: { min: 2, max: 5 },
      know: { min: 1, max: 4 },
      conc: { min: 0, max: 3 },
      cha: { min: 1, max: 3 },
      cool: { min: 1, max: 6 },
      luck: { min: 0, max: 3 }
    }
  },
  "wraithen": {
    label: "Wraithen",
    stats: {
      str: { min: 1, max: 3 },
      dex: { min: 3, max: 6 },
      know: { min: 1, max: 4 },
      conc: { min: 1, max: 4 },
      cha: { min: 1, max: 4 },
      cool: { min: 0, max: 5 },
      luck: { min: 1, max: 4 }
    }
  },
  "carrien": {
    label: "Advanced Carrien",
    stats: {
      str: { min: 3, max: 5 },
      dex: { min: 1, max: 5 },
      know: { min: 0, max: 2 },
      conc: { min: 1, max: 4 },
      cha: { min: 0, max: 3 },
      cool: { min: 3, max: 6 },
      luck: { min: 0, max: 3 }
    }
  },
  "neophron": {
    label: "Neophron",
    stats: {
      str: { min: 0, max: 2 },
      dex: { min: 0, max: 3 },
      know: { min: 2, max: 6 },
      conc: { min: 2, max: 6 },
      cha: { min: 3, max: 6 },
      cool: { min: 1, max: 5 },
      luck: { min: 0, max: 3 }
    }
  }
};

// 9. HELPER LIST FOR DROPDOWNS
SLA.species = Object.keys(SLA.speciesStats).reduce((acc, key) => {
  acc[key] = SLA.speciesStats[key].label;
  return acc;
}, {});