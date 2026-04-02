/**
 * Experience Points dialog (Application V2).
 * - GM Mode: Add/remove XP directly
 * - Player Mode: Purchase stat/skill/discipline upgrades
 */
const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export class XPDialog extends HandlebarsApplicationMixin(ApplicationV2) {

    /** @override */
    static PARTS = {
        body: {
            template: "systems/sla-industries/templates/dialogs/xp-dialog.hbs",
            scrollable: [""]
        }
    };

    static async xpCommit() {
        const ok = await this._commitChanges(this.element);
        if (ok !== false) this.close();
    }

    static async xpCancel() {
        this.close();
    }

    /** @override */
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
        tag: "div",
        classes: ["sla-dialog", "sla-sheet", "xp-dialog-window"],
        actions: {
            xpCommit: XPDialog.xpCommit,
            xpCancel: XPDialog.xpCancel
        }
    }, { inplace: false });

    /** @type {AbortController | null} */
    #uiAbort = null;

    /**
     * @param {Actor} actor
     * @param {object} appOptions — passed to ApplicationV2 super (window, position, etc.)
     * @param {object} templateData — merged into {@link XPDialog._prepareContext}
     */
    constructor(actor, appOptions, templateData) {
        super(appOptions);
        this.actor = actor;
        this.pendingUpgrades = {
            stats: {},
            skills: {},
            disciplines: {}
        };
        this.isGM = game.user.isGM;
        this._templateData = templateData;
    }

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        return foundry.utils.mergeObject(context, this._templateData);
    }

    /** @override */
    async _onClose(options) {
        this.#uiAbort?.abort();
        this.#uiAbort = null;
        return super._onClose(options);
    }

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);
        this.#uiAbort?.abort();
        this.#uiAbort = new AbortController();
        const { signal } = this.#uiAbort;
        const el = this.element;

        if (this.isGM) {
            for (const name of ["xpChange", "xpReason"]) {
                el.querySelector(`input[name='${name}']`)?.addEventListener("keydown", (ev) => {
                    if (ev.key === "Enter") {
                        ev.preventDefault();
                        el.querySelector("[data-action='xpCommit']")?.click();
                    }
                }, { signal });
            }
        } else {
            el.addEventListener("click", (ev) => {
                const inc = ev.target.closest("button[data-action='increase-stat']");
                if (inc) {
                    ev.preventDefault();
                    this._increaseStat({ currentTarget: inc });
                    return;
                }
                const dec = ev.target.closest("button[data-action='decrease-stat']");
                if (dec) {
                    ev.preventDefault();
                    this._decreaseStat({ currentTarget: dec });
                    return;
                }
                const rem = ev.target.closest("button[data-action='remove-upgrade']");
                if (rem) {
                    ev.preventDefault();
                    this._removeUpgrade({ currentTarget: rem });
                }
            }, { signal });

            el.addEventListener("change", (ev) => {
                const sel = ev.target;
                if (!(sel instanceof HTMLSelectElement)) return;
                if (sel.name === "skill-upgrade") this._selectSkillUpgrade(ev);
                else if (sel.name === "discipline-upgrade") this._selectDisciplineUpgrade(ev);
                else if (sel.name === "new-skill") this._selectNewSkill(ev);
                else if (sel.name === "new-discipline") this._selectNewDiscipline(ev);
            }, { signal });
        }

        this._updateCosts(el);
    }

    /**
     * Factory method to create and render the dialog.
     */
    static async create(actor) {
        const isGM = game.user.isGM;
        const currentXP = actor.system.xp.value || 0;
        const currentCredits = actor.system.finance?.credits || 0;

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

        const skillCompendium = game.packs.get("sla-industries.skills");
        const availableSkills = skillCompendium ? (await skillCompendium.getDocuments()).sort((a, b) => a.name.localeCompare(b.name)) : [];

        const disciplineCompendium = game.packs.get("sla-industries.disciplines");
        const availableDisciplines = disciplineCompendium ? (await disciplineCompendium.getDocuments()).sort((a, b) => a.name.localeCompare(b.name)) : [];

        const ledger = actor.system.xpLedger || [];
        const ledgerEntries = ledger
            .slice()
            .reverse()
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

        const dlg = new XPDialog(actor, {
            window: { title: isGM ? "Manage Experience Points" : "Spend Experience Points" },
            position: { width: 650, height: isGM ? 500 : 650 },
            classes: ["sla-dialog", "sla-sheet", "xp-dialog-window"]
        }, templateData);

        await dlg.render(true);
        return dlg;
    }

    _increaseStat(event) {
        const statKey = event.currentTarget.dataset.stat;
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
            this.pendingUpgrades.skills[skillId] = { newRank: 1, isNew: true };
        }
        this._refreshUI();
    }

    _selectNewDiscipline(event) {
        const select = event.currentTarget;
        const disciplineId = select.value;
        if (disciplineId) {
            this.pendingUpgrades.disciplines[disciplineId] = { newRank: 1, isNew: true };
        }
        this._refreshUI();
    }

    _removeUpgrade(event) {
        const type = event.currentTarget.dataset.type;
        const id = event.currentTarget.dataset.id;
        const root = this.element;

        if (type === 'stat') {
            delete this.pendingUpgrades.stats[id];
        } else if (type === 'skill') {
            delete this.pendingUpgrades.skills[id];
            const sel = root.querySelector(`select[name='skill-upgrade'][data-skill-id='${id}']`);
            if (sel) sel.value = '';
        } else if (type === 'discipline') {
            delete this.pendingUpgrades.disciplines[id];
            const sel = root.querySelector(`select[name='discipline-upgrade'][data-discipline-id='${id}']`);
            if (sel) sel.value = '';
        }
        this._refreshUI();
    }

    _refreshUI() {
        const root = this.element;
        this._updatePendingUpgrades(root);
        this._updateCosts(root);
    }

    /**
     * @param {HTMLElement} root
     */
    _updatePendingUpgrades(root) {
        for (const [statKey, increase] of Object.entries(this.pendingUpgrades.stats)) {
            if (increase > 0) {
                const statDisplay = root.querySelector(`.pending-stat-${statKey}`);
                if (statDisplay) statDisplay.style.display = "";
                const val = statDisplay?.querySelector(".pending-stat-value");
                if (val) val.textContent = String(increase);
                const decBtn = root.querySelector(`button[data-action='decrease-stat'][data-stat='${statKey}']`);
                if (decBtn) decBtn.disabled = false;
            } else {
                const statDisplay = root.querySelector(`.pending-stat-${statKey}`);
                if (statDisplay) statDisplay.style.display = "none";
                const decBtn = root.querySelector(`button[data-action='decrease-stat'][data-stat='${statKey}']`);
                if (decBtn) decBtn.disabled = true;
            }
        }
    }

    /**
     * @param {HTMLElement} root
     */
    _updateCosts(root) {
        if (this.isGM) return;

        const { totalXP, totalCredits } = this._calculateCosts();
        const xpEl = root.querySelector(".total-cost-xp");
        const crEl = root.querySelector(".total-cost-credits");
        if (xpEl) xpEl.textContent = String(totalXP);
        if (crEl) crEl.textContent = String(totalCredits);

        const currentXP = this.actor.system.xp.value || 0;
        const currentCredits = this.actor.system.finance?.credits || 0;

        const canAfford = currentXP >= totalXP && currentCredits >= totalCredits;
        const commitBtn = root.querySelector("[data-action='xpCommit']");
        if (commitBtn) commitBtn.disabled = !canAfford;

        const warn = root.querySelector(".cost-warning");
        const warnXp = root.querySelector(".cost-warning-xp");
        const warnCr = root.querySelector(".cost-warning-credits");

        if (!canAfford) {
            if (warn) warn.style.display = "";
            if (currentXP < totalXP) {
                if (warnXp) {
                    warnXp.style.display = "";
                    warnXp.textContent = `Need ${totalXP - currentXP} more XP`;
                }
            } else if (warnXp) warnXp.style.display = "none";

            if (currentCredits < totalCredits) {
                if (warnCr) {
                    warnCr.style.display = "";
                    warnCr.textContent = `Need ${totalCredits - currentCredits} more credits`;
                }
            } else if (warnCr) warnCr.style.display = "none";
        } else {
            if (warn) warn.style.display = "none";
        }
    }

    _calculateCosts() {
        let totalXP = 0;
        let totalCredits = 0;

        for (const [statKey, increase] of Object.entries(this.pendingUpgrades.stats)) {
            if (increase > 0) {
                const currentValue = this.actor.system.stats[statKey]?.value || 0;
                for (let i = 0; i < increase; i++) {
                    totalXP += 5 + currentValue + i;
                }
            }
        }

        for (const [skillId, data] of Object.entries(this.pendingUpgrades.skills)) {
            if (data.isNew) {
                totalXP += 2;
            } else {
                const skill = this.actor.items.get(skillId);
                if (skill) {
                    const currentRank = parseInt(skill.system.rank) || 0;
                    const newRank = data.newRank;
                    if (newRank > currentRank) {
                        totalXP += 2 + (3 * currentRank);
                        if (newRank === 4) {
                            totalCredits += 500;
                        }
                    }
                }
            }
        }

        for (const [disciplineId, data] of Object.entries(this.pendingUpgrades.disciplines)) {
            if (data.isNew) {
                totalXP += 2;
            } else {
                const discipline = this.actor.items.get(disciplineId);
                if (discipline) {
                    const currentRank = parseInt(discipline.system.rank) || 0;
                    const newRank = data.newRank;
                    if (newRank > currentRank) {
                        totalXP += 2 + (3 * currentRank);
                        if (newRank === 4) {
                            totalXP += 3;
                        }
                    }
                }
            }
        }

        return { totalXP, totalCredits };
    }

    /**
     * @param {HTMLElement} root
     */
    async _commitChanges(root) {
        if (this.isGM) {
            const xpChange = parseInt(root.querySelector("input[name='xpChange']")?.value) || 0;
            const reason = root.querySelector("input[name='xpReason']")?.value || "GM Adjustment";

            if (xpChange === 0) {
                ui.notifications.warn("No XP change specified.");
                return false;
            }

            const currentXP = this.actor.system.xp.value || 0;
            const newXP = Math.max(0, currentXP + xpChange);

            const actualChange = newXP - currentXP;
            if (actualChange !== xpChange && xpChange < 0) {
                ui.notifications.warn(`XP cannot go below 0. Adjusted change from ${xpChange} to ${actualChange}.`);
            }

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
        }

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

        const updates = {};
        const ledgerEntries = [];
        const itemUpdates = [];

        for (const [statKey, increase] of Object.entries(this.pendingUpgrades.stats)) {
            if (increase > 0) {
                const currentValue = this.actor.system.stats[statKey]?.value || 0;
                const newValue = currentValue + increase;
                updates[`system.stats.${statKey}.value`] = newValue;

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

                if (statKey === 'str') {
                    const currentHP = this.actor.system.hp.value || 0;
                    const currentMaxHP = this.actor.system.hp.max || 0;
                    updates["system.hp.value"] = currentHP + increase;
                    updates["system.hp.max"] = currentMaxHP + increase;
                }
            }
        }

        for (const [skillId, data] of Object.entries(this.pendingUpgrades.skills)) {
            if (data.isNew) {
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

        for (const [disciplineId, data] of Object.entries(this.pendingUpgrades.disciplines)) {
            if (data.isNew) {
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

        const newXP = Math.max(0, currentXP - totalXP);
        if (newXP !== (currentXP - totalXP)) {
            ui.notifications.error("Cannot spend more XP than available. XP cannot go below zero.");
            return false;
        }
        updates["system.xp.value"] = newXP;
        if (totalCredits > 0) {
            updates["system.finance.credits"] = Math.max(0, currentCredits - totalCredits);
        }

        const currentLedger = this.actor.system.xpLedger || [];
        updates["system.xpLedger"] = [...currentLedger, ...ledgerEntries];

        await this.actor.update(updates);

        for (const { item, update } of itemUpdates) {
            await item.update(update);
        }

        ui.notifications.info(`Upgrades committed! Spent ${totalXP} XP${totalCredits > 0 ? ` and ${totalCredits} credits` : ''}.`);
        return true;
    }
}
