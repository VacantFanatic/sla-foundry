import { SlaActorSheet } from "./actor-sheet.mjs";

/**
 * Extend the basic SlaActorSheet with NPC-specific modifications
 * @extends {SlaActorSheet}
 */
export class SlaNPCSheet extends SlaActorSheet {
  /** @override */
  static get defaultOptions() {
    const parentOptions = super.defaultOptions || {};
    // Merge classes arrays properly - combine parent classes with our own
    const parentClasses = Array.isArray(parentOptions.classes) ? parentOptions.classes : [];
    const mergedClasses = [...new Set([...parentClasses, "sla-industries", "sla-sheet", "sheet", "actor", "npc", "threat-sheet"])];
    
    return foundry.utils.mergeObject(parentOptions, {
      classes: mergedClasses,
      template: "systems/sla-industries/templates/actor/actor-npc-sheet.hbs",
      tag: "form", // V13: Required for forms in ApplicationV2
      position: {
        width: 600,
        height: 600
      },
      form: {
        submitOnChange: false,
        closeOnSubmit: false // NPC sheets don't close on submit
      }
      // Note: NPC sheet doesn't use tabs - it's a single view sheet
    });
  }

  /** @override */
  static get PARTS() {
    // NPC sheet doesn't use parts - it's a single-form template
    return {};
  }

  /** @override */
  get template() {
    // Force NPC template - override parent's template getter
    return "systems/sla-industries/templates/actor/actor-npc-sheet.hbs";
  }

  /** @override */
  static get TABS() {
    // NPC sheet doesn't use tabs - it's a single view
    return {};
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    
    // V13: Check if template content exists - ApplicationV2 might not render when PARTS is empty
    const element = this.element;
    if (!element) return;
    
    // Check both window-content and the element itself
    const windowContent = element.querySelector('.window-content');
    const formContent = element.querySelector('div.threat-sheet, div.sla-sheet');
    const hasContent = windowContent 
      ? (windowContent.innerHTML?.trim().length > 0)
      : (formContent || element.innerHTML?.trim().length > 0);
    
    if (!hasContent) {
      // Template wasn't rendered automatically - render it manually
      try {
        const templateContext = context || await this._prepareContext(options);
        const template = this.template;
        const html = await foundry.applications.handlebars.renderTemplate(template, templateContext);
        
        if (windowContent) {
          // Render into window-content if it exists
          windowContent.innerHTML = html;
        } else {
          // For ApplicationV2 with tag: 'form', render directly into the form element
          // But preserve any existing structure (like window-header if it exists)
          const existingHeader = element.querySelector('.window-header');
          if (existingHeader) {
            // Clear content but keep header
            Array.from(element.children).forEach(child => {
              if (!child.classList.contains('window-header')) {
                child.remove();
              }
            });
            element.insertAdjacentHTML('beforeend', html);
          } else {
            element.innerHTML = html;
          }
        }
      } catch (error) {
        console.error("SlaNPCSheet template rendering error:", error);
        console.error("Error details:", error);
        ui.notifications?.error(`Failed to render NPC sheet template: ${error.message}`);
        return;
      }
    }

    // Ensure HP max value exists for NPCs (default to 10 if not set)
    if (!this.actor.system.hp?.max && this.actor.system.hp?.max !== 0) {
      await this.actor.update({ "system.hp.max": this.actor.system.hp?.max || 10 }, { render: false });
    }
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    
    // V13: Check if template content exists - ApplicationV2 might not render when PARTS is empty
    const element = this.element;
    if (!element) return;
    
    // Check both window-content and the element itself
    const windowContent = element.querySelector('.window-content');
    const formContent = element.querySelector('div.threat-sheet, div.sla-sheet');
    const hasContent = windowContent 
      ? (windowContent.innerHTML?.trim().length > 0)
      : (formContent || element.innerHTML?.trim().length > 0);
    
    if (!hasContent) {
      // Template wasn't rendered automatically - render it manually
      try {
        const templateContext = context || await this._prepareContext(options);
        const template = this.template;
        const html = await foundry.applications.handlebars.renderTemplate(template, templateContext);
        
        if (windowContent) {
          // Render into window-content if it exists
          windowContent.innerHTML = html;
        } else {
          // For ApplicationV2 with tag: 'form', render directly into the form element
          // But preserve any existing structure (like window-header if it exists)
          const existingHeader = element.querySelector('.window-header');
          if (existingHeader) {
            // Clear content but keep header
            Array.from(element.children).forEach(child => {
              if (!child.classList.contains('window-header')) {
                child.remove();
              }
            });
            element.insertAdjacentHTML('beforeend', html);
          } else {
            element.innerHTML = html;
          }
        }
      } catch (error) {
        console.error("SlaNPCSheet template rendering error:", error);
        console.error("Error details:", error);
        ui.notifications?.error(`Failed to render NPC sheet template: ${error.message}`);
        return;
      }
    }

    // Ensure HP max value exists for NPCs (default to 10 if not set)
    if (!this.actor.system.hp?.max && this.actor.system.hp?.max !== 0) {
      await this.actor.update({ "system.hp.max": this.actor.system.hp?.max || 10 }, { render: false });
    }

    // Add HP input blur handler for real-time clamping
    const hpValueInput = element.querySelector('input[name="system.hp.value"]');
    if (hpValueInput) {
      // Remove any existing listener to avoid duplicates
      const newHpValueInput = hpValueInput.cloneNode(true);
      hpValueInput.parentNode.replaceChild(newHpValueInput, hpValueInput);
      
      newHpValueInput.addEventListener('blur', async (ev) => {
        const value = ev.target.value;
        if (value !== '' && value !== null && value !== undefined) {
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            const maxHP = this.actor.system.hp?.max || 10;
            const clampedValue = Math.max(0, Math.min(numValue, maxHP));
            
            // Update HP value
            await this.actor.update({ "system.hp.value": clampedValue }, { render: false });
            
            // Recalculate derived data (critical status, etc.)
            await this.actor.prepareDerivedData();
            
            // Get calculated critical status
            const calculatedCritical = this.actor.system.conditions?.critical || false;
            const currentCritical = this.actor.system.conditions?.critical || false;
            
            // Update critical condition if it changed
            if (calculatedCritical !== currentCritical) {
              await this.actor.update({ "system.conditions.critical": calculatedCritical }, { render: false });
            }
            
            // Re-render to show updated critical status
            await this.render();
          }
        }
      });
    }
  }

  /** @override */
  _onChangeInput(ev) {
    const input = ev.target;
    
    // Handle HP value changes for NPCs - ensure maxHP is used for clamping
    if (input && input.name === 'system.hp.value') {
      const value = input.value;
      // Only update if the value is actually a number (not empty string)
      if (value !== '' && value !== null && value !== undefined) {
        const numValue = Number(value);
        if (!isNaN(numValue)) {
          // Clamp to maxHP before saving
          const maxHP = this.actor.system.hp?.max || 10;
          const clampedValue = Math.max(0, Math.min(numValue, maxHP));
          
          // Update the input value immediately for visual feedback
          input.value = clampedValue;
          
          // Save immediately (will be clamped again by _preUpdate, but this ensures immediate feedback)
          const updateData = { 
            "system.hp.value": clampedValue 
          };
          this.actor.update(updateData, { render: false }).then(async () => {
            // Recalculate derived data after HP update
            await this.actor.prepareDerivedData();
            
            // Get calculated critical status and update if needed
            const calculatedCritical = this.actor.system.conditions?.critical || false;
            await this.actor.update({ "system.conditions.critical": calculatedCritical }, { render: false });
            
            // Re-render to show updates
            await this.render();
          }).catch(err => {
            console.error("Error updating HP value:", err);
          });
        }
      }
      return false; // Prevent default form handling
    }
    
    // Call parent implementation for other inputs (including wound checkboxes)
    return super._onChangeInput(ev);
  }
}
