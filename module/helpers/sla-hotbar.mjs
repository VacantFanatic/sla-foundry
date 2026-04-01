/** @type {Promise<unknown> | null} */
let slaSheetClassesPromise = null;

function loadSlaSheetClasses() {
    slaSheetClassesPromise ??= Promise.all([
        import("../sheets/actor-sheet.mjs"),
        import("../sheets/actor-npc-sheet.mjs"),
        import("../sheets/actor-vehicle-sheet.mjs")
    ]);
    return slaSheetClassesPromise;
}

/**
 * Dynamic import avoids a circular dependency: actor-sheet → sla-hotbar → actor-npc-sheet → actor-sheet.
 * @param {Actor} actor
 */
async function createEphemeralSlaSheet(actor) {
    const [{ SlaActorSheet }, { SlaNPCSheet }, { SlaVehicleSheet }] = await loadSlaSheetClasses();
    const SheetClass = actor.type === "npc" ? SlaNPCSheet : actor.type === "vehicle" ? SlaVehicleSheet : SlaActorSheet;
    const sheet = Object.create(SheetClass.prototype);
    // ActorSheetV2 exposes `actor` / `document` as getter-only; assignment throws — use own properties.
    Object.defineProperties(sheet, {
        document: { value: actor, writable: true, configurable: true, enumerable: true },
        actor: { value: actor, writable: true, configurable: true, enumerable: true }
    });
    return sheet;
}

/**
 * Core drag data for an item on an actor sheet uses a UUID like `Actor.<id>.Item.<id>`.
 * @param {string} [uuid]
 * @returns {boolean}
 */
function isActorEmbeddedItemUuid(uuid) {
    return typeof uuid === "string" && uuid.startsWith("Actor.") && uuid.includes(".Item.");
}

/**
 * @param {object} data  Hotbar drop payload (from core drag data)
 * @returns {Promise<Item|null>}
 */
async function resolveItemFromHotbarData(data) {
    if (!data || data.type !== "Item") return null;
    try {
        if (data.uuid) {
            const doc = await fromUuid(data.uuid);
            return doc instanceof Item ? doc : null;
        }
        const item = await Item.fromDropData(data);
        return item instanceof Item ? item : null;
    } catch (err) {
        console.warn("SLA Industries | hotbar item resolve failed:", err);
        return null;
    }
}

/**
 * Execute the same action as clicking the item roll control on the SLA actor sheet.
 * Invoked by hotbar macros (`game.sla.rollOwnedItem(uuid)`).
 * @param {string} itemUuid  Full UUID e.g. Actor.xxx.Item.yyy
 */
export async function rollOwnedItem(itemUuid) {
    if (!itemUuid || typeof itemUuid !== "string") {
        ui.notifications.warn("Invalid item macro.");
        return;
    }
    let item;
    try {
        item = await fromUuid(itemUuid);
    } catch {
        item = null;
    }
    if (!(item instanceof Item)) {
        ui.notifications.warn("That item no longer exists.");
        return;
    }
    const actor = item.actor;
    if (!actor) {
        ui.notifications.warn("That item is not on an actor. Drag items from a character, threat, or vehicle sheet.");
        return;
    }
    if (!item.isOwner) {
        ui.notifications.warn("You do not own that item.");
        return;
    }
    const sheet = await createEphemeralSlaSheet(actor);
    await sheet.triggerItemRoll(item);
}

/**
 * @param {Item} item
 */
export function actorItemMacroLabel(item) {
    const t = item.actor?.type;
    if (t === "character") return "Operative";
    if (t === "npc") return "Threat";
    if (t === "vehicle") return "Vehicle";
    return "Actor";
}

/**
 * @returns {number|null} First empty slot index (1-based), or null if full.
 */
function findFirstEmptyHotbarSlot() {
    const hb = game.user.hotbar ?? {};
    for (let i = 1; i <= 50; i++) {
        const id = hb[i] ?? hb[String(i)];
        if (!id) return i;
    }
    return null;
}

/**
 * Create or reuse the script macro that rolls / uses this embedded item.
 * @param {Item} item
 * @returns {Promise<Macro|null>}
 */
export async function getOrCreateSlaItemRollMacro(item) {
    if (!item?.actor) {
        ui.notifications.warn("That item is not on an actor.");
        return null;
    }
    if (!item.isOwner) {
        ui.notifications.warn("You cannot create a macro for an item you do not own.");
        return null;
    }

    const macroName = `${actorItemMacroLabel(item)}: ${item.name}`.slice(0, 200);
    const command = `await game.sla.rollOwnedItem("${item.uuid}");`;

    const existing = game.macros.find(m =>
        m.getFlag("sla-industries", "itemMacroUuid") === item.uuid && m.isOwner
    );

    return existing ?? await Macro.create({
        name: macroName,
        type: "script",
        img: item.img || "icons/svg/item-bag.svg",
        command,
        scope: "global",
        flags: { "sla-industries": { itemMacroUuid: item.uuid } }
    });
}

/**
 * Add an actor-owned item to the first free hotbar slot (context menu / convenience).
 * @param {Item} item
 */
export async function addActorItemToHotbar(item) {
    const macro = await getOrCreateSlaItemRollMacro(item);
    if (!macro) return;

    const slot = findFirstEmptyHotbarSlot();
    if (slot === null) {
        ui.notifications.warn("Hotbar is full. The macro exists in your Macro directory — assign it manually.");
        return;
    }

    await game.user.assignHotbarMacro(macro, slot);
    ui.notifications.info(`Added ${item.name} to hotbar slot ${slot}.`);
}

/**
 * @param {object} data
 * @param {number} slot
 */
async function createSlaItemHotbarMacro(data, slot) {
    const item = await resolveItemFromHotbarData(data);
    if (!item?.actor) {
        ui.notifications.warn("Could not resolve that item for a macro.");
        return;
    }

    const macro = await getOrCreateSlaItemRollMacro(item);
    if (!macro) return;

    await game.user.assignHotbarMacro(macro, slot);
}

export function registerSlaHotbar() {
    Hooks.on("hotbarDrop", (_hotbar, data, slot) => {
        if (data?.type !== "Item") return true;
        if (!isActorEmbeddedItemUuid(data.uuid)) return true;

        void createSlaItemHotbarMacro(data, slot);
        return false;
    });
}
