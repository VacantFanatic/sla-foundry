import { createSLARoll } from '../helpers/dice.mjs';
import {
    getSlaEncounterScopeId,
    isToxicantImmuneThisEncounter,
    setToxicantImmunityThisEncounter
} from '../helpers/toxicant-scope.mjs';

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
     * Remove actor effects originating from this item.
     * @param {Actor} actor
     * @param {string} originUuid
     */
    async _removeEffectsByOrigin(actor, originUuid) {
        const ids = actor.effects.filter((e) => e.origin === originUuid).map((e) => e.id);
        if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
    }

    /**
     * Apply this item's embedded Active Effects to the actor.
     * Replaces any existing effects with the same origin.
     * @param {Actor} actor
     * @param {{ durationSeconds?: number|null }} [opts]
     */
    async applyItemEffectsToActor(actor, opts = {}) {
        if (!actor) return;
        const origin = this.uuid;
        await this._removeEffectsByOrigin(actor, origin);

        const durationSeconds =
            opts.durationSeconds !== undefined ? opts.durationSeconds : this._getDurationSeconds(this.system.duration);

        if (this.effects?.size > 0) {
            const payloads = [];
            for (const src of this.effects) {
                const data = foundry.utils.duplicate(src.toObject());
                delete data._id;
                data.origin = origin;
                data.transfer = false;
                if (durationSeconds != null && Number.isFinite(durationSeconds)) {
                    data.duration = foundry.utils.mergeObject(data.duration ?? {}, { seconds: durationSeconds });
                }
                payloads.push(data);
            }
            if (payloads.length) await actor.createEmbeddedDocuments('ActiveEffect', payloads);
        }
    }

    /**
     * Toggle the Active state of a drug and sync Active Effects (embedded definitions preferred).
     */
    async toggleActive() {
        const newState = !this.system.active;
        await this.update({ 'system.active': newState });

        if (!this.actor) return;

        if (newState) {
            await this.applyItemEffectsToActor(this.actor);
            if (this.effects?.size > 0) {
                ui.notifications.info(`${this.name} applied.`);
            }
        } else {
            await this._removeEffectsByOrigin(this.actor, this.uuid);
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
            await this.applyItemEffectsToActor(actor, { durationSeconds: null });
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
