/**
 * V2-compatible Attack Dialog
 * Converted from V1 Dialog to V2 ApplicationV2
 */

const { ApplicationV2 } = foundry.applications.api;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class AttackDialog extends HandlebarsApplicationMixin(ApplicationV2) {

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
        classes: ["sla-industries", "sla-dialog-window", "dialog", "attack-dialog"],
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

    // V13: Constructor takes ALL parameters in a single options object
    constructor(options = {}) {
        const mergedOptions = foundry.utils.mergeObject(AttackDialog.DEFAULT_OPTIONS, options);
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

