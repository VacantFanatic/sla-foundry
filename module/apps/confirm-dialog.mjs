/**
 * V2-compatible Confirmation Dialog
 * Replaces Dialog.confirm to avoid V1 Application framework deprecation warnings
 */

const { ApplicationV2 } = foundry.applications.api;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class ConfirmDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    
    /** @override */
    static get defaultOptions() {
        const parentOptions = super.defaultOptions || {};
        // Merge classes arrays properly - combine parent classes with our own
        const parentClasses = Array.isArray(parentOptions.classes) ? parentOptions.classes : [];
        const mergedClasses = [...new Set([...parentClasses, "sla-industries", "confirm-dialog"])];
        
        return foundry.utils.mergeObject(parentOptions, {
            classes: mergedClasses,
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
    }

    // V13: Constructor takes ALL parameters in a single options object
    constructor(options = {}) {
        // Extract data from options if provided, otherwise use options directly
        const data = options.data || options;
        const mergedOptions = foundry.utils.mergeObject(ConfirmDialog.defaultOptions, {
            ...options,
            // Remove data from options as it's not a valid ApplicationV2 option
            data: undefined,
            // CRITICAL: Force the correct template - ensure we always use confirm-dialog.hbs
            template: "systems/sla-industries/templates/dialogs/confirm-dialog.hbs"
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
        
        // Check if template content exists - ApplicationV2 might render into window-content or directly into element
        const windowContent = element.querySelector('.window-content');
        const hasContent = windowContent ? 
            (windowContent.innerHTML?.trim().length > 0 && element.querySelector('.confirm-dialog-content')) : 
            (element.innerHTML?.trim().length > 0);
        
        if (!hasContent) {
            // Template wasn't rendered automatically - render it manually
            try {
                // Use the context passed to _onRender (which should already have our templateData merged)
                // If context is not available, prepare it fresh
                const templateContext = context || await this._prepareContext(options);
                const template = "systems/sla-industries/templates/dialogs/confirm-dialog.hbs";
                const html = await foundry.applications.handlebars.renderTemplate(template, templateContext);
                if (windowContent) {
                    windowContent.innerHTML = html;
                } else {
                    // For ApplicationV2 with tag: 'form', render directly into the form element
                    element.innerHTML = html;
                }
            } catch (error) {
                console.error("ConfirmDialog template rendering error:", error);
                ui.notifications.error("Failed to render confirm dialog template.");
                return;
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

