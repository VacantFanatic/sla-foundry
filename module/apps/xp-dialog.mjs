/**
 * Dialog for managing Experience Points (XP)
 * - GM Mode: Add/remove XP directly
 * - Player Mode: Purchase stat/skill/discipline upgrades
 */
export class XPDialog extends Dialog {

    constructor(actor, data, options) {
        super(data, options);
        this.actor = actor;
        this.pendingUpgrades = {
            stats: {}, // { str: 1, dex: 1 } means +1 to each
            skills: {}, // { "skill-id": { newRank: 2 } }
            disciplines: {} // { "discipline-id": { newRank: 2 } }
        };
        this.isGM = game.user.isGM;
    }

    /**
     * Factory method to create and render the dialog.
     */
    static async create(actor) {
        const isGM = game.user.isGM;
        const currentXP = actor.system.xp.value || 0;
        const currentCredits = actor.system.finance?.credits || 0;

        // Prepare available skills and disciplines with upgrade options
        const skills = actor.items.filter(i => i.type === 'skill').sort((a, b) => a.name.localeCompare(b.name)).map(skill => {
            const currentRank = parseInt(skill.system.rank) || 0;
            const upgradeOptions = [];
            for (let rank = currentRank + 1; rank <= 4; rank++) {
                upgradeOptions.push({ rank, label: `Increase to Rank ${rank}` });
            }
            return { ...skill, upgradeOptions, currentRank };
        });
        
        const disciplines = actor.items.filter(i => i.type === 'discipline').sort((a, b) => a.name.localeCompare(b.name)).map(discipline => {
            const currentRank = parseInt(discipline.system.rank) || 0;
            const upgradeOptions = [];
            for (let rank = currentRank + 1; rank <= 4; rank++) {
                upgradeOptions.push({ rank, label: `Increase to Rank ${rank}` });
            }
            return { ...discipline, upgradeOptions, currentRank };
        });

        // Get all available skills from compendium for new skill purchase
        const skillCompendium = game.packs.get("sla-industries.skills");
        const availableSkills = skillCompendium ? (await skillCompendium.getDocuments()).sort((a, b) => a.name.localeCompare(b.name)) : [];

        // Get all available disciplines from compendium for new discipline purchase
        const disciplineCompendium = game.packs.get("sla-industries.disciplines");
        const availableDisciplines = disciplineCompendium ? (await disciplineCompendium.getDocuments()).sort((a, b) => a.name.localeCompare(b.name)) : [];

        // Prepare ledger entries for display (most recent first)
        const ledger = actor.system.xpLedger || [];
        const ledgerEntries = ledger
            .slice()
            .reverse() // Show most recent first
            .map(entry => {
                const date = new Date(entry.timestamp);
                return {
                    ...entry,
                    dateFormatted: date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };
            });

        const templateData = {
            isGM,
            currentXP,
            currentCredits,
            ledgerEntries: ledgerEntries.length > 0 ? ledgerEntries : null,
            stats: ["str", "dex", "know", "conc", "cha", "cool"].map(key => ({
                key,
                name: CONFIG.SLA?.stats?.[key] || key.toUpperCase(),
                currentValue: actor.system.stats[key]?.value || 0
            })),
            skills,
            disciplines,
            availableSkills: availableSkills.filter(s => !actor.items.find(i => i.type === 'skill' && i.name.toLowerCase() === s.name.toLowerCase())),
            availableDisciplines: availableDisciplines.filter(d => !actor.items.find(i => i.type === 'discipline' && i.name.toLowerCase() === d.name.toLowerCase())),
            pendingUpgrades: {
                stats: {},
                skills: {},
                disciplines: {}
            },
            totalCostXP: 0,
            totalCostCredits: 0
        };

        const content = await foundry.applications.handlebars.renderTemplate("systems/sla-industries/templates/dialogs/xp-dialog.hbs", templateData);

        return new XPDialog(actor, {
            title: isGM ? "Manage Experience Points" : "Spend Experience Points",
            content: content,
            buttons: {
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel",
                    callback: () => false
                },
                commit: {
                    icon: '<i class="fas fa-check"></i>',
                    label: isGM ? "Update XP" : "Commit Upgrades",
                    callback: (html) => {
                        const dialog = ui.windows[Object.keys(ui.windows).find(k => ui.windows[k].constructor.name === "XPDialog")];
                        return dialog?._commitChanges(html) ?? false;
                    }
                }
            },
            default: "commit",
            close: () => {}
        }, { 
            classes: ["sla-dialog", "sla-sheet", "xp-dialog-window"],
            width: 650,
            height: isGM ? 500 : 650
        }).render(true);
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        const $html = html instanceof jQuery ? html : $(html);

        if (this.isGM) {
            // GM Mode: Enter key support
            $html.find("input[name='xpChange'], input[name='xpReason']").on('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    const commitBtn = $html.closest('.window-app').find('.dialog-button.commit');
                    if (commitBtn.length) commitBtn.click();
                }
            });
        } else {
            // Player Mode: Upgrade system
            html.find("button[data-action='increase-stat']").click(this._increaseStat.bind(this));
            html.find("button[data-action='decrease-stat']").click(this._decreaseStat.bind(this));
            html.find("select[name='skill-upgrade']").change(this._selectSkillUpgrade.bind(this));
            html.find("select[name='discipline-upgrade']").change(this._selectDisciplineUpgrade.bind(this));
            html.find("select[name='new-skill']").change(this._selectNewSkill.bind(this));
            html.find("select[name='new-discipline']").change(this._selectNewDiscipline.bind(this));
            html.find("button[data-action='remove-upgrade']").click(this._removeUpgrade.bind(this));
        }

        this._updateCosts($html);
    }

    _updateGMCost(event) {
        // GM mode - no cost calculation needed
    }

    _increaseStat(event) {
        const statKey = event.currentTarget.dataset.stat;
        // Rule: Each stat can only be improved by 1 rank per downtime
        if (this.pendingUpgrades.stats[statKey] && this.pendingUpgrades.stats[statKey] >= 1) {
            ui.notifications.warn("Each stat can only be improved by 1 rank per downtime period.");
            return;
        }
        this.pendingUpgrades.stats[statKey] = 1;
        this._refreshUI();
    }

    _decreaseStat(event) {
        const statKey = event.currentTarget.dataset.stat;
        if (this.pendingUpgrades.stats[statKey] && this.pendingUpgrades.stats[statKey] > 0) {
            this.pendingUpgrades.stats[statKey]--;
            if (this.pendingUpgrades.stats[statKey] === 0) {
                delete this.pendingUpgrades.stats[statKey];
            }
        }
        this._refreshUI();
    }

    _selectSkillUpgrade(event) {
        const select = event.currentTarget;
        const skillId = select.value;
        const newRank = parseInt(select.options[select.selectedIndex].dataset.rank) || 0;

        if (skillId && newRank > 0) {
            const skill = this.actor.items.get(skillId);
            const currentRank = parseInt(skill.system.rank) || 0;
            if (newRank > currentRank) {
                this.pendingUpgrades.skills[skillId] = { newRank, skillName: skill.name };
            }
        } else {
            delete this.pendingUpgrades.skills[skillId];
        }
        this._refreshUI();
    }

    _selectDisciplineUpgrade(event) {
        const select = event.currentTarget;
        const disciplineId = select.value;
        const newRank = parseInt(select.options[select.selectedIndex].dataset.rank) || 0;

        if (disciplineId && newRank > 0) {
            const discipline = this.actor.items.get(disciplineId);
            const currentRank = parseInt(discipline.system.rank) || 0;
            if (newRank > currentRank) {
                this.pendingUpgrades.disciplines[disciplineId] = { newRank, disciplineName: discipline.name };
            }
        } else {
            delete this.pendingUpgrades.disciplines[disciplineId];
        }
        this._refreshUI();
    }

    _selectNewSkill(event) {
        const select = event.currentTarget;
        const skillId = select.value;
        if (skillId) {
            // Mark for new skill purchase
            this.pendingUpgrades.skills[skillId] = { newRank: 1, isNew: true };
        }
        this._refreshUI();
    }

    _selectNewDiscipline(event) {
        const select = event.currentTarget;
        const disciplineId = select.value;
        if (disciplineId) {
            // Mark for new discipline purchase
            this.pendingUpgrades.disciplines[disciplineId] = { newRank: 1, isNew: true };
        }
        this._refreshUI();
    }

    _removeUpgrade(event) {
        const type = event.currentTarget.dataset.type;
        const id = event.currentTarget.dataset.id;

        if (type === 'stat') {
            delete this.pendingUpgrades.stats[id];
        } else if (type === 'skill') {
            delete this.pendingUpgrades.skills[id];
            // Reset select
            const html = $(this.element);
            html.find(`select[name='skill-upgrade'][data-skill-id='${id}']`).val('');
        } else if (type === 'discipline') {
            delete this.pendingUpgrades.disciplines[id];
            const html = $(this.element);
            html.find(`select[name='discipline-upgrade'][data-discipline-id='${id}']`).val('');
        }
        this._refreshUI();
    }

    _refreshUI() {
        // Update the dialog content
        const html = $(this.element);
        
        // Update pending upgrades display
        this._updatePendingUpgrades(html);
        
        // Recalculate and update costs
        this._updateCosts(html);
    }

    _updatePendingUpgrades(html) {
        // Update stat display
        for (const [statKey, increase] of Object.entries(this.pendingUpgrades.stats)) {
            if (increase > 0) {
                const statDisplay = html.find(`.pending-stat-${statKey}`);
                statDisplay.show();
                statDisplay.find('.pending-stat-value').text(increase);
                // Enable/disable decrease button
                html.find(`button[data-action='decrease-stat'][data-stat='${statKey}']`).prop('disabled', false);
            } else {
                html.find(`.pending-stat-${statKey}`).hide();
                html.find(`button[data-action='decrease-stat'][data-stat='${statKey}']`).prop('disabled', true);
            }
        }
    }

    _updateCosts(html) {
        if (this.isGM) return; // No cost display for GM mode
        
        const { totalXP, totalCredits } = this._calculateCosts();
        html.find(".total-cost-xp").text(totalXP);
        html.find(".total-cost-credits").text(totalCredits);
        
        const currentXP = this.actor.system.xp.value || 0;
        const currentCredits = this.actor.system.finance?.credits || 0;
        
        const canAfford = currentXP >= totalXP && currentCredits >= totalCredits;
        // Find the commit button by looking for the button with commit callback
        const commitBtn = html.closest('.window-app').find('.dialog-button.commit, button:contains("Commit")');
        if (commitBtn.length) commitBtn.prop('disabled', !canAfford);
        
        if (!canAfford) {
            html.find(".cost-warning").show();
            if (currentXP < totalXP) {
                html.find(".cost-warning-xp").show().text(`Need ${totalXP - currentXP} more XP`);
            } else {
                html.find(".cost-warning-xp").hide();
            }
            if (currentCredits < totalCredits) {
                html.find(".cost-warning-credits").show().text(`Need ${totalCredits - currentCredits} more credits`);
            } else {
                html.find(".cost-warning-credits").hide();
            }
        } else {
            html.find(".cost-warning").hide();
        }
    }

    _calculateCosts() {
        let totalXP = 0;
        let totalCredits = 0;

        // Calculate stat costs
        for (const [statKey, increase] of Object.entries(this.pendingUpgrades.stats)) {
            if (increase > 0) {
                const currentValue = this.actor.system.stats[statKey]?.value || 0;
                // Each rank increase costs 5 + current rank
                for (let i = 0; i < increase; i++) {
                    totalXP += 5 + currentValue + i;
                }
            }
        }

        // Calculate skill costs
        for (const [skillId, data] of Object.entries(this.pendingUpgrades.skills)) {
            if (data.isNew) {
                // New skill at rank 1: 2 XP
                totalXP += 2;
            } else {
                const skill = this.actor.items.get(skillId);
                if (skill) {
                    const currentRank = parseInt(skill.system.rank) || 0;
                    const newRank = data.newRank;
                    if (newRank > currentRank) {
                        // Cost: 2 + (3 × current rank)
                        totalXP += 2 + (3 * currentRank);
                        // Rank 4 requires 500c (except for Ebb disciplines, but skills aren't disciplines)
                        if (newRank === 4) {
                            totalCredits += 500;
                        }
                    }
                }
            }
        }

        // Calculate discipline costs
        for (const [disciplineId, data] of Object.entries(this.pendingUpgrades.disciplines)) {
            if (data.isNew) {
                // New discipline at rank 1: 2 XP
                totalXP += 2;
            } else {
                const discipline = this.actor.items.get(disciplineId);
                if (discipline) {
                    const currentRank = parseInt(discipline.system.rank) || 0;
                    const newRank = data.newRank;
                    if (newRank > currentRank) {
                        // Cost: 2 + (3 × current rank)
                        totalXP += 2 + (3 * currentRank);
                        // Rank 4: Ebb disciplines cost 3 extra XP instead of 500c
                        if (newRank === 4) {
                            totalXP += 3; // Instead of 500c
                        }
                    }
                }
            }
        }

        return { totalXP, totalCredits };
    }

    async _commitChanges(html) {
        const input = html instanceof jQuery ? html : $(html);

        if (this.isGM) {
            // GM Mode: Simple XP change
            const xpChange = parseInt(input.find("input[name='xpChange']").val()) || 0;
            const reason = input.find("input[name='xpReason']").val() || "GM Adjustment";

            if (xpChange === 0) {
                ui.notifications.warn("No XP change specified.");
                return false;
            }

            const currentXP = this.actor.system.xp.value || 0;
            const newXP = Math.max(0, currentXP + xpChange);
            
            // Prevent XP from going below zero - adjust the change if needed
            const actualChange = newXP - currentXP;
            if (actualChange !== xpChange && xpChange < 0) {
                ui.notifications.warn(`XP cannot go below 0. Adjusted change from ${xpChange} to ${actualChange}.`);
            }

            // Add to ledger (use actual change, not requested change)
            const ledgerEntry = {
                timestamp: Date.now(),
                type: actualChange > 0 ? "add" : (actualChange < 0 ? "remove" : "none"),
                description: reason,
                xpChange: actualChange,
                creditChange: 0
            };

            const currentLedger = this.actor.system.xpLedger || [];
            await this.actor.update({
                "system.xp.value": newXP,
                "system.xpLedger": [...currentLedger, ledgerEntry]
            });

            if (actualChange !== 0) {
                ui.notifications.info(`${actualChange > 0 ? 'Added' : 'Removed'} ${Math.abs(actualChange)} XP. ${reason}`);
            }
            return true;
        } else {
            // Player Mode: Commit upgrades
            const { totalXP, totalCredits } = this._calculateCosts();

            if (totalXP === 0 && totalCredits === 0) {
                ui.notifications.warn("No upgrades selected.");
                return false;
            }

            const currentXP = this.actor.system.xp.value || 0;
            const currentCredits = this.actor.system.finance?.credits || 0;

            if (currentXP < totalXP || currentCredits < totalCredits) {
                ui.notifications.error("Insufficient XP or credits.");
                return false;
            }

            // Prepare updates
            const updates = {};
            const ledgerEntries = [];
            const itemUpdates = [];

            // Apply stat increases
            for (const [statKey, increase] of Object.entries(this.pendingUpgrades.stats)) {
                if (increase > 0) {
                    const currentValue = this.actor.system.stats[statKey]?.value || 0;
                    const newValue = currentValue + increase;
                    updates[`system.stats.${statKey}.value`] = newValue;

                    // Calculate XP cost for ledger
                    let statCost = 0;
                    for (let i = 0; i < increase; i++) {
                        statCost += 5 + currentValue + i;
                    }

                    ledgerEntries.push({
                        timestamp: Date.now(),
                        type: "stat",
                        description: `${CONFIG.SLA?.stats?.[statKey] || statKey.toUpperCase()} increased from ${currentValue} to ${newValue}`,
                        xpChange: -statCost,
                        creditChange: 0,
                        details: { stat: statKey, oldValue: currentValue, newValue: newValue }
                    });

                    // STR increase also increases HP by 1 per rank
                    if (statKey === 'str') {
                        const currentHP = this.actor.system.hp.value || 0;
                        const currentMaxHP = this.actor.system.hp.max || 0;
                        updates["system.hp.value"] = currentHP + increase;
                        updates["system.hp.max"] = currentMaxHP + increase;
                    }
                }
            }

            // Apply skill increases
            for (const [skillId, data] of Object.entries(this.pendingUpgrades.skills)) {
                if (data.isNew) {
                    // Create new skill - we'll need to handle this differently
                    // For now, we'll skip new skills created from compendium in this dialog
                    // The player should drag from compendium first
                    continue;
                } else {
                    const skill = this.actor.items.get(skillId);
                    if (skill) {
                        const currentRank = parseInt(skill.system.rank) || 0;
                        const newRank = data.newRank;
                        if (newRank > currentRank) {
                            const costXP = 2 + (3 * currentRank);
                            const costCredits = newRank === 4 ? 500 : 0;

                            itemUpdates.push({
                                item: skill,
                                update: { "system.rank": String(newRank) }
                            });

                            ledgerEntries.push({
                                timestamp: Date.now(),
                                type: "skill",
                                description: `${skill.name} increased from rank ${currentRank} to ${newRank}`,
                                xpChange: -costXP,
                                creditChange: -costCredits,
                                details: { skillId: skillId, skillName: skill.name, oldRank: currentRank, newRank: newRank }
                            });
                        }
                    }
                }
            }

            // Apply discipline increases
            for (const [disciplineId, data] of Object.entries(this.pendingUpgrades.disciplines)) {
                if (data.isNew) {
                    // Skip new disciplines - should be added from compendium first
                    continue;
                } else {
                    const discipline = this.actor.items.get(disciplineId);
                    if (discipline) {
                        const currentRank = parseInt(discipline.system.rank) || 0;
                        const newRank = data.newRank;
                        if (newRank > currentRank) {
                            const costXP = 2 + (3 * currentRank) + (newRank === 4 ? 3 : 0);

                            itemUpdates.push({
                                item: discipline,
                                update: { "system.rank": String(newRank) }
                            });

                            ledgerEntries.push({
                                timestamp: Date.now(),
                                type: "discipline",
                                description: `${discipline.name} increased from rank ${currentRank} to ${newRank}`,
                                xpChange: -costXP,
                                creditChange: 0,
                                details: { disciplineId: disciplineId, disciplineName: discipline.name, oldRank: currentRank, newRank: newRank }
                            });
                        }
                    }
                }
            }

            // Update XP and credits (ensure XP never goes below zero)
            const newXP = Math.max(0, currentXP - totalXP);
            if (newXP !== (currentXP - totalXP)) {
                ui.notifications.error("Cannot spend more XP than available. XP cannot go below zero.");
                return false;
            }
            updates["system.xp.value"] = newXP;
            if (totalCredits > 0) {
                updates["system.finance.credits"] = Math.max(0, currentCredits - totalCredits);
            }

            // Add ledger entries
            const currentLedger = this.actor.system.xpLedger || [];
            updates["system.xpLedger"] = [...currentLedger, ...ledgerEntries];

            // Apply all updates
            await this.actor.update(updates);

            // Update items
            for (const { item, update } of itemUpdates) {
                await item.update(update);
            }

            ui.notifications.info(`Upgrades committed! Spent ${totalXP} XP${totalCredits > 0 ? ` and ${totalCredits} credits` : ''}.`);
            return true;
        }
    }
}

