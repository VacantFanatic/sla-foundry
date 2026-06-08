/**
 * Document type keys registered in CONFIG.*.dataModels.
 * Must stay in sync with system.json documentTypes and module/data/registry.mjs.
 */
export const ACTOR_DATA_MODEL_TYPE_KEYS = Object.freeze(["character", "npc", "vehicle"]);

export const ITEM_DATA_MODEL_TYPE_KEYS = Object.freeze([
    "item",
    "skill",
    "trait",
    "weapon",
    "explosive",
    "armor",
    "ebbFormula",
    "discipline",
    "drug",
    "toxicant",
    "species",
    "package",
    "magazine"
]);
