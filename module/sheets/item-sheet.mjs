/**
 * SLA item sheet (Application V2).
 * @extends {HandlebarsApplicationMixin(ItemSheetV2)}
 */
import { prepareFiringModes, getLinkedDisciplineImage, enrichItemDescription } from "../helpers/item-sheet.mjs";
import { handleWeaponDrop, handleWeaponSkillDrop, handleDisciplineDrop, handleSkillDrop, handleSkillDelete } from "../helpers/drop-handlers.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const ITEM_TAB_TYPES = new Set(["weapon", "armor", "explosive"]);
const CONSUMABLE_TAB_TYPES = new Set(["drug", "toxicant"]);

export class SlaItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

    /** @override */
    static PARTS = {
        body: {
            template: "systems/sla-industries/templates/item/item-sheet-v2.hbs",
            // Mount inside the application root <form> (tag: "form"); otherwise fields can render outside it and <prose-mirror> will not persist.
            root: true,
            scrollable: [""]
        }
    };

    /** @override */
    static TABS = {
        primary: {
            tabs: [
                { id: "attributes", label: "Details" },
                { id: "description", label: "Description" },
                { id: "effects", label: "Effects" }
            ],
            initial: "attributes"
        }
    };

    /**
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async removeWeaponLink(event, target) {
        event.preventDefault();
        await this.item.update({ "system.linkedWeapon": "" });
    }

    /**
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async removeSkillLink(event, target) {
        event.preventDefault();
        await this.item.update({ "system.skill": "" });
    }

    /**
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async removeDisciplineLink(event, target) {
        event.preventDefault();
        await this.item.update({ "system.discipline": "" });
    }

    /**
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async deleteSkillGrant(event, target) {
        event.preventDefault();
        const el = target.closest("[data-index]");
        const index = Number(el?.dataset.index);
        if (Number.isNaN(index)) return;
        await handleSkillDelete(index, this.item);
    }

    /**
     * Header control: open item image in ImagePopout (includes Show Players via core share).
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static showItemArtwork(event, target) {
        event.preventDefault();
        const item = this.item;
        if (!item) return;
        const src = item.img;
        if (!src) {
            ui.notifications?.warn?.(game.i18n.localize("SLA.ItemSheet.NoImage"));
            return;
        }
        const ImagePopout = foundry.applications.apps?.ImagePopout ?? globalThis.ImagePopout;
        if (!ImagePopout) {
            ui.notifications?.error?.("ImagePopout is unavailable.");
            return;
        }
        const popout = new ImagePopout({
            src,
            uuid: item.uuid,
            window: { title: item.name }
        });
        popout.render(true);
    }

    /** @override */
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
        tag: "form",
        form: {
            ...(super.DEFAULT_OPTIONS.form ?? {}),
            submitOnChange: true,
            closeOnSubmit: false
        },
        classes: ["sla-industries", "sheet", "item"],
        position: {
            width: 550,
            height: 600
        },
        window: {
            frame: true,
            resizable: true,
            minimizable: true
        },
        actions: {
            removeWeaponLink: SlaItemSheet.removeWeaponLink,
            removeSkillLink: SlaItemSheet.removeSkillLink,
            removeDisciplineLink: SlaItemSheet.removeDisciplineLink,
            deleteSkillGrant: SlaItemSheet.deleteSkillGrant,
            showItemArtwork: SlaItemSheet.showItemArtwork
        }
    }, { inplace: false });

    /** @override */
    _getHeaderControls() {
        const controls = super._getHeaderControls();
        const artworkActions = new Set(["showArtwork", "showPortrait", "showItemArtwork"]);
        if (controls.some((c) => artworkActions.has(String(c?.action ?? "")))) {
            return controls;
        }
        return [
            ...controls,
            {
                icon: "fa-solid fa-image",
                label: game.i18n.localize("SLA.ItemSheet.ViewArtwork"),
                action: "showItemArtwork",
                ownership: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
            }
        ];
    }

    /** @type {AbortController | null} */
    #dropListenersAbort = null;

    /** @type {ResizeObserver | null} */
    #itemSheetScrollObserver = null;

    /** @type {AbortController | null} */
    #scrollLayoutAbort = null;

    // --------------------------------------------
    //  DATA PREPARATION
    // --------------------------------------------

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const item = this.item;

        context.item = item;
        context.system = item.system;
        context.flags = item.flags;
        context.config = CONFIG.SLA;
        context.owner = item.isOwner;
        context.editable = this.isEditable;

        context.useConsumableTabs = CONSUMABLE_TAB_TYPES.has(item.type);
        context.useItemTabs = ITEM_TAB_TYPES.has(item.type);
        if (context.useConsumableTabs || context.useItemTabs) {
            context.tabs = this._prepareTabs("primary");
        }
        if (context.useConsumableTabs) {
            context.itemEffects = Array.from(item.effects).map((e) => ({
                id: e.id,
                name: e.name,
                img: e.img
            }));
        }

        context.enrichedDescription = await enrichItemDescription(item);

        if (item.type === "weapon") {
            context.firingModes = prepareFiringModes(item.system);
        }

        context.linkedDisciplineImg = getLinkedDisciplineImage(item);

        return context;
    }

    /**
     * Magazine template exposes an empty <option value=""> for ammo type; invalid StringField values can reject the whole update (including description).
     * @param {object} data
     */
    #coerceMagazineAmmoTypeOnSubmit(data) {
        if (this.item?.type !== "magazine" || !data || typeof data !== "object") return;
        const raw = foundry.utils.getProperty(data, "system.ammoType");
        if (raw === "" || raw === null || raw === undefined) {
            foundry.utils.setProperty(data, "system.ammoType", "std");
        }
    }

    /**
     * Core form pipeline omits <prose-mirror> from FormData; merge live description before the Item update runs.
     * @override
     */
    _prepareSubmitData(event, form, formData, updateData) {
        const data = super._prepareSubmitData(event, form, formData, updateData);
        if (!this.isEditable || !(form instanceof HTMLFormElement)) return data;
        const el = form.querySelector('prose-mirror[name="system.description"]');
        if (!el) return data;
        try {
            if (typeof el.isDirty === "function" && el.isDirty() && typeof el.save === "function") el.save();
        } catch {
            /* ignore */
        }
        const html = typeof el.value === "string" ? el.value : "";
        foundry.utils.setProperty(data, "system.description", html);
        this.#coerceMagazineAmmoTypeOnSubmit(data);
        return data;
    }

    /** @override */
    async _onClose(options) {
        this.#scrollLayoutAbort?.abort();
        this.#scrollLayoutAbort = null;
        this.#itemSheetScrollObserver?.disconnect();
        this.#itemSheetScrollObserver = null;
        this.#dropListenersAbort?.abort();
        this.#dropListenersAbort = null;
        return super._onClose(options);
    }

    /** @override */
    async _preClose(options) {
        await this.#flushDescriptionProseMirrorIfNeeded();
        return super._preClose(options);
    }

    /** @returns {HTMLFormElement|HTMLElement} Scope that contains sheet fields (form root vs wrapper). */
    #formFieldRoot() {
        const f = this.form;
        if (f instanceof HTMLFormElement) return f;
        const el = this.element;
        if (el instanceof HTMLFormElement) return el;
        return el;
    }

    /**
     * With `PARTS.body.root: true`, Foundry does not wrap the template in its scrollable part host; flex alone often
     * never yields a bounded height. Pin .sheet-body max-height to the visible window-content (viewport) box.
     */
    #bindItemSheetScrollLayout() {
        this.#scrollLayoutAbort?.abort();
        this.#itemSheetScrollObserver?.disconnect();
        this.#scrollLayoutAbort = new AbortController();
        const { signal } = this.#scrollLayoutAbort;

        const root = this.#formFieldRoot();
        const sheetBody = root?.querySelector?.(".sheet-body");
        if (!(sheetBody instanceof HTMLElement)) return;

        const resolveHost = () => {
            let el = this.element?.closest?.(".window-content");
            if (el instanceof HTMLElement) return el;
            el = this.element?.closest?.(".application__body");
            if (el instanceof HTMLElement) return el;
            let walk = this.element instanceof HTMLElement ? this.element : null;
            for (let i = 0; i < 15 && walk instanceof HTMLElement; i++, walk = walk.parentElement) {
                const cls = typeof walk.className === "string" ? walk.className : "";
                if (/\bwindow-content\b/.test(cls)) return walk;
            }
            return this.element instanceof HTMLElement ? this.element.parentElement : null;
        };

        const apply = () => {
            const host = resolveHost();
            const bodyBr = sheetBody.getBoundingClientRect();
            const slack = 12;
            let maxH;

            if (host instanceof HTMLElement) {
                const hostBr = host.getBoundingClientRect();
                maxH = Math.floor(hostBr.bottom - bodyBr.top - slack);
            }

            const ph = Number(this.position?.height);
            if (!Number.isFinite(maxH) || maxH > 2400 || maxH < 40) {
                if (Number.isFinite(ph) && ph > 100) {
                    let chrome = 48;
                    for (const sel of [".sheet-header", ".sheet-tabs", ".sla-item-tab-nav"]) {
                        const e = root.querySelector(sel);
                        if (e instanceof HTMLElement) chrome += e.getBoundingClientRect().height;
                    }
                    maxH = Math.floor(ph - chrome);
                }
            }

            maxH = Math.max(100, maxH ?? 200);
            const viewportCap = Math.floor((globalThis.innerHeight ?? 800) - bodyBr.top - 24);
            if (Number.isFinite(viewportCap) && viewportCap > 100) maxH = Math.min(maxH, viewportCap);

            sheetBody.style.maxHeight = `${maxH}px`;
            sheetBody.style.overflowY = "auto";
            sheetBody.style.minHeight = "0";
        };

        queueMicrotask(() => {
            apply();
            requestAnimationFrame(() => {
                apply();
                requestAnimationFrame(apply);
            });
        });

        const host = resolveHost();
        if (host instanceof HTMLElement) {
            this.#itemSheetScrollObserver = new ResizeObserver(() => apply());
            this.#itemSheetScrollObserver.observe(host);
        }
        globalThis.addEventListener?.("resize", apply, { signal });
    }

    /** Read HTML from a prose-mirror; optional CustomEvent may carry detail. */
    #readProseMirrorDescriptionValue(el, event) {
        if (typeof el.value === "string") return el.value;
        if (event instanceof CustomEvent && event.detail != null) {
            const d = event.detail;
            if (typeof d === "string") return d;
            if (typeof d?.html === "string") return d.html;
            if (typeof d?.value === "string") return d.value;
        }
        return "";
    }

    /** App V2: no default `[data-edit]` wiring for item art. */
    async #openItemImagePicker() {
        const Picker = foundry.applications.apps?.FilePicker ?? globalThis.FilePicker;
        if (!Picker) {
            ui.notifications?.error?.("FilePicker is unavailable.");
            return;
        }
        const fp = new Picker({
            type: "image",
            current: this.item.img,
            callback: (path) => {
                if (path) void this.item.update({ img: path });
            }
        });
        await fp.render(true);
    }

    async #flushDescriptionProseMirrorIfNeeded() {
        if (!this.isEditable) return;
        const el = this.#formFieldRoot().querySelector?.('prose-mirror[name="system.description"]');
        if (!el) return;
        try {
            if (typeof el.isDirty === "function" && el.isDirty() && typeof el.save === "function") el.save();
        } catch {
            /* ignore */
        }
        await this.#persistItemDescriptionFromElement(el, null);
    }

    /** @param {HTMLElement} el @param {Event | null} event */
    async #persistItemDescriptionFromElement(el, event) {
        if (!el || el.getAttribute("name") !== "system.description") return;
        let next = this.#readProseMirrorDescriptionValue(el, event);
        if (event?.type === "close" && next === (this.item.system.description ?? "")) {
            await Promise.resolve();
            next = this.#readProseMirrorDescriptionValue(el, null);
        }
        const cur = this.item.system.description ?? "";
        if (next === cur) return;
        await this.item.update({ "system.description": next });
    }

    /** ProseMirror is not a native form control; submitOnChange often never runs for description-only edits. */
    #persistItemDescriptionHtml = async (event) => {
        await this.#persistItemDescriptionFromElement(event.currentTarget, event);
    };

    /**
     * App V2 tab binding targets `.content`; this sheet uses `.sheet-body` (same as actor sheet).
     * @param {PointerEvent} event
     */
    #onItemTabNavClick = (event) => {
        const raw = event.target;
        const el = raw instanceof Element ? raw : raw?.parentElement;
        const tabNavLink = el?.closest?.("nav.sheet-tabs.tabs [data-tab]");
        if (!tabNavLink?.dataset?.tab || !tabNavLink.dataset?.group) return;
        event.preventDefault();
        event.stopPropagation();
        this.changeTab(tabNavLink.dataset.tab, tabNavLink.dataset.group, { event, navElement: tabNavLink });
    };

    /** @param {PointerEvent} event */
    #onItemEffectUiClick = async (event) => {
        const t = event.target;
        if (!(t instanceof Element)) return;
        if (t.closest(".sla-item-effect-create")) {
            event.preventDefault();
            if (!this.isEditable) return;
            await this.item.createEmbeddedDocuments("ActiveEffect", [{
                name: game.i18n.localize("DOCUMENT.ActiveEffect"),
                img: this.item.img || "icons/svg/aura.svg",
                disabled: false,
                transfer: true
            }]);
            this.render(false);
            return;
        }
        const editBtn = t.closest(".sla-item-effect-edit");
        if (editBtn) {
            event.preventDefault();
            const id = editBtn.dataset.effectId;
            const effect = id ? this.item.effects.get(id) : null;
            effect?.sheet?.render(true);
            return;
        }
        const delBtn = t.closest(".sla-item-effect-delete");
        if (delBtn) {
            event.preventDefault();
            if (!this.isEditable) return;
            const id = delBtn.dataset.effectId;
            const effect = id ? this.item.effects.get(id) : null;
            if (effect) await effect.delete();
            this.render(false);
        }
    };

    /** @param {Event} event */
    #onItemEffectSearchInput = (event) => {
        const el = event.currentTarget;
        if (!(el instanceof HTMLInputElement)) return;
        const root = this.#formFieldRoot();
        const q = el.value.toLowerCase().trim();
        for (const row of root.querySelectorAll(".sla-item-effect-row")) {
            if (!(row instanceof HTMLElement)) continue;
            const n = (row.dataset.effectName || "").toLowerCase();
            row.classList.toggle("sla-effect-filtered", Boolean(q) && !n.includes(q));
        }
    };

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);
        if (CONSUMABLE_TAB_TYPES.has(this.item.type) && this.tabGroups?.primary === "description") {
            this.changeTab("attributes", "primary", { force: true });
        }
        this.#bindItemSheetScrollLayout();
        this.#dropListenersAbort?.abort();

        this.#dropListenersAbort = new AbortController();
        const { signal } = this.#dropListenersAbort;
        const root = this.#formFieldRoot();

        if (root.querySelector?.('nav.sheet-tabs.tabs[data-group="primary"]')) {
            root.addEventListener("click", this.#onItemTabNavClick, { signal, capture: true });
        }

        root.addEventListener("click", this.#onItemEffectUiClick, { signal });

        const itemFxSearch = root.querySelector(".sla-item-effect-search");
        if (itemFxSearch instanceof HTMLInputElement) {
            itemFxSearch.addEventListener("input", this.#onItemEffectSearchInput, { signal });
        }

        if (!this.isEditable) return;

        const portrait = root.querySelector('.profile-img[data-edit="img"]');
        if (portrait instanceof HTMLElement) {
            portrait.addEventListener(
                "click",
                (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void this.#openItemImagePicker();
                },
                { signal }
            );
        }

        const weaponLink = root.querySelector(".weapon-link");
        if (weaponLink) {
            weaponLink.addEventListener("drop", this.#onDropWeapon, { signal });
            weaponLink.addEventListener("dragover", SlaItemSheet.#onDragOver, { signal });
        }

        const skillLinkBox = root.querySelector(".skill-link-box");
        if (skillLinkBox) {
            skillLinkBox.addEventListener("dragover", SlaItemSheet.#onDragOver, { signal });
            skillLinkBox.addEventListener("drop", this.#onDropWeaponSkill, { signal });
        }

        const disciplineZone = root.querySelector(".discipline-drop-zone");
        if (disciplineZone) {
            disciplineZone.addEventListener("drop", this.#onDropDiscipline, { signal });
            disciplineZone.addEventListener("dragover", SlaItemSheet.#onDisciplineDragOver, { signal });
        }

        const skillGrant = root.querySelector(".skill-grant-area");
        if (skillGrant) {
            skillGrant.addEventListener("dragover", SlaItemSheet.#onDragOver, { signal });
            skillGrant.addEventListener("drop", this.#onDropSkill, { signal });
        }

        const bindProseMirror = () => {
            for (const el of root.querySelectorAll('prose-mirror[name="system.description"]')) {
                el.addEventListener("save", this.#persistItemDescriptionHtml, { signal });
                el.addEventListener("close", this.#persistItemDescriptionHtml, { signal });
                el.addEventListener("change", this.#persistItemDescriptionHtml, { signal });
            }
        };
        queueMicrotask(bindProseMirror);
    }

    static #onDragOver(event) {
        event.preventDefault();
    }

    static #onDisciplineDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
    }

    #onDropWeapon = async (event) => {
        await handleWeaponDrop(event, this.item);
    };

    #onDropWeaponSkill = async (event) => {
        await handleWeaponSkillDrop(event, this.item);
    };

    #onDropDiscipline = async (event) => {
        await handleDisciplineDrop(event, this.item);
    };

    #onDropSkill = async (event) => {
        await handleSkillDrop(event, this.item);
    };
}
