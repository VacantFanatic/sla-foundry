/**
 * E2E coverage for the damage/heal/wound-clear/armor-mitigation pipeline
 * (module/helpers/chat/damage.mjs). These functions write directly to real
 * actor/item documents (system.hp.value, system.resistance.value,
 * system.wounds.*) and were previously only unit-tested indirectly through
 * their pure sub-helpers (module/helpers/chat/pure.mjs) — nothing exercised
 * the actual `actor.update()`/`item.update()` writes against a real schema.
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem } = require('./fixtures');

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)');
};

test.describe('GM: damage/HP/wound/armor mutation pipeline (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('applyHpDamage writes the mitigated total to system.hp.value', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E HP Damage ${stamp}`, type: 'character', system: { hp: { value: 10, max: 10 } } }
            ]);
            const { applyHpDamage } = await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            const outcome = await applyHpDamage(actor, 7, 2);
            const persistedHp = actor.system.hp.value;
            await actor.delete();
            return { outcome, persistedHp };
        });
        expect(result.outcome.finalDamage).toBe(5);
        expect(result.outcome.hpData).toEqual({ old: 10, new: 5 });
        expect(result.persistedHp).toBe(5);
    });

    test('applyHpHeal writes healed total to system.hp.value, capped at max', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E HP Heal ${stamp}`, type: 'character', system: { hp: { value: 6, max: 10 } } }
            ]);
            const { applyHpHeal } = await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            const overheal = await applyHpHeal(actor, 20);
            const persistedHp = actor.system.hp.value;
            await actor.delete();
            return { overheal, persistedHp };
        });
        expect(result.overheal.finalHeal).toBe(4);
        expect(result.persistedHp).toBe(10);
    });

    test('computeArmorMitigation degrades equipped armor resistance and halves PV below half-max', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Armor Mit ${stamp}`, type: 'character' }]);
            const [armor] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Armor ${stamp}`,
                    type: 'armor',
                    system: { pv: 6, equipped: true, resistance: { value: 4, max: 10 } }
                }
            ]);

            const { computeArmorMitigation } = await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            const mitigation = await computeArmorMitigation(actor, 1, 0);

            const persistedResistance = actor.items.get(armor.id).system.resistance.value;
            await actor.delete();
            return { mitigation, persistedResistance };
        });

        // resistance 4 - ad 1 = 3, which is < max/2 (5) -> effectivePV = floor(6/2) = 3
        expect(result.mitigation.targetPV).toBe(6);
        expect(result.mitigation.effectivePV).toBe(3);
        expect(result.mitigation.armorData.new).toBe(3);
        expect(result.persistedResistance).toBe(3);
    });

    test('computeArmorMitigation zeroes effective PV once resistance is destroyed', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Armor Destroyed ${stamp}`, type: 'character' }]);
            await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Armor ${stamp}`,
                    type: 'armor',
                    system: { pv: 6, equipped: true, resistance: { value: 2, max: 10 } }
                }
            ]);

            const { computeArmorMitigation } = await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            const mitigation = await computeArmorMitigation(actor, 5, 0);
            await actor.delete();
            return mitigation;
        });

        expect(result.armorData.new).toBe(0);
        expect(result.effectivePV).toBe(0);
    });

    test('computeArmorMitigation applies the ammo PV modifier before degradation', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Armor PvMod ${stamp}`, type: 'character' }]);
            await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Armor ${stamp}`,
                    type: 'armor',
                    system: { pv: 6, equipped: true, resistance: { value: 10, max: 10 } }
                }
            ]);

            const { computeArmorMitigation } = await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            // AP ammo: pvMod -2, no AD so resistance is untouched.
            const mitigation = await computeArmorMitigation(actor, 0, -2);
            await actor.delete();
            return mitigation;
        });

        expect(result.targetPV).toBe(4);
        expect(result.rawPv).toBe(6);
        expect(result.effectivePV).toBe(4);
    });

    test('applyDamageToVictim runs the full armor-mitigation -> HP-write pipeline', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E Full Damage ${stamp}`, type: 'character', system: { hp: { value: 10, max: 10 } } }
            ]);
            const [armor] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Armor ${stamp}`,
                    type: 'armor',
                    system: { pv: 6, equipped: true, resistance: { value: 10, max: 10 } }
                }
            ]);

            const { applyDamageToVictim } = await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            await applyDamageToVictim(actor, 10, 3, 0, null);

            const persistedHp = actor.system.hp.value;
            const persistedResistance = actor.items.get(armor.id).system.resistance.value;
            await actor.delete();
            return { persistedHp, persistedResistance };
        });

        // resistance 10 - ad 3 = 7 (still >= max/2) -> effectivePV stays 6 -> damage = max(0, 10 - 6) = 4 -> hp 10-4=6
        expect(result.persistedResistance).toBe(7);
        expect(result.persistedHp).toBe(6);
    });

    test('clearNWoundsOnActor clears wounds in head -> torso -> limb order and persists the write', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Wound Clear ${stamp}`,
                    type: 'character',
                    system: { wounds: { head: true, torso: true, lArm: false, rArm: false, lLeg: false, rLeg: false } }
                }
            ]);

            const { clearNWoundsOnActor } = await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            const cleared = await clearNWoundsOnActor(actor, 1);

            const wounds = { head: actor.system.wounds.head, torso: actor.system.wounds.torso };
            await actor.delete();
            return { cleared, wounds };
        });

        expect(result.cleared).toBe(1);
        expect(result.wounds).toEqual({ head: false, torso: true });
    });

    test('applyEbbOutcomeToActor combines a heal with wound clearing in one call', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Ebb Heal+Wound ${stamp}`,
                    type: 'character',
                    system: { hp: { value: 5, max: 10 }, wounds: { head: true } }
                }
            ]);

            const { applyEbbOutcomeToActor } = await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            await applyEbbOutcomeToActor(actor, 3, 0, { isHeal: true, removeWoundsCount: 1, pvMod: 0, ammoName: null });

            const persisted = { hp: actor.system.hp.value, headWound: actor.system.wounds.head };
            await actor.delete();
            return persisted;
        });

        expect(result.hp).toBe(8);
        expect(result.headWound).toBe(false);
    });

    test('onApplyDamage reads dmg/ad/pv-mod/target-uuid off the button and applies real mitigation+HP writes', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [caster] = await Actor.createDocuments([{ name: `E2E Caster ${stamp}`, type: 'character' }]);
            const [victim] = await Actor.createDocuments([
                { name: `E2E Victim ${stamp}`, type: 'character', system: { hp: { value: 10, max: 10 } } }
            ]);
            await victim.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Armor ${stamp}`,
                    type: 'armor',
                    system: { pv: 6, equipped: true, resistance: { value: 10, max: 10 } }
                }
            ]);

            const message = await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: caster }),
                content: '<div class="sla-chat-card"></div>',
                flags: { sla: { ammoName: null, ebbTarget: 'enemy' } }
            });

            const card = document.createElement('div');
            card.className = 'sla-chat-card';
            card.dataset.actorUuid = caster.uuid;

            const messageWrapper = document.createElement('div');
            messageWrapper.className = 'message';
            messageWrapper.dataset.messageId = message.id;
            messageWrapper.appendChild(card);

            const applyBtn = document.createElement('button');
            applyBtn.dataset.dmg = '10';
            applyBtn.dataset.ad = '3';
            applyBtn.dataset.pvMod = '0';
            applyBtn.dataset.target = 'target';
            applyBtn.dataset.targetUuid = victim.uuid;
            card.appendChild(applyBtn);

            const { onApplyDamage } = await import('/systems/sla-industries/module/helpers/chat/handlers.mjs');
            await onApplyDamage({ preventDefault: () => {}, currentTarget: applyBtn });

            const persistedHp = victim.system.hp.value;
            await message.delete();
            await caster.delete();
            await victim.delete();
            return { persistedHp };
        });

        // Same math as the full-pipeline test above: resistance 10-3=7 (>=half) -> effectivePV 6 -> damage 4 -> hp 6.
        expect(result.persistedHp).toBe(6);
    });

    test("onApplyEbbEffects copies the Ebb formula item's embedded Active Effects onto the target", async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [caster] = await Actor.createDocuments([{ name: `E2E Ebb Caster ${stamp}`, type: 'character' }]);
            const [victim] = await Actor.createDocuments([
                {
                    name: `E2E Ebb Victim ${stamp}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            const [formula] = await Item.createDocuments([{ name: `E2E Ebb Formula ${stamp}`, type: 'ebbFormula' }]);
            await formula.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'E2E Ebb Str Boost',
                    disabled: false,
                    changes: [{ key: 'system.stats.str.bonus', type: CONST.ACTIVE_EFFECT_CHANGE_TYPES.ADD, value: 2 }]
                }
            ]);

            const message = await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: caster }),
                content: '<div class="sla-chat-card"></div>',
                flags: { sla: { ebbRollSuccess: true, ebbHasEffects: true, itemUuid: formula.uuid } }
            });

            const card = document.createElement('div');
            card.className = 'sla-chat-card';
            card.dataset.actorUuid = caster.uuid;

            const messageWrapper = document.createElement('div');
            messageWrapper.className = 'message';
            messageWrapper.dataset.messageId = message.id;
            messageWrapper.appendChild(card);

            const applyBtn = document.createElement('button');
            applyBtn.dataset.target = 'target';
            applyBtn.setAttribute('data-target-uuid', victim.uuid);
            card.appendChild(applyBtn);

            const { onApplyEbbEffects } = await import('/systems/sla-industries/module/helpers/chat/handlers.mjs');
            await onApplyEbbEffects({ preventDefault: () => {}, currentTarget: applyBtn });

            const strTotal = (actor) => actor.system.stats.str.total;
            const persistedStrTotal = strTotal(game.actors.get(victim.id));

            await message.delete();
            await formula.delete();
            await caster.delete();
            await victim.delete();
            return { persistedStrTotal };
        });

        expect(result.persistedStrTotal).toBe(5);
    });

    test('onRemoveEbbWounds resolves the victim from flags.sla.targets and clears the requested count', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [caster] = await Actor.createDocuments([{ name: `E2E Wound Caster ${stamp}`, type: 'character' }]);
            const [victim] = await Actor.createDocuments([
                {
                    name: `E2E Wound Victim ${stamp}`,
                    type: 'character',
                    system: { wounds: { head: true, torso: true } }
                }
            ]);

            const message = await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: caster }),
                content: '<div class="sla-chat-card"></div>',
                flags: {
                    sla: {
                        actorUuid: caster.uuid,
                        ebbTarget: 'enemy',
                        targets: [victim.uuid],
                        ebbRemoveWoundsCount: 1
                    }
                }
            });

            const card = document.createElement('div');
            card.className = 'sla-chat-card';
            card.dataset.actorUuid = caster.uuid;

            const messageWrapper = document.createElement('div');
            messageWrapper.className = 'message';
            messageWrapper.dataset.messageId = message.id;
            messageWrapper.appendChild(card);

            const removeBtn = document.createElement('button');
            card.appendChild(removeBtn);

            const { onRemoveEbbWounds } = await import('/systems/sla-industries/module/helpers/chat/handlers.mjs');
            await onRemoveEbbWounds({ preventDefault: () => {}, currentTarget: removeBtn });

            const fresh = game.actors.get(victim.id);
            const wounds = { head: fresh.system.wounds.head, torso: fresh.system.wounds.torso };

            await message.delete();
            await caster.delete();
            await victim.delete();
            return wounds;
        });

        // WOUND_CLEAR_ORDER clears head first.
        expect(result).toEqual({ head: false, torso: true });
    });
});
