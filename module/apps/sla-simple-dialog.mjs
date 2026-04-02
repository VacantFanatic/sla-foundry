const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * Modal with arbitrary HTML body and primary action (Application V2).
 */
export class SlaSimpleContentDialog extends HandlebarsApplicationMixin(ApplicationV2) {

    /** @override */
    static PARTS = {
        body: {
            template: "systems/sla-industries/templates/dialogs/simple-content-dialog.hbs"
        }
    };

    static async confirmDialog() {
        const form = this.element.querySelector("form");
        const contextRoot = form ?? this.element;
        await this._onConfirm?.(contextRoot);
        this.close();
    }

    static async closeDialog() {
        this.close();
    }

    /** @override */
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
        tag: "div",
        classes: ["sla-dialog-window"],
        actions: {
            confirmDialog: SlaSimpleContentDialog.confirmDialog,
            closeDialog: SlaSimpleContentDialog.closeDialog
        }
    }, { inplace: false });

    /**
     * @param {object} opts
     * @param {string} opts.title
     * @param {string} opts.contentHtml
     * @param {number} [opts.width]
     * @param {string[]} [opts.classes]
     * @param {string} [opts.actionLabel]
     * @param {boolean} [opts.showCancel]
     * @param {(form: HTMLFormElement|null) => void|Promise<void>} opts.onConfirm
     */
    constructor(opts) {
        const {
            title,
            contentHtml,
            width = 450,
            classes = [],
            actionLabel = game.i18n.localize("Submit"),
            showCancel = false,
            onConfirm
        } = opts;

        super({
            window: { title },
            position: { width },
            classes: ["sla-dialog-window", "dialog", ...classes]
        });

        this._contentHtml = contentHtml;
        this._actionLabel = actionLabel;
        this._showCancel = showCancel;
        /** @type {(form: HTMLFormElement|null) => void|Promise<void>|undefined} */
        this._onConfirm = onConfirm;
    }

    /** @override */
    async _prepareContext() {
        const context = await super._prepareContext();
        context.html = this._contentHtml;
        context.actionLabel = this._actionLabel;
        context.showCancel = this._showCancel;
        return context;
    }

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);
        const cancel = this.element.querySelector("[data-action='closeDialog']");
        if (cancel) cancel.style.display = this._showCancel ? "" : "none";
    }
}
