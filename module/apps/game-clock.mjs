import { bindEscapeToClose } from '../helpers/dialog-keyboard.mjs';
import {
    buildClockPresetRows,
    fieldsFromTime,
    formatClockParts,
    monthLength,
    parseAdvanceSeconds,
    shouldOfferEndCombat,
    worldTimeFromFields
} from '../helpers/game-clock-pure.mjs';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

const gmOnly = () => {
    if (game.user?.isGM) return false;
    ui.notifications.warn(game.i18n.localize('SLA.GameClock.GmOnly'));
    return true;
};

/**
 * After a big forward move from the clock window, ask whether the running combat(s) should end: a jump of an hour
 * or more usually means the fight is over. The `game.sla.advanceTime` / `setDate` macro API never asks.
 * @param {number} before World time before the move.
 * @param {number} after World time after the move.
 * @returns {Promise<boolean>} Whether combats were ended.
 */
export async function offerToEndCombat(before, after) {
    const running = game.combats.filter((c) => c.started);
    if (!shouldOfferEndCombat(after - before, running.length)) return false;
    const end = await foundry.applications.api.DialogV2.confirm({
        window: { icon: 'fa-solid fa-xmark', title: game.i18n.localize('SLA.GameClock.EndCombatTitle') },
        content: `<p>${game.i18n.localize('SLA.GameClock.EndCombatPrompt')}</p>`,
        yes: { label: game.i18n.localize('SLA.GameClock.EndCombat') },
        no: { label: game.i18n.localize('SLA.GameClock.KeepCombat') },
        rejectClose: false,
        modal: true
    });
    if (!end) return false;
    await Promise.all(running.map((c) => c.delete()));
    return true;
}

/**
 * Advance (positive) or rewind (negative) the world clock by a number of seconds. GM only.
 * Exposed as `game.sla.advanceTime`.
 * @param {number} seconds
 * @returns {Promise<number | null>} The new world time in seconds, or `null` when nothing was changed.
 */
export async function advanceTime(seconds) {
    if (gmOnly()) return null;
    const delta = parseAdvanceSeconds(seconds);
    if (delta === null) {
        ui.notifications.warn(game.i18n.localize('SLA.GameClock.InvalidAmount'));
        return null;
    }
    return game.time.advance(delta);
}

/**
 * Set the world clock to an exact date and time, without any warning toast: the clock window shows the error
 * inline. GM only.
 * @param {Partial<import('../helpers/game-clock-pure.mjs').ClockFields>} fields
 * @returns {Promise<{ ok: true, seconds: number } | { ok: false, error: string }>}
 */
export async function applyDate(fields) {
    if (!game.user?.isGM) return { ok: false, error: 'gm-only' };
    const result = worldTimeFromFields(game.time.calendar, fields);
    if (!result.ok) return result;
    await game.time.set(result.seconds);
    return result;
}

/**
 * Set the world clock to an exact date and time. GM only. Exposed as `game.sla.setDate`.
 * Timed effects react as for any clock change: moving forward expires effects whose time has passed, moving back
 * un-expires effects that are still on the actor.
 * @param {{ year: number, month: number, day: number, hour?: number, minute?: number }} fields `month` and `day` are
 *   1-based; `hour` and `minute` default to 0.
 * @returns {Promise<number | null>} The new world time in seconds, or `null` when nothing was changed.
 */
export async function setDate(fields) {
    if (gmOnly()) return null;
    const result = await applyDate({ hour: 0, minute: 0, ...fields });
    if (!result.ok) {
        ui.notifications.warn(game.i18n.localize(`SLA.GameClock.Error.${result.error}`));
        return null;
    }
    return result.seconds;
}

/**
 * Open the GM game-clock window (or bring the open one to the front). GM only.
 * Exposed as `game.sla.openGameClock`.
 * @returns {SlaGameClock | null}
 */
export function openGameClock() {
    if (gmOnly()) return null;
    return SlaGameClock.show();
}

/**
 * Small GM window showing the world date and time, with quick advance / rewind buttons and a form to set an exact
 * date. It follows the world time from any source (this window, combat rounds, a macro, a calendar module).
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
            position: { width: 440 },
            actions: { shiftTime: SlaGameClock.shiftTime, setDate: SlaGameClock.setDate }
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
        const before = game.time.worldTime;
        const after = await advanceTime(Number(target.dataset.seconds));
        if (after !== null) await offerToEndCombat(before, after);
    }

    /**
     * Click handler for Apply in the set-date form.
     * @this {SlaGameClock}
     */
    static async setDate() {
        await this.#applyForm();
    }

    /** @type {number | null} */
    #timeHook = null;

    /** @type {AbortController | null} */
    #uiAbort = null;

    /** Whether the GM has typed in the set-date form since it was last filled from the clock. */
    #dirty = false;

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const calendar = game.time.calendar;
        const localize = (key) => game.i18n.localize(key);
        const label = (direction, id) => localize(`SLA.GameClock.${direction}.${id}`);
        const fields = fieldsFromTime(calendar, game.time.worldTime);
        const shown = formatClockParts(calendar, game.time.worldTime, localize);

        context.date = shown.date;
        context.time = shown.time;
        context.roundLabel = CONFIG.time.roundTime
            ? game.i18n.format('SLA.GameClock.RoundLength', { seconds: CONFIG.time.roundTime })
            : localize('SLA.GameClock.RoundLengthZero');
        context.advance = buildClockPresetRows('advance').map((row) => ({ ...row, label: label('Advance', row.id) }));
        context.rewind = buildClockPresetRows('rewind').map((row) => ({ ...row, label: label('Rewind', row.id) }));
        context.fields = fields;
        context.maxDay = monthLength(calendar, fields.year, fields.month - 1);
        context.maxHour = calendar.days.hoursPerDay - 1;
        context.maxMinute = calendar.days.minutesPerHour - 1;
        context.months = calendar.months.values.map((month, index) => ({
            value: index + 1,
            label: localize(month.name),
            selected: index + 1 === fields.month
        }));
        return context;
    }

    /** @override */
    _onFirstRender(context, options) {
        super._onFirstRender(context, options);
        this.#timeHook = Hooks.on('updateWorldTime', () => this.#followClock());
    }

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);
        this.#uiAbort?.abort();
        this.#uiAbort = new AbortController();
        const { signal } = this.#uiAbort;
        bindEscapeToClose(this.element, signal, () => this.close());

        const form = this.element.querySelector('.sla-clock-fields');
        form?.addEventListener('input', () => (this.#dirty = true), { signal });
        form?.addEventListener(
            'keydown',
            (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                this.#applyForm();
            },
            { signal }
        );
        this.#dirty = false;
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

    /**
     * Update the displayed time in place when the clock moves, and refill the set-date form only if the GM isn't
     * in the middle of typing in it, so a clock tick never wipes half-entered values.
     */
    #followClock() {
        if (!this.element) return;
        const calendar = game.time.calendar;
        const shown = formatClockParts(calendar, game.time.worldTime, (key) => game.i18n.localize(key));
        const set = (selector, text) => {
            const el = this.element.querySelector(selector);
            if (el) el.textContent = text;
        };
        set('[data-clock="date"]', shown.date);
        set('[data-clock="time"]', shown.time);
        if (!this.#dirty) this.#fillForm(fieldsFromTime(calendar, game.time.worldTime));
    }

    /** @param {import('../helpers/game-clock-pure.mjs').ClockFields} fields */
    #fillForm(fields) {
        const root = this.element;
        for (const name of ['year', 'month', 'day', 'hour', 'minute']) {
            const input = root.querySelector(`[name="${name}"]`);
            if (input) input.value = String(fields[name]);
        }
        const day = root.querySelector('[name="day"]');
        if (day) day.max = String(monthLength(game.time.calendar, fields.year, fields.month - 1));
    }

    /** @param {string | null} error A `SLA.GameClock.Error.*` code, or `null` to clear. */
    #showError(error) {
        const el = this.element.querySelector('.sla-clock-error');
        if (!el) return;
        el.textContent = error ? game.i18n.localize(`SLA.GameClock.Error.${error}`) : '';
        el.hidden = !error;
    }

    async #applyForm() {
        const read = (name) => {
            const raw = this.element.querySelector(`[name="${name}"]`)?.value;
            return raw === undefined || raw.trim() === '' ? NaN : Number(raw);
        };
        const before = game.time.worldTime;
        const result = await applyDate({
            year: read('year'),
            month: read('month'),
            day: read('day'),
            hour: read('hour'),
            minute: read('minute')
        });
        this.#showError(result.ok ? null : result.error);
        if (result.ok) {
            this.#dirty = false;
            this.#fillForm(fieldsFromTime(game.time.calendar, result.seconds));
            await offerToEndCombat(before, result.seconds);
        }
    }
}
