/**
 * Stackable inventory: merge drops and migrations for Item types that use system.quantity.
 */

/** @type {ReadonlySet<string>} */
export const STACKABLE_ITEM_TYPES = new Set(["item", "explosive", "magazine", "drug"]);

/**
 * @param {string} type
 * @returns {boolean}
 */
export function isStackableItemType(type) {
    return STACKABLE_ITEM_TYPES.has(type);
}

/**
 * @param {object} plain - Item-like plain object (e.g. from toObject()) or embedded document data
 * @returns {string}
 */
function getSourceRef(plain) {
    const stats = plain._stats;
    if (stats && typeof stats.compendiumSource === "string" && stats.compendiumSource.length) {
        return stats.compendiumSource;
    }
    const sid = plain.flags?.core?.sourceId;
    if (typeof sid === "string" && sid.length) return sid;
    return "";
}

/**
 * Fallback identity when no compendium/world source id is present on both sides.
 * @param {object} plain
 * @returns {string}
 */
function stackKeyFallback(plain) {
    const type = plain.type;
    const name = (plain.name ?? "").trim().toLowerCase();
    if (type === "magazine") {
        const sys = plain.system ?? {};
        const ammoType = sys.ammoType ?? "";
        const cap = sys.ammoCapacity ?? "";
        return `f|${type}|${name}|${ammoType}|${cap}`;
    }
    return `f|${type}|${name}`;
}

/**
 * Stable stack identity for drops and migration.
 * @param {object} plain - Item-like plain object
 * @returns {string|null} null if not a stackable type
 */
export function stackKey(plain) {
    if (!plain?.type || !STACKABLE_ITEM_TYPES.has(plain.type)) return null;
    const ref = getSourceRef(plain);
    if (ref) return `r|${plain.type}|${ref}`;
    return stackKeyFallback(plain);
}

/**
 * Quantity carried by a drop payload (minimum 1).
 * @param {object} itemData
 * @returns {number}
 */
export function incomingQuantity(itemData) {
    const q = Number(foundry.utils.getProperty(itemData, "system.quantity"));
    if (!Number.isFinite(q) || q <= 0) return 1;
    return Math.max(1, Math.floor(q));
}

/**
 * @param {Actor} actor
 * @param {object} itemData - plain object from Item.toObject()
 * @returns {Item | null}
 */
export function findStackDuplicate(actor, itemData) {
    const key = stackKey(itemData);
    if (!key) return null;
    for (const it of actor.items) {
        if (it.type !== itemData.type) continue;
        const k = stackKey(it.toObject());
        if (k === key) return it;
    }
    return null;
}

/**
 * Create or merge a stackable item on the actor. Does not run for non-stackable types.
 * @param {Actor} actor
 * @param {object} itemData - plain object; may be mutated (quantity set on create path)
 * @returns {Promise<boolean>} true if this helper handled the drop (caller should not call super._onDropItem)
 */
export async function handleStackableActorItemDrop(actor, itemData) {
    if (!isStackableItemType(itemData.type)) return false;

    const addQty = incomingQuantity(itemData);
    const existing = findStackDuplicate(actor, itemData);

    if (existing) {
        const cur = Number(existing.system?.quantity);
        const base = Number.isFinite(cur) && cur > 0 ? cur : 1;
        const next = base + addQty;
        await actor.updateEmbeddedDocuments("Item", [{ _id: existing.id, "system.quantity": next }]);
        ui.notifications.info(`${existing.name}: quantity ${base} → ${next}`);
        return true;
    }

    foundry.utils.setProperty(itemData, "system.quantity", addQty);
    await actor.createEmbeddedDocuments("Item", [itemData]);
    return true;
}

/**
 * Per-actor consolidation for migration: merge duplicate stack rows; skip groups with embedded item effects.
 * @param {Actor} actor
 * @returns {Promise<{ merged: number, skipped: number }>}
 */
export async function consolidateStackableItemsOnActor(actor) {
    let merged = 0;
    let skipped = 0;

    const byKey = new Map();
    for (const item of actor.items) {
        if (!STACKABLE_ITEM_TYPES.has(item.type)) continue;
        const key = stackKey(item.toObject());
        if (!key) continue;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(item);
    }

    for (const [, group] of byKey) {
        if (group.length < 2) continue;

        const anyEffects = group.some((it) => (it.effects?.size ?? 0) > 0);
        if (anyEffects) {
            skipped++;
            console.warn(
                `SLA | 2.3.0 inventory merge: skipped duplicate group on "${actor.name}" (${group[0]?.type} "${group[0]?.name}") — embedded ActiveEffects present`
            );
            continue;
        }

        const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
        const keeper = sorted[0];
        const rest = sorted.slice(1);

        let sum = 0;
        for (const it of sorted) {
            const q = Number(it.system?.quantity);
            sum += Number.isFinite(q) && q > 0 ? Math.floor(q) : 1;
        }

        await actor.updateEmbeddedDocuments("Item", [{ _id: keeper.id, "system.quantity": sum }]);
        await actor.deleteEmbeddedDocuments(
            "Item",
            rest.map((it) => it.id)
        );
        merged += rest.length;
        console.log(
            `SLA | 2.3.0: Merged ${rest.length + 1}× ${keeper.type} "${keeper.name}" on "${actor.name}" → quantity ${sum}`
        );
    }

    return { merged, skipped };
}
