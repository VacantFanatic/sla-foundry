import { createSLARoll } from '../helpers/dice.mjs';
import { effectsToApply, effectsToRemove } from './derived/effect-triggers.mjs';
import { createKeyedQueue } from '../helpers/keyed-queue.mjs';
import {
    getSlaEncounterScopeId,
    isToxicantImmuneThisEncounter,
    setToxicantImmunityThisEncounter
} from '../helpers/toxicant-scope.mjs';

/** Serializes each item's effect syncs (delete stale copies, then create) so overlapping triggers can't double-create. */
const effectSyncQueue = createKeyedQueue();

/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class SlaItem extends Item {
    prepareDerivedData() {
        super.prepareDerivedData();
    }

    getRollData() {
        if (!this.actor) return null;
        const rollData = this.actor.getRollData();
        rollData.item = foundry.utils.deepClone(this.system);
        return rollData;
    }

    /**
     * Parse duration string into seconds for ActiveEffect.duration.
     * @param {string} str
     * @returns {number|null}
     */
    _getDurationSeconds(str) {
        if (!str) return null;
        const s = String(str).toLowerCase();
        const n = parseInt(s.match(/\d+/)?.[0] ?? '', 10);
        if (Number.isNaN(n)) return null;
        if (s.includes('hour')) return n * 3600;
        if (s.includes('min')) return n * 60;
        if (s.includes('day')) return n * 86400;
        return null;
    }

    /**
     * The single place an item's embedded Active Effects are copied onto, or removed from, an
     * actor. Which effects an event touches comes from the pure table in
     * `derived/effect-triggers.mjs` (see .docs/EFFECT_TRIGGERS_DESIGN.md): an apply event first
     * replaces this item's earlier copies of the same kind, then copies the matching embedded
     * effects with `origin` set to this item and `transfer` off; a removal event deletes the copies
     * whose kind it removes. Copies are found by `origin`, so this also works for an item that has
     * already been deleted from the actor.
     * @param {Actor} actor
     * @param {'equip'|'unequip'|'activate'|'deactivate'|'grant'|'manual'|'delete'} event
     * @param {{ durationSeconds?: number|null }} [opts] Overrides the duration parsed from `system.duration`.
     */
    syncEffects(actor, event, opts = {}) {
        if (!actor) return Promise.resolve();
        return effectSyncQueue.run(this.uuid, () => this._syncEffectsNow(actor, event, opts));
    }

    /**
     * Resolves once every effect sync queued for this item so far has finished (never rejects).
     * The actor's create/update hooks start syncs without awaiting them, so a caller that needs the
     * effects in place (a setter, a drop handler) awaits this after the write that triggered them.
     * @returns {Promise<void>}
     */
    effectsSettled() {
        return effectSyncQueue.settled(this.uuid);
    }

    /** @private The unqueued body of {@link SlaItem#syncEffects}. */
    async _syncEffectsNow(actor, event, opts) {
        const origin = this.uuid;
        const copies = actor.effects.filter((e) => e.origin === origin);
        const staleIds = [
            ...effectsToApply(copies, this.type, event),
            ...effectsToRemove(copies, this.type, event)
        ].map((e) => e.id);
        if (staleIds.length) await actor.deleteEmbeddedDocuments('ActiveEffect', staleIds);

        const toCopy = effectsToApply(this.effects, this.type, event);
        if (!toCopy.length) return;

        const durationSeconds =
            opts.durationSeconds !== undefined ? opts.durationSeconds : this._getDurationSeconds(this.system.duration);
        const payloads = toCopy.map((src) => {
            const data = foundry.utils.duplicate(src.toObject());
            delete data._id;
            data.origin = origin;
            data.transfer = false;
            if (durationSeconds != null && Number.isFinite(durationSeconds)) {
                data.duration = foundry.utils.mergeObject(data.duration ?? {}, { seconds: durationSeconds });
            }
            return data;
        });
        await actor.createEmbeddedDocuments('ActiveEffect', payloads);
    }

    /**
     * Set this item's equipped state and sync its embedded Active Effects onto the actor to
     * match (applied while equipped, removed when unequipped).
     * @param {boolean} equipped
     * @returns {Promise<boolean>} The new equipped state.
     */
    async setEquipped(equipped) {
        await this.update({ 'system.equipped': equipped });
        // The actor's update hook syncs effects for this change (and for any other writer); wait for it.
        await this.effectsSettled();
        return equipped;
    }

    /**
     * Toggle the Active state of a drug and sync Active Effects (embedded definitions preferred).
     */
    async toggleActive() {
        const newState = !this.system.active;
        await this.update({ 'system.active': newState });

        if (!this.actor) return;

        // The actor's update hook syncs effects for this change; wait for it before notifying.
        await this.effectsSettled();
        if (newState) {
            if (this.effects?.size > 0) {
                ui.notifications.info(`${this.name} applied.`);
            }
        } else {
            ui.notifications.info(`${this.name} removed.`);
        }
    }

    /**
     * Infection test: Success Die + STR vs Infection Rating. On success, immunity for this encounter scope; on failure, apply embedded effects.
     */
    async rollInfectionTest() {
        if (this.type !== 'toxicant') return;
        const actor = this.actor;
        if (!actor) {
            ui.notifications.warn('Toxicant must be on an actor sheet to test infection.');
            return;
        }

        const itemUuid = this.uuid;
        if (isToxicantImmuneThisEncounter(actor, itemUuid)) {
            const content = await foundry.applications.handlebars.renderTemplate(
                'systems/sla-industries/templates/chat/toxicant-infection.hbs',
                {
                    itemName: this.name,
                    actorName: actor.name,
                    immune: true,
                    scope: getSlaEncounterScopeId()
                }
            );
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor }),
                content
            });
            return;
        }

        const ir = Number(this.system.infectionRating) || 10;
        const strVal = Number(actor.system.stats?.str?.total ?? actor.system.stats?.str?.value ?? 0);
        const roll = createSLARoll('1d10');
        await roll.evaluate();

        const firstTerm = roll.terms?.[0];
        const sdRaw = firstTerm?.results?.[0]?.result ?? 0;
        const total = sdRollTotal(sdRaw, strVal);
        const success = total >= ir;

        const content = await foundry.applications.handlebars.renderTemplate(
            'systems/sla-industries/templates/chat/toxicant-infection.hbs',
            {
                itemName: this.name,
                actorName: actor.name,
                immune: false,
                infectionRating: ir,
                strVal,
                sdRaw,
                total,
                success,
                scope: getSlaEncounterScopeId()
            }
        );
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content
        });

        if (success) {
            await setToxicantImmunityThisEncounter(actor, itemUuid);
        } else {
            await this.syncEffects(actor, 'manual', { durationSeconds: null });
            ui.notifications.warn(`${actor.name} is infected: ${this.name}`);
        }
    }

    /**
     * @override
     */
    async _preUpdate(changed, options, user) {
        await super._preUpdate(changed, options, user);

        if ((this.type === 'skill' || this.type === 'discipline') && changed.system) {
            if (changed.system.rank !== undefined) {
                const newRank = changed.system.rank;
                const maxRank = 4;
                if (newRank > maxRank) {
                    changed.system.rank = maxRank;
                    if (typeof ui !== 'undefined') {
                        ui.notifications.warn(`${this.name} Rank capped at ${maxRank}.`);
                    }
                }
            }
        }
    }
}

/** @deprecated Use {@link SlaItem} — legacy boilerplate name kept for macro compatibility. */
export const BoilerplateItem = SlaItem;

/**
 * @param {number} sdRaw
 * @param {number} strVal
 */
function sdRollTotal(sdRaw, strVal) {
    return sdRaw + strVal;
}
