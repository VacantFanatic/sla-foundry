import { SlaCharacterData, SlaNPCData, SlaVehicleData } from "./actor.mjs";
import {
    SlaItemData,
    SlaSkillData,
    SlaTraitData,
    SlaWeaponData,
    SlaExplosiveData,
    SlaArmorData,
    SlaEbbFormulaData,
    SlaDisciplineData,
    SlaDrugData,
    SlaToxicantData,
    SlaSpeciesData,
    SlaPackageData,
    SlaMagazineData
} from "./item.mjs";
import { ACTOR_DATA_MODEL_TYPE_KEYS, ITEM_DATA_MODEL_TYPE_KEYS } from "./model-type-keys.mjs";

/** @type {Record<string, typeof foundry.abstract.TypeDataModel>} */
export const ACTOR_DATA_MODELS = {
    character: SlaCharacterData,
    npc: SlaNPCData,
    vehicle: SlaVehicleData
};

/** @type {Record<string, typeof foundry.abstract.TypeDataModel>} */
export const ITEM_DATA_MODELS = {
    item: SlaItemData,
    skill: SlaSkillData,
    trait: SlaTraitData,
    weapon: SlaWeaponData,
    explosive: SlaExplosiveData,
    armor: SlaArmorData,
    ebbFormula: SlaEbbFormulaData,
    discipline: SlaDisciplineData,
    drug: SlaDrugData,
    toxicant: SlaToxicantData,
    species: SlaSpeciesData,
    package: SlaPackageData,
    magazine: SlaMagazineData
};

const actorKeys = Object.keys(ACTOR_DATA_MODELS).sort();
const itemKeys = Object.keys(ITEM_DATA_MODELS).sort();

if (actorKeys.join() !== [...ACTOR_DATA_MODEL_TYPE_KEYS].sort().join()) {
    throw new Error("ACTOR_DATA_MODELS keys are out of sync with model-type-keys.mjs");
}
if (itemKeys.join() !== [...ITEM_DATA_MODEL_TYPE_KEYS].sort().join()) {
    throw new Error("ITEM_DATA_MODELS keys are out of sync with model-type-keys.mjs");
}
