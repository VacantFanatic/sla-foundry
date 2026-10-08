import { bindEscapeToClose } from '../helpers/dialog-keyboard.mjs';
import { buildClockPresetRows, parseAdvanceSeconds } from '../helpers/game-clock-pure.mjs';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * Advance (positive) or rewind (negative) the world clock by a number of seconds. GM only.
 * Exposed as `game.sla.advanceTime`.
 * @param {number} seconds
 * @returns {Promise<number | null>} The new world time in seconds, or `null` when nothing was changed.
 */
export async function advanceTime(seconds) {
    if (!game.user?.isGM) {
        ui.notifications.warn(game.i18n.localize('SLA.GameClock.GmOnly'));
        return null;
    }
    const delta = parseAdvanceSeconds(seconds);
    if (delta === null) {
        ui.notifications.warn(game.i18n.localize('SLA.GameClock.InvalidAmount'));
        return null;
    }
    return game.time.advance(delta);
}

/**
 * Open the GM game-clock window (or bring the open one to the front). GM only.
 * Exposed as `game.sla.openGameClock`.
 * @returns {SlaGameClock | null}
 */
export function openGameClock() {
    if (!game.user?.isGM) {
        ui.notifications.warn(game.i18n.localize('SLA.GameClock.GmOnly'));
        return null;
    }
    return SlaGameClock.show();
}

/**
 * Small GM window showing the world time with quick advance / rewind buttons. It re-renders whenever
 * the world time changes, from any source (this window, combat rounds, a macro, a calendar module).
 */
export class SlaGameClock extends HandlebarsApplicationMixin(ApplicationV2) {
    /** @type {SlaGameClock | null} */
    static #instance = null;

    /** @override */
    static PARTS = {
        body: { template: 'systems/sla-industries/templates/dialogs/game-clock.hbs' }
    };

    /** @override */
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        super.DEFAULT_OPTIONS,
        {
            id: 'sla-game-clock',
            tag: 'div',
            classes: ['sla-dialog-window', 'dialog', 'flavor-resource', 'sla-game-clock'],
            window: { title: 'SLA.GameClock.Title', icon: 'fa-solid fa-hourglass-half', resizable: false },
            position: { width: 380 },
            actions: { shiftTime: SlaGameClock.shiftTime }
        },
        { inplace: false }
    );

    /** @returns {SlaGameClock} */
    static show() {
        SlaGameClock.#instance ??= new SlaGameClock();
        SlaGameClock.#instance.render({ force: true });
        return SlaGameClock.#instance;
    }

    /**
     * Click handler for the preset buttons (`data-action="shiftTime"`, `data-seconds="±n"`).
     * @this {SlaGameClock}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async shiftTime(event, target) {
        await advanceTime(Number(target.dataset.seconds));
    }

    /** @type {number | null} */
    #timeHook = null;

    /** @type {AbortController | null} */
    #uiAbort = null;

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const label = (direction, id) => game.i18n.localize(`SLA.GameClock.${direction}.${id}`);
        let time;
        try {
            time = game.time.calendar.format(game.time.worldTime);
        } catch (_err) {
            time = `${game.time.worldTime} s`;
        }
        context.time = time;
        context.roundLabel = CONFIG.time.roundTime
            ? game.i18n.format('SLA.GameClock.RoundLength', { seconds: CONFIG.time.roundTime })
            : game.i18n.localize('SLA.GameClock.RoundLengthZero');
        context.advance = buildClockPresetRows('advance').map((row) => ({ ...row, label: label('Advance', row.id) }));
        context.rewind = buildClockPresetRows('rewind').map((row) => ({ ...row, label: label('Rewind', row.id) }));
        return context;
    }

    /** @override */
    _onFirstRender(context, options) {
        super._onFirstRender(context, options);
        this.#timeHook = Hooks.on('updateWorldTime', () => this.render());
    }

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);
        this.#uiAbort?.abort();
        this.#uiAbort = new AbortController();
        bindEscapeToClose(this.element, this.#uiAbort.signal, () => this.close());
    }

    /** @override */
    async _onClose(options) {
        if (this.#timeHook !== null) Hooks.off('updateWorldTime', this.#timeHook);
        this.#timeHook = null;
        this.#uiAbort?.abort();
        this.#uiAbort = null;
        if (SlaGameClock.#instance === this) SlaGameClock.#instance = null;
        return super._onClose(options);
    }
}
