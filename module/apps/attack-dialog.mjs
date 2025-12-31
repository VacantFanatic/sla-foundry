/**
 * V2-compatible Attack Dialog
 * Converted from V1 Dialog to V2 ApplicationV2
 */

const { ApplicationV2 } = foundry.applications.api;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class AttackDialog extends HandlebarsApplicationMixin(ApplicationV2) {

    /** @override */
    static get defaultOptions() {
        const parentOptions = super.defaultOptions || {};
        // Merge classes arrays properly - combine parent classes with our own
        const parentClasses = Array.isArray(parentOptions.classes) ? parentOptions.classes : [];
        const mergedClasses = [...new Set([...parentClasses, "sla-industries", "sla-dialog-window", "dialog", "attack-dialog"])];
        
        return foundry.utils.mergeObject(parentOptions, {
            classes: mergedClasses,
            template: "systems/sla-industries/templates/dialogs/attack-dialog.hbs",
            tag: "form", // V13: Required for forms
            position: {
                width: 500,
                height: "auto"
            },
            window: {
                minimizable: false,
                resizable: true
            },
            form: {
                submitOnChange: false,
                closeOnSubmit: false // We handle closing manually
            }
        });
    }

    // V13: Constructor takes ALL parameters in a single options object
    constructor(options = {}) {
        const mergedOptions = foundry.utils.mergeObject(AttackDialog.defaultOptions, options);
        super(mergedOptions);
        // Store dialog data
        this.item = options.item;
        this.isMelee = options.isMelee;
        this.templateData = options.templateData || {};
        this.onRoll = options.onRoll; // Callback function
    }

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        // Merge in our template data
        return foundry.utils.mergeObject(context || {}, this.templateData || {});
    }

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);
        // V13: Use DOM methods instead of jQuery
        const element = this.element;
        
        // Check if template content exists - ApplicationV2 might render into window-content or directly into element
        const windowContent = element.querySelector('.window-content');
        const hasContent = windowContent ? (windowContent.innerHTML?.trim().length > 0) : (element.innerHTML?.trim().length > 0);
        
        if (!hasContent) {
            // Template wasn't rendered automatically - render it manually
            try {
                // Use the context passed to _onRender (which should already have our templateData merged)
                // If context is not available, prepare it fresh
                const templateContext = context || await this._prepareContext(options);
                const template = "systems/sla-industries/templates/dialogs/attack-dialog.hbs";
                const html = await foundry.applications.handlebars.renderTemplate(template, templateContext);
                if (windowContent) {
                    windowContent.innerHTML = html;
                } else {
                    // For ApplicationV2 with tag: 'form', render directly into the form element
                    // But preserve the form wrapper structure
                    element.innerHTML = html;
                }
            } catch (error) {
                console.error("AttackDialog template rendering error:", error);
                ui.notifications.error("Failed to render attack dialog template.");
                return;
            }
        }
        
        // Handle Roll button
        const rollButton = element.querySelector('button[data-action="roll"]');
        if (rollButton) {
            rollButton.addEventListener('click', async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                // Get form data and pass to callback
                if (this.onRoll) {
                    await this.onRoll(element);
                }
                this.close();
            });
        }

        // Handle Cancel/Escape
        element.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                this.close();
            }
        });
    }
}

