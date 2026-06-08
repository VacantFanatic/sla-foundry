/**
 * SLA actor sheet (Application V2).
 */
import { prepareItems } from '../helpers/items.mjs';
import { applyMeleeModifiers, applyRangedModifiers } from '../helpers/modifiers.mjs';
import { addActorItemToHotbar } from '../helpers/sla-hotbar.mjs';
import { onDropItem, onDropVehicleWeapon, onItemCreate } from './actor/actor-drops.mjs';
import { triggerItemRoll } from './actor/item-actions.mjs';
import { handleSheetChange, handleSheetClick } from './actor/sheet-actions.mjs';
import { handleSheetRoll } from './actor/sheet-rolls.mjs';
import {
    applyHeadshotSideEffect,
    applySuccessThroughExperienceForSheet,
    buildSlaRollFlags,
    buildSkillDiceResultsForSheet,
    computeSuccessDieOutcomeForSheet,
    generateSheetTooltip,
    resolveCombatSkillRank,
    resolveSheetDamageDisplay
} from './actor/sheet-helpers.mjs';
import { canProceedWithWeaponAttack, resolveRangedAttackContext } from './actor/weapon-gates.mjs';
import { executeSkillRollFromItem } from './actor/skill-rolls.mjs';
import { executeEbbRoll } from './actor/ebb-rolls.mjs';
import { processExplosiveRoll, renderExplosiveDialog } from './actor/explosive-rolls.mjs';
import { processWeaponRoll, renderAttackDialog } from './actor/weapon-rolls.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class SlaActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/sla-industries/templates/actor/actor-sheet-v2.hbs',
            scrollable: ['']
        }
    };

    /** @override */
    static TABS = {
        primary: {
            tabs: [
                { id: 'main', label: 'Main', icon: 'fa-id-card' },
                { id: 'combat', label: 'Combat', icon: 'fa-crosshairs' },
                { id: 'ebb', label: 'Ebb', icon: 'fa-magic' },
                { id: 'inventory', label: 'Inventory', icon: 'fa-box-open' },
                { id: 'biography', label: 'Bio & Traits', icon: 'fa-book' },
                { id: 'effects', label: 'Effects', icon: 'fa-bolt' }
            ],
            initial: 'main'
        }
    };

    /** @override */
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        super.DEFAULT_OPTIONS,
        {
            // Required for <prose-mirror> and other form-associated controls to submit into document updates (App V2).
            tag: 'form',
            form: {
                ...(super.DEFAULT_OPTIONS.form ?? {}),
                submitOnChange: true,
                closeOnSubmit: false
            },
            classes: ['sla-industries', 'sheet', 'actor'],
            position: {
                width: 850,
                height: 850
            },
            window: {
                frame: true,
                resizable: true,
                minimizable: true
            }
        },
        { inplace: false }
    );

    /** @returns {boolean} */
    #actorIsEbonite() {
        const species = this.actor.items.find((i) => i.type === 'species');
        return Boolean(species?.name?.toLowerCase().includes('ebonite'));
    }

    /**
     * Ebb tab exists only for Ebonites; non-Ebonites may still have a persisted primary tab id `ebb`
     * from before the combat tab was renamed to `combat`.
     */
    changeTab(tab, group, options) {
        if (group === 'primary' && tab === 'ebb' && !this.#actorIsEbonite()) {
            tab = 'combat';
        }
        return super.changeTab(tab, group, options);
    }

    /** @type {AbortController | null} */
    #sheetUiAbort = null;

    /** @type {InstanceType<typeof foundry.applications.ux.ContextMenu> | null} */
    #sheetItemContextMenu = null;

    /**
     * Edit/Play stat display toggle lives in the window header (outside the form).
     * @param {AbortSignal} signal
     */
    #injectStatSheetHeaderToggle(signal) {
        if (this.actor.type !== 'character') return;
        const form = this.element instanceof HTMLElement ? this.element : null;
        const win = form?.closest('.window-app') ?? form?.closest('.application');
        const header = win?.querySelector('.window-header');
        if (!header) return;

        header.querySelector('.sla-stat-sheet-header-mode')?.remove();

        const mode = this.actor.getFlag('sla-industries', 'statSheetMode') ?? 'play';
        const wrap = document.createElement('div');
        wrap.className = 'sla-stat-sheet-header-mode';
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', game.i18n.localize('SLA.StatSheetMode.GroupLabel'));

        const isPlay = mode === 'play';
        if (!this.actor.isOwner) {
            wrap.appendChild(this.#createHeaderStatModeSwitch(isPlay, false));
        } else {
            const sw = this.#createHeaderStatModeSwitch(isPlay, true);
            wrap.appendChild(sw);
            sw.addEventListener('click', this.#onHeaderStatSwitchClick, { signal });
        }

        // Place left of the header "toggle controls" button (App V2 `window.controls`), not only `.window-controls`
        // (DOM order can put that button before the controls container, which left the pill on the wrong side).
        const toggleControls = this.window?.controls;
        if (toggleControls instanceof HTMLElement && toggleControls.parentNode instanceof HTMLElement) {
            toggleControls.parentNode.insertBefore(wrap, toggleControls);
        } else {
            const controls = header.querySelector('.window-controls');
            if (controls instanceof HTMLElement) header.insertBefore(wrap, controls);
            else header.appendChild(wrap);
        }
    }

    /**
     * Core window-header CSS forces square icon buttons and can flatten children to inline; inline layout wins.
     * @param {HTMLElement} track
     * @param {HTMLElement} thumb
     * @param {HTMLElement} labL
     * @param {HTMLElement} labR
     * @param {boolean} isPlay
     */
    #applyHeaderStatSwitchInlineLayout(track, thumb, labL, labR, isPlay) {
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--sla-accent').trim() || '#d05e1a';
        track.style.setProperty('display', 'grid');
        track.style.setProperty('grid-template-columns', '1fr 1fr');
        track.style.setProperty('align-items', 'stretch');
        track.style.setProperty('position', 'relative');
        track.style.setProperty('box-sizing', 'border-box');
        track.style.setProperty('width', '3.75rem');
        track.style.setProperty('min-width', '3.75rem');
        track.style.setProperty('height', '1.25rem');
        track.style.setProperty('min-height', '1.25rem');
        track.style.setProperty('background', '#3a3a48');
        track.style.setProperty('border', '1px solid rgba(208, 94, 26, 0.55)');
        track.style.setProperty('border-radius', '999px');
        track.style.setProperty('overflow', 'hidden');
        track.style.setProperty('box-shadow', 'inset 0 1px 3px rgba(0, 0, 0, 0.45)');

        for (const lab of [labL, labR]) {
            lab.style.setProperty('display', 'flex');
            lab.style.setProperty('align-items', 'center');
            lab.style.setProperty('justify-content', 'center');
            lab.style.setProperty('position', 'relative');
            lab.style.setProperty('z-index', '2');
            lab.style.setProperty('min-width', '0');
            lab.style.setProperty('font-family', 'monospace');
            lab.style.setProperty('font-size', '0.62rem');
            lab.style.setProperty('font-weight', '800');
            lab.style.setProperty('pointer-events', 'none');
            lab.style.setProperty('user-select', 'none');
        }
        if (isPlay) {
            labL.style.setProperty('color', 'rgba(255, 255, 255, 0.45)');
            labR.style.setProperty('color', '#0a0a0a');
        } else {
            labL.style.setProperty('color', '#0a0a0a');
            labR.style.setProperty('color', 'rgba(255, 255, 255, 0.45)');
        }

        thumb.style.setProperty('position', 'absolute');
        thumb.style.setProperty('top', '2px');
        thumb.style.setProperty('bottom', '2px');
        thumb.style.setProperty('left', isPlay ? 'calc(50% + 1px)' : '2px');
        thumb.style.setProperty('width', 'calc(50% - 3px)');
        thumb.style.setProperty('border-radius', '999px');
        thumb.style.setProperty('background', accent);
        thumb.style.setProperty('box-shadow', '0 1px 4px rgba(0, 0, 0, 0.55)');
        thumb.style.setProperty('z-index', '1');
        thumb.style.setProperty('transition', 'left 0.22s ease');
        thumb.style.setProperty('pointer-events', 'none');
    }

    /** @param {HTMLElement} el */
    #applyHeaderStatSwitchHostInlineLayout(el) {
        el.style.setProperty('display', 'inline-flex');
        el.style.setProperty('align-items', 'center');
        el.style.setProperty('justify-content', 'center');
        el.style.setProperty('width', 'auto');
        el.style.setProperty('min-width', '3.75rem');
        el.style.setProperty('max-width', 'none');
        el.style.setProperty('height', 'auto');
        el.style.setProperty('min-height', '1.25rem');
        el.style.setProperty('max-height', 'none');
        el.style.setProperty('padding', '0');
        el.style.setProperty('margin', '0');
        el.style.setProperty('border', 'none');
        el.style.setProperty('background', 'transparent');
        el.style.setProperty('overflow', 'visible');
        el.style.setProperty('line-height', '1');
        el.style.setProperty('flex', '0 0 auto');
        el.style.setProperty('box-shadow', 'none');
    }

    /**
     * Sliding E | P switch for the window header (left = Edit, right = Play).
     * @param {boolean} isPlay
     * @param {boolean} interactive
     * @returns {HTMLElement}
     */
    #createHeaderStatModeSwitch(isPlay, interactive) {
        const track = document.createElement('span');
        track.className = 'sla-header-stat-switch-track';

        const labL = document.createElement('span');
        labL.className = 'sla-header-stat-switch-label sla-header-stat-switch-label--left';
        labL.textContent = game.i18n.localize('SLA.StatSheetMode.EditShort');

        const labR = document.createElement('span');
        labR.className = 'sla-header-stat-switch-label sla-header-stat-switch-label--right';
        labR.textContent = game.i18n.localize('SLA.StatSheetMode.PlayShort');

        const thumb = document.createElement('span');
        thumb.className = 'sla-header-stat-switch-thumb';
        thumb.setAttribute('aria-hidden', 'true');

        track.append(labL, labR, thumb);
        this.#applyHeaderStatSwitchInlineLayout(track, thumb, labL, labR, isPlay);

        const cls = `sla-header-stat-switch ${isPlay ? 'is-play' : 'is-edit'}${interactive ? '' : ' sla-header-stat-switch--static'}`;
        if (interactive) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = cls;
            b.setAttribute('role', 'switch');
            b.setAttribute('aria-checked', isPlay ? 'true' : 'false');
            b.title = game.i18n.localize('SLA.StatSheetMode.SwitchTitle');
            this.#applyHeaderStatSwitchHostInlineLayout(b);
            b.appendChild(track);
            return b;
        }
        const d = document.createElement('div');
        d.className = cls;
        d.title = game.i18n.localize(isPlay ? 'SLA.StatSheetMode.PlayTitle' : 'SLA.StatSheetMode.EditTitle');
        this.#applyHeaderStatSwitchHostInlineLayout(d);
        d.appendChild(track);
        return d;
    }

    /** @param {MouseEvent} event */
    #onHeaderStatSwitchClick = async (event) => {
        if (!this.actor.isOwner) return;
        const t = event.currentTarget;
        if (!(t instanceof HTMLButtonElement) || !t.classList.contains('sla-header-stat-switch')) return;
        event.preventDefault();
        event.stopPropagation();
        const cur = this.actor.getFlag('sla-industries', 'statSheetMode') ?? 'play';
        const next = cur === 'play' ? 'edit' : 'play';
        await this.actor.setFlag('sla-industries', 'statSheetMode', next);
        this.render(false);
    };

    /** @override */
    _getHeaderControls() {
        const controls = super._getHeaderControls();
        // Some v13 flows can produce duplicate or invalid token/artwork controls.
        // Keep instance-token controls only when this sheet has a token context.
        const hasTokenContext = !!this.token;
        const filtered = controls.filter((c) => {
            const action = String(c?.action ?? '');
            if (action === 'configureToken' || action === 'showTokenArtwork') {
                return hasTokenContext;
            }
            return true;
        });

        // Deduplicate by action+label (not just label) to avoid keeping a wrong variant.
        const seen = new Set();
        return filtered.filter((c) => {
            const key = `${String(c?.action ?? '')}|${String(c?.label ?? '')}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /* -------------------------------------------- */
    /* DATA PREPARATION                            */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.actor = this.actor;
        const primaryTabs = this.constructor.TABS?.primary?.tabs ?? [];

        if (this.actor.type === 'character') {
            context.statSheetMode = this.actor.getFlag('sla-industries', 'statSheetMode') ?? 'play';
        }

        if (primaryTabs.length) {
            context.tabs = this._prepareTabs('primary');
            for (const t of primaryTabs) {
                const tab = context.tabs[t.id];
                if (tab) {
                    tab.icon = t.icon;
                    const lk = `SLA.SheetTab.${t.id}`;
                    const loc = game.i18n.localize(lk);
                    tab.label = loc !== lk ? loc : t.label;
                }
            }
            if (primaryTabs.some((t) => t.id === 'effects')) {
                context.effectsList = this._prepareEffectsList();
            }
        }
        context.owner = this.actor.isOwner;
        context.editable = this.isEditable;
        // CRITICAL FIX: Use 'this.actor.system' to access runtime derived data (like .total)
        // context.data (from super.getData) only contains the database properties in some versions.
        context.system = this.actor.system;
        context.flags = this.actor.flags;

        // Base stat scores from document source (ignore active-effect overlays on .value so inputs stay true base)
        if (this.actor.type === 'character' || this.actor.type === 'npc') {
            const core = ['str', 'dex', 'know', 'conc', 'cha', 'cool'];
            const srcStats = foundry.utils.getProperty(this.actor._source, 'system.stats') || {};
            context.statInputs = Object.fromEntries(
                core.map((k) => [k, Number(foundry.utils.getProperty(srcStats[k], 'value')) || 0])
            );
        }

        // ... (Keep your existing stats/ratings/wounds initialization) ...
        context.system.stats = context.system.stats || {};
        context.system.ratings = context.system.ratings || {};
        context.system.wounds = context.system.wounds || {};
        context.system.move = context.system.move || {};
        context.system.conditions = context.system.conditions || {};

        // ======================================================
        // START NEW LOGIC: SYNC CONDITIONS FOR DISPLAY
        // ======================================================
        // Sync togglable conditions from Active Effects so sheet buttons match the token.
        // Critical is excluded: it is derived from HP in prepareDerivedData (not user-toggled).
        const conditionIds = ['bleeding', 'burning', 'stunned', 'prone', 'immobile'];

        for (const statusId of conditionIds) {
            const hasEffect = this.actor.effects.some((e) => e.statuses.has(statusId));
            context.system.conditions[statusId] = hasEffect;
        }
        // ======================================================
        // END NEW LOGIC
        // ======================================================

        context.rollData = context.actor.getRollData();

        if (this.actor.type == 'character' || this.actor.type == 'npc' || this.actor.type == 'vehicle') {
            this._prepareItems(context);
        }

        // ... (Keep existing speciesList logic) ...

        context.speciesItem = this.actor.items.find((i) => i.type === 'species');
        context.packageItem = this.actor.items.find((i) => i.type === 'package');

        // --- CHECK IF EBONITE ---
        if (context.speciesItem && context.speciesItem.name) {
            context.isEbonite = context.speciesItem.name.toLowerCase().includes('ebonite');
        } else {
            context.isEbonite = false;
        }

        context.enrichedBiography = await foundry.applications.ux.TextEditor.enrichHTML(this.actor.system.biography, {
            async: true,
            relativeTo: this.actor
        });
        context.enrichedAppearance = await foundry.applications.ux.TextEditor.enrichHTML(this.actor.system.appearance, {
            async: true,
            relativeTo: this.actor
        });
        context.enrichedNotes = await foundry.applications.ux.TextEditor.enrichHTML(this.actor.system.notes, {
            async: true,
            relativeTo: this.actor
        });

        return context;
    }

    _prepareItems(context) {
        const items = Array.from(this.actor.items);
        const itemData = prepareItems(items, context.rollData);
        Object.assign(context, itemData);
    }

    /**
     * @returns {Array<{ id: string, name: string, img: string, disabled: boolean, sourceName: string, durationLabel: string }>}
     */
    _prepareEffectsList() {
        return Array.from(this.actor.effects).map((e) => {
            let durationLabel = '';
            try {
                const d = e.updateDuration?.() ?? e.duration;
                durationLabel = d?.label || '';
            } catch {
                durationLabel = '';
            }
            return {
                id: e.id,
                name: e.name,
                img: e.img,
                disabled: e.disabled,
                sourceName: e.sourceName,
                durationLabel
            };
        });
    }

    /**
     * ContextMenu.close() can animate via getBoundingClientRect on a target that is already detached
     * when the sheet closes. Skip animation and await so promise rejections are handled.
     */
    async #disposeSheetItemContextMenu() {
        const cm = this.#sheetItemContextMenu;
        this.#sheetItemContextMenu = null;
        if (!cm) return;
        try {
            await cm.close?.({ animate: false });
        } catch {
            /* sync throw or missing target */
        }
    }

    /** @override */
    async _onClose(options) {
        await this.#disposeSheetItemContextMenu();
        this.#sheetUiAbort?.abort();
        this.#sheetUiAbort = null;
        return super._onClose(options);
    }

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);
        this.#sheetUiAbort?.abort();
        this.#sheetUiAbort = new AbortController();
        const { signal } = this.#sheetUiAbort;
        const root = this.element;
        const primaryTabs = this.constructor.TABS?.primary?.tabs ?? [];

        // Operative tabs: App V2's default tab binding expects a `.content` wrapper; we use `.sheet-body`.
        // Also register even when !isEditable so observers can switch tabs.
        if (primaryTabs.length) {
            root.addEventListener('click', this.#onTabNavClick, { signal, capture: true });
        }
        const fxSearch = root.querySelector('.sla-effect-search');
        if (fxSearch instanceof HTMLInputElement) {
            fxSearch.addEventListener('input', this.#onActorEffectSearchInput, { signal });
        }
        if (this.actor.type === 'character') {
            this.#injectStatSheetHeaderToggle(signal);
        }

        // Clicks: rolls / compendium / conditions must work even when the sheet is not editable (v13 often uses !isEditable for "play" sheets).
        root.addEventListener('click', this.#onSheetClick, { signal });
        // Wound checkboxes use change events; same visibility as rolls for owners.
        root.addEventListener('change', this.#onSheetChange, { signal });

        // Hotbar macro from item row: must work when the sheet is not editable (player default).
        if (this.actor.isOwner) {
            await this.#bindSheetItemContextMenu(root);
        }

        if (!this.isEditable) return;

        if (this.actor.type === 'vehicle') {
            const dropZone = root.querySelector('.vehicle-weapon-drop');
            dropZone?.addEventListener('dragover', (e) => e.preventDefault(), { signal });
            dropZone?.addEventListener('drop', (e) => void onDropVehicleWeapon(this, e), { signal });
        }
    }

    /**
     * Context menu on `.item[data-item-id]` rows (inventory, combat loadout, vehicle weapons, etc.).
     * @param {HTMLElement} root
     */
    async #bindSheetItemContextMenu(root) {
        await this.#disposeSheetItemContextMenu();

        const ContextMenuCls =
            foundry.applications.ux.ContextMenu.implementation ?? foundry.applications.ux.ContextMenu;
        if (!ContextMenuCls) return;

        // v13: pass jQuery:false so callbacks receive HTMLElement; core still reads `callback`, not `onClick`.
        this.#sheetItemContextMenu = new ContextMenuCls(
            root,
            '.item[data-item-id]',
            [
                {
                    name: 'add to hotbar',
                    label: 'add to hotbar',
                    icon: '<i class="fas fa-th-large"></i>',
                    callback: (target) => {
                        const el = target instanceof HTMLElement ? target : target?.[0];
                        const row = el?.closest?.('.item[data-item-id]') ?? el;
                        const id = row?.dataset?.itemId;
                        const item = id ? this.actor.items.get(id) : null;
                        if (item) void addActorItemToHotbar(item);
                    }
                }
            ],
            { fixed: true, relative: 'cursor', jQuery: false }
        );
    }

    /** @param {Event} event */
    #onActorEffectSearchInput = (event) => {
        const el = event.currentTarget;
        if (!(el instanceof HTMLInputElement)) return;
        const root = this.element;
        if (!(root instanceof HTMLElement)) return;
        const q = el.value.toLowerCase().trim();
        for (const row of root.querySelectorAll('.sla-effect-row')) {
            if (!(row instanceof HTMLElement)) continue;
            const n = (row.dataset.effectName || '').toLowerCase();
            row.classList.toggle('sla-effect-filtered', Boolean(q) && !n.includes(q));
        }
    };

    /**
     * Delegates primary tab clicks to ApplicationV2#changeTab (see _onRender).
     * @param {PointerEvent} event
     */
    #onTabNavClick = (event) => {
        const raw = event.target;
        const el = raw instanceof Element ? raw : raw?.parentElement;
        const tabNavLink = el?.closest?.('nav.sheet-tabs.tabs [data-tab]');
        if (!tabNavLink?.dataset?.tab || !tabNavLink.dataset?.group) return;
        event.preventDefault();
        event.stopPropagation();
        this.changeTab(tabNavLink.dataset.tab, tabNavLink.dataset.group, { event, navElement: tabNavLink });
    };

    #onSheetClick = async (event) => {
        await handleSheetClick(this, event);
    };

    #onSheetChange = async (event) => {
        await handleSheetChange(this, event);
    };

    async _onRoll(event, rollTarget) {
        return handleSheetRoll(this, event, rollTarget);
    }

    _canProceedWithWeaponAttack(item, options) {
        return canProceedWithWeaponAttack(this, item, options);
    }

    async triggerItemRoll(item) {
        return triggerItemRoll(this, item);
    }

    // --- DIALOG ---
    async _renderAttackDialog(item, isMelee) {
        return renderAttackDialog(this, item, isMelee);
    }

    async _executeSkillRoll(element) {
        const itemId = element.closest('.item')?.dataset.itemId;
        const item = itemId ? this.actor.items.get(itemId) : null;
        if (!item) return;
        await this._executeSkillRollFromItem(item);
    }

    async _executeSkillRollFromItem(item) {
        return executeSkillRollFromItem(this, item);
    }

    _generateTooltip(roll, baseModifier, successDieMod) {
        return generateSheetTooltip(roll, baseModifier, successDieMod);
    }

    _buildSlaRollFlags(params) {
        return buildSlaRollFlags(params);
    }

    _resolveCombatSkillRank(skillInput) {
        return resolveCombatSkillRank(this.actor, skillInput);
    }

    async _applyHeadshotSideEffect(notes) {
        return applyHeadshotSideEffect(notes);
    }

    _resolveDamageDisplay(formula) {
        return resolveSheetDamageDisplay(formula, this.actor);
    }

    _buildSkillDiceResults(params) {
        return buildSkillDiceResultsForSheet(params);
    }

    _computeSuccessDieOutcome(params) {
        return computeSuccessDieOutcomeForSheet(params);
    }

    _applySuccessThroughExperience(params) {
        return applySuccessThroughExperienceForSheet(params);
    }

    _resolveRangedAttackContext(item, isMelee) {
        return resolveRangedAttackContext(this, item, isMelee);
    }

    async _processWeaponRoll(item, html, isMelee) {
        return processWeaponRoll(this, item, html, isMelee);
    }

    async _renderExplosiveDialog(item) {
        return renderExplosiveDialog(this, item);
    }

    async _processExplosiveRoll(item, html) {
        return processExplosiveRoll(this, item, html);
    }

    async _executeEbbRoll(item) {
        return executeEbbRoll(this, item);
    }

    async _onDropItem(event, data) {
        const result = await onDropItem(this, event, data);
        if (result === null) return super._onDropItem(event, data);
        return result;
    }

    async _onDropVehicleWeapon(event) {
        return onDropVehicleWeapon(this, event);
    }

    async _onItemCreate(event, createEl) {
        return onItemCreate(this, event, createEl);
    }

    // --- HELPER: MELEE LOGIC ---
    _applyMeleeModifiers(form, strValue, mods) {
        applyMeleeModifiers(form, strValue, mods);
    }

    // --- HELPER: RANGED LOGIC ---
    async _applyRangedModifiers(item, form, mods, notes, flags, options = {}) {
        return await applyRangedModifiers(item, form, mods, notes, flags, options);
    }
}
