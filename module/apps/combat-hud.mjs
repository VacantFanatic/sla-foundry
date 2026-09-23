/**
 * GM Combat HUD — one docked panel that runs a combatant's turn (vitals, conditions, weapons, quick rolls)
 * without opening its actor sheet. Follows the active combatant, switches to a single selected token, and can
 * be pinned to one actor.
 *
 * Every control reuses the sheet's own CSS-class actions through an unrendered ("ephemeral") sheet, so rolls,
 * gates, ammo and reloads behave exactly as they do on the full sheet.
 */
import { createEphemeralSlaSheet } from '../helpers/sla-hotbar.mjs';
import { prepareItems } from '../helpers/items.mjs';
import { buildVitalsContext } from '../sheets/actor/combat-context.mjs';
import { handleSheetChange, handleSheetClick } from '../sheets/actor/sheet-actions.mjs';
import { compactStatRows, equippedFirst, resolveHudActorId, stepIndex } from './combat-hud-pure.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** @type {SlaCombatHud | null} */
let hudInstance = null;

export class SlaCombatHud extends HandlebarsApplicationMixin(ApplicationV2) {
    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'sla-combat-hud',
        classes: ['sla-industries', 'sla-dialog-window', 'dialog', 'flavor-action', 'sla-combat-hud'],
        tag: 'div',
        window: {
            title: 'SLA.CombatHud.Title',
            icon: 'fas fa-crosshairs',
            resizable: true
        },
        position: { width: 420, height: 640 },
        actions: {
            togglePin: SlaCombatHud.#onTogglePin,
            openSheet: SlaCombatHud.#onOpenSheet,
            prevCombatant: SlaCombatHud.#onPrevCombatant,
            nextCombatant: SlaCombatHud.#onNextCombatant,
            nextTurn: SlaCombatHud.#onNextTurn
        }
    };

    /** @override */
    static PARTS = {
        body: {
            template: 'systems/sla-industries/templates/apps/combat-hud.hbs',
            scrollable: ['.sla-combat-hud__body']
        }
    };

    /** @returns {SlaCombatHud} */
    static get instance() {
        hudInstance ??= new SlaCombatHud();
        return hudInstance;
    }

    /** Actor locked by the pin button (survives turn changes and token selection). */
    #pinned = null;

    /** Actor chosen with the prev/next arrows; cleared on the next turn or selection change. */
    #browsed = null;

    /** Last actor shown, kept when nothing else resolves (e.g. the GM deselects all tokens). */
    #last = null;

    /** @type {Promise<object> | null} */
    #sheetPromise = null;
    #sheetActor = null;

    /** A refresh arrived while the user was typing in a HUD input; run it once focus leaves. */
    #refreshDeferred = false;

    #refresh = foundry.utils.debounce(() => {
        if (!this.rendered) return;
        // Re-rendering replaces the input mid-edit and its change event never fires.
        const focused = document.activeElement;
        if (focused instanceof HTMLInputElement && this.element.contains(focused)) {
            this.#refreshDeferred = true;
            return;
        }
        this.render();
    }, 50);

    /** The actor currently shown, or null. */
    get actor() {
        return this.#resolveActor();
    }

    /** @param {Actor | null} actor  Pin the HUD to this actor (null clears the pin). */
    focusActor(actor) {
        this.#pinned = actor ?? null;
        this.#browsed = null;
        this.scheduleRefresh();
    }

    scheduleRefresh() {
        this.#refresh();
    }

    /** Clear a manual browse so the HUD follows the turn or selection again. */
    clearBrowse() {
        this.#browsed = null;
    }

    /**
     * @param {Actor | null | undefined} doc
     * @returns {boolean}
     */
    isShowing(doc) {
        const shown = this.#last;
        if (!doc || !shown) return false;
        return doc === shown || doc.uuid === shown.uuid || doc.id === shown.id;
    }

    #resolveActor() {
        const candidates = new Map();
        const add = (a) => {
            if (a?.isOwner) candidates.set(a.uuid, a);
            return a?.isOwner ? a.uuid : null;
        };
        const pinnedId = add(this.#pinned);
        const browsedId = add(this.#browsed);
        const controlledActorIds = (canvas?.tokens?.controlled ?? []).map((t) => add(t.actor)).filter(Boolean);
        const activeCombatantActorId = add(game.combat?.started ? game.combat.combatant?.actor : null);
        const lastId = add(this.#last);
        const id = resolveHudActorId({
            pinnedId: pinnedId ?? browsedId,
            controlledActorIds,
            activeCombatantActorId,
            lastId
        });
        const actor = id ? (candidates.get(id) ?? null) : null;
        this.#last = actor;
        return actor;
    }

    async #ephemeralSheet(actor) {
        if (this.#sheetActor !== actor || !this.#sheetPromise) {
            this.#sheetActor = actor;
            this.#sheetPromise = createEphemeralSlaSheet(actor);
        }
        return this.#sheetPromise;
    }

    /** Owned combatants in turn order, one entry per actor, for the prev/next arrows. */
    #ownedCombatantActors() {
        const combat = game.combat;
        if (!combat) return [];
        const seen = new Set();
        const out = [];
        for (const c of combat.turns ?? []) {
            const a = c.actor;
            if (!a?.isOwner || seen.has(a.uuid)) continue;
            seen.add(a.uuid);
            out.push(a);
        }
        return out;
    }

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const actor = this.#resolveActor();
        const combat = game.combat;
        context.hasActor = Boolean(actor);
        context.isGM = game.user.isGM;
        context.combat = combat
            ? { started: combat.started, round: combat.round, canAdvance: combat.started && game.user.isGM }
            : null;

        const targets = Array.from(game.user.targets ?? []);
        context.target = {
            count: targets.length,
            name: targets[0]?.name ?? '',
            extra: Math.max(0, targets.length - 1)
        };

        if (!actor) return context;

        const combatant = combat?.combatants?.find((c) => c.actor === actor || c.actor?.uuid === actor.uuid);
        context.actor = actor;
        context.system = actor.system;
        context.isPinned = Boolean(this.#pinned) && this.#pinned === actor;
        context.isActiveTurn = Boolean(combat?.started && combat.combatant && combat.combatant === combatant);
        context.initiative = combatant?.initiative ?? null;
        context.canBrowse = this.#ownedCombatantActors().length > 1;
        context.img = combatant?.token?.texture?.src || actor.img;
        context.name = combatant?.name || actor.token?.name || actor.name;

        Object.assign(context, buildVitalsContext(actor));
        context.enableNPCWoundTracking =
            actor.type === 'npc' ? game.settings.get('sla-industries', 'enableNPCWoundTracking') : true;
        context.hasVitals = actor.type === 'character' || actor.type === 'npc';

        const itemData = prepareItems(Array.from(actor.items), actor.getRollData());
        context.weapons = equippedFirst(itemData.weapons);
        context.armors = itemData.armors;
        context.skills = itemData.skills;
        context.stats = context.hasVitals ? compactStatRows(actor.system.stats) : [];

        return context;
    }

    /** @override */
    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        this.element.addEventListener('click', (event) => this.#onClick(event));
        this.element.addEventListener('change', (event) => this.#onChange(event));
        this.element.addEventListener('focusout', () => {
            if (!this.#refreshDeferred) return;
            this.#refreshDeferred = false;
            this.scheduleRefresh();
        });
    }

    /** @override */
    _onClose(options) {
        super._onClose(options);
        this.#browsed = null;
    }

    /** Route sheet-style controls (attack, damage, reload, equip, stat/skill rolls, wounds, conditions). */
    async #onClick(event) {
        const t = event.target;
        if (!(t instanceof Element) || t.closest('[data-action]')) return;
        if (!t.closest('.sla-combat-hud__body')) return;
        const actor = this.#last;
        if (!actor?.isOwner) return;
        const sheet = await this.#ephemeralSheet(actor);
        await handleSheetClick(sheet, event);
    }

    /** HP inputs and inline armor resistance edits; the HUD is not a form, so it writes the field itself. */
    async #onChange(event) {
        const el = event.target;
        if (!(el instanceof HTMLInputElement)) return;
        const actor = this.#last;
        if (!actor?.isOwner) return;
        const sheet = await this.#ephemeralSheet(actor);
        await handleSheetChange(sheet, event);
        if (el.classList.contains('inline-edit') || el.readOnly) return;
        const name = el.name;
        if (!name?.startsWith('system.')) return;
        await actor.update({ [name]: Number(el.value) || 0 });
    }

    static #onTogglePin() {
        const actor = this.#last;
        this.#pinned = this.#pinned && this.#pinned === actor ? null : actor;
        this.#browsed = null;
        this.render();
    }

    static #onOpenSheet() {
        this.#last?.sheet?.render(true);
    }

    static #onPrevCombatant() {
        this.#browse(-1);
    }

    static #onNextCombatant() {
        this.#browse(1);
    }

    static async #onNextTurn() {
        if (!game.user.isGM || !game.combat?.started) return;
        await game.combat.nextTurn();
    }

    #browse(dir) {
        const list = this.#ownedCombatantActors();
        const current = list.findIndex((a) => this.isShowing(a));
        const i = stepIndex(current, list.length, dir);
        if (i < 0) return;
        this.#pinned = null;
        this.#browsed = list[i];
        this.render();
    }
}

/**
 * Open the HUD (optionally pinned to an actor).
 * @param {Actor | string} [actorOrUuid]
 */
export async function openCombatHud(actorOrUuid) {
    const hud = SlaCombatHud.instance;
    if (actorOrUuid) {
        const actor = typeof actorOrUuid === 'string' ? await fromUuid(actorOrUuid) : actorOrUuid;
        if (actor instanceof Actor) hud.focusActor(actor);
    }
    await hud.render({ force: true, position: hud.rendered ? undefined : dockedPosition() });
    return hud;
}

/** First-open position: docked beside the right-hand sidebar so the map stays clear. */
function dockedPosition() {
    const { width } = SlaCombatHud.DEFAULT_OPTIONS.position;
    const sidebar = document.getElementById('sidebar')?.getBoundingClientRect().width ?? 300;
    return { left: Math.max(0, window.innerWidth - sidebar - width - 16), top: 60 };
}

export async function toggleCombatHud() {
    const hud = SlaCombatHud.instance;
    if (hud.rendered) {
        await hud.close();
        return hud;
    }
    return openCombatHud();
}

/**
 * @param {Document | null | undefined} doc  An actor, or an item/effect embedded in one
 */
function refreshIfShowing(doc) {
    const hud = hudInstance;
    if (!hud?.rendered || !doc) return;
    const actor = doc instanceof Actor ? doc : (doc.actor ?? doc.parent?.actor ?? doc.parent);
    if (actor instanceof Actor && hud.isShowing(actor)) hud.scheduleRefresh();
}

function refreshAlways() {
    if (hudInstance?.rendered) hudInstance.scheduleRefresh();
}

/** Register the client setting, keybinding and live-refresh hooks. Call from `init`. */
export function registerCombatHud() {
    game.settings.register('sla-industries', 'combatHudAutoOpen', {
        name: 'SLA.CombatHud.SettingAutoOpen',
        hint: 'SLA.CombatHud.SettingAutoOpenHint',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true
    });

    game.keybindings.register('sla-industries', 'toggleCombatHud', {
        name: 'SLA.CombatHud.Keybinding',
        hint: 'SLA.CombatHud.KeybindingHint',
        editable: [{ key: 'KeyH', modifiers: ['Shift'] }],
        onDown: () => {
            toggleCombatHud();
            return true;
        }
    });

    Hooks.on('updateCombat', (combat, changed) => {
        const turnChanged = foundry.utils.hasProperty(changed, 'turn') || foundry.utils.hasProperty(changed, 'round');
        if (!turnChanged) return;
        if (hudInstance) hudInstance.clearBrowse();
        const starting = changed.round === 1 && combat.started;
        if (starting && game.user.isGM && !hudInstance?.rendered) {
            if (game.settings.get('sla-industries', 'combatHudAutoOpen')) openCombatHud();
            return;
        }
        refreshAlways();
    });
    Hooks.on('deleteCombat', refreshAlways);
    Hooks.on('updateCombatant', refreshAlways);
    Hooks.on('controlToken', () => {
        hudInstance?.clearBrowse();
        refreshAlways();
    });
    Hooks.on('targetToken', (user) => {
        if (user === game.user) refreshAlways();
    });
    Hooks.on('updateActor', (actor) => refreshIfShowing(actor));
    for (const hook of [
        'createItem',
        'updateItem',
        'deleteItem',
        'createActiveEffect',
        'updateActiveEffect',
        'deleteActiveEffect'
    ]) {
        Hooks.on(hook, (doc) => refreshIfShowing(doc));
    }

    Hooks.on('renderCombatTracker', (app, html) => {
        const root = html instanceof HTMLElement ? html : html?.[0];
        if (!root || root.querySelector('.sla-combat-hud-open')) return;
        const header = root.querySelector('.combat-tracker-header, header');
        if (!header) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sla-combat-hud-open inline-control icon fa-solid fa-crosshairs';
        const label = game.i18n.localize('SLA.CombatHud.Open');
        btn.dataset.tooltip = label;
        btn.setAttribute('aria-label', label);
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            toggleCombatHud();
        });
        header.prepend(btn);
    });
}
