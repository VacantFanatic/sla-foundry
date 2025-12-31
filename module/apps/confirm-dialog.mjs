/**
 * V2-compatible Confirmation Dialog
 * Replaces Dialog.confirm to avoid V1 Application framework deprecation warnings
 */

const { ApplicationV2 } = foundry.applications.api;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class ConfirmDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
        classes: ["sla-industries", "confirm-dialog"],
        template: "systems/sla-industries/templates/dialogs/confirm-dialog.hbs",
        tag: "form", // V13: Required for dialogs and forms
        position: {
            width: 400,
            height: "auto"
        },
        window: {
            minimizable: false,
            resizable: false
        },
        form: {
            submitOnChange: false,
            closeOnSubmit: false // We handle closing manually
        }
    });

    // V13: Constructor takes ALL parameters in a single options object
    constructor(options = {}) {
        // Extract data from options if provided, otherwise use options directly
        const data = options.data || options;
        const mergedOptions = foundry.utils.mergeObject(ConfirmDialog.DEFAULT_OPTIONS, {
            ...options,
            // Remove data from options as it's not a valid ApplicationV2 option
            data: undefined
        });
        super(mergedOptions);
        // Store data before any async operations
        this._dialogData = data || {};
        this.resolve = null;
        // Prepare template data immediately in constructor
        this.templateData = {
            title: data?.title || "Confirm",
            content: data?.content || "<p>Are you sure?</p>",
            yesLabel: data?.yesLabel || "Yes",
            noLabel: data?.noLabel || "No"
        };
    }
    
    get data() {
        return this._dialogData || {};
    }

    static async confirm(data) {
        return new Promise((resolve) => {
            // V13: Pass data in options object - templateData is set in constructor
            const dialog = new ConfirmDialog({ data });
            dialog.resolve = resolve;
            dialog.render(true); // Render as modal
        });
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        // Merge in our template data (similar to LuckDialog pattern)
        return foundry.utils.mergeObject(context || {}, this.templateData || {});
    }

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);
        // V13: Use DOM methods instead of jQuery
        const element = this.element;
        
        // Check if template content exists - if not, render it manually
        const windowContent = element.querySelector('.window-content');
        let content = element.querySelector('.confirm-dialog-content');
        
        console.log("ConfirmDialog _onRender check:", {
            hasWindowContent: !!windowContent,
            hasContent: !!content,
            windowContentHTML: windowContent?.innerHTML?.substring(0, 100),
            elementHTML: element.innerHTML.substring(0, 200)
        });
        
        if (!content && windowContent) {
            // Template wasn't rendered automatically - render it manually
            try {
                const template = ConfirmDialog.DEFAULT_OPTIONS.template;
                const html = await foundry.applications.handlebars.renderTemplate(template, context);
                windowContent.innerHTML = html;
                content = element.querySelector('.confirm-dialog-content');
                console.log("ConfirmDialog manually rendered template:", { html: html.substring(0, 100), content: !!content });
            } catch (error) {
                console.error("ConfirmDialog template rendering error:", error);
            }
        }
        
        // Handle Yes button
        const yesButton = element.querySelector('button[data-action="yes"]');
        if (yesButton) {
            yesButton.addEventListener('click', async (ev) => {
                ev.preventDefault();
                const data = this.data || {};
                if (data.yes) {
                    await data.yes();
                }
                this.resolve?.(true);
                this.close();
            });
        }

        // Handle No button
        const noButton = element.querySelector('button[data-action="no"]');
        if (noButton) {
            noButton.addEventListener('click', (ev) => {
                ev.preventDefault();
                const data = this.data || {};
                if (data.no) {
                    data.no();
                }
                this.resolve?.(false);
                this.close();
            });
        }

        // Handle Escape key
        element.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                this.resolve?.(false);
                this.close();
            }
        });
    }
}

