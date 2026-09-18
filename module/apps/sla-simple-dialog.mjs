import { bindEscapeToClose } from '../helpers/dialog-keyboard.mjs';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * Visual "flavor" of a dialog: drives its accent color and header icon via
 * the `flavor-<name>` class and `data-flavor` attribute. See
 * `src/scss/components/_dialog.scss`.
 */
export const DIALOG_FLAVOR_ICONS = {
    action: 'fa-solid fa-crosshairs',
    confirm: 'fa-solid fa-circle-question',
    danger: 'fa-solid fa-triangle-exclamation',
    resource: 'fa-solid fa-star'
};

/**
 * Modal with arbitrary HTML body and primary action (Application V2).
 */
export class SlaSimpleContentDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /** @override */
    static PARTS = {
        body: {
            template: 'systems/sla-industries/templates/dialogs/simple-content-dialog.hbs'
        }
    };

    static async confirmDialog() {
        const form = this.element.querySelector('form');
        const contextRoot = form ?? this.element;
        await this._onConfirm?.(contextRoot);
        this.close();
    }

    static async closeDialog() {
        this.close();
    }

    /** @override */
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        super.DEFAULT_OPTIONS,
        {
            tag: 'div',
            classes: ['sla-dialog-window'],
            actions: {
                confirmDialog: SlaSimpleContentDialog.confirmDialog,
                closeDialog: SlaSimpleContentDialog.closeDialog
            }
        },
        { inplace: false }
    );

    /**
     * @param {object} opts
     * @param {string} opts.title
     * @param {string} opts.contentHtml
     * @param {number} [opts.width]
     * @param {string[]} [opts.classes]
     * @param {string} [opts.actionLabel]
     * @param {boolean} [opts.showCancel]
     * @param {'action'|'confirm'|'danger'|'resource'} [opts.flavor]
     * @param {(form: HTMLFormElement|null) => void|Promise<void>} opts.onConfirm
     */
    constructor(opts) {
        const {
            title,
            contentHtml,
            width = 450,
            classes = [],
            actionLabel = game.i18n.localize('Submit'),
            showCancel = false,
            flavor = 'action',
            onConfirm
        } = opts;

        super({
            window: { title, icon: DIALOG_FLAVOR_ICONS[flavor] ?? DIALOG_FLAVOR_ICONS.action },
            position: { width },
            classes: ['sla-dialog-window', 'dialog', `flavor-${flavor}`, ...classes]
        });

        this._title = title;
        this._contentHtml = contentHtml;
        this._actionLabel = actionLabel;
        this._showCancel = showCancel;
        /** @type {(form: HTMLFormElement|null) => void|Promise<void>|undefined} */
        this._onConfirm = onConfirm;
    }

    /** @override */
    async _prepareContext() {
        const context = await super._prepareContext();
        context.title = this._title;
        context.html = this._contentHtml;
        context.actionLabel = this._actionLabel;
        context.showCancel = this._showCancel;
        return context;
    }

    /** @type {AbortController | null} */
    #uiAbort = null;

    /** @override */
    async _onClose(options) {
        this.#uiAbort?.abort();
        this.#uiAbort = null;
        return super._onClose(options);
    }

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);
        const cancel = this.element.querySelector("[data-action='closeDialog']");
        if (cancel) cancel.style.display = this._showCancel ? '' : 'none';

        this.#uiAbort?.abort();
        this.#uiAbort = new AbortController();
        bindEscapeToClose(this.element, this.#uiAbort.signal, () => this.close());
    }
}
