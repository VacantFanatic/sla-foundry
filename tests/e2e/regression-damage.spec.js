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

test.describe.configure({ timeout: 60_000 });

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
            // type: 'npc' — a character's hp.max is always recomputed from species+STR in derived
            // data (see resolveDerivedHpMax), so an authored max only sticks on a GM-authored NPC.
            const [actor] = await Actor.createDocuments([
                { name: `E2E HP Heal ${stamp}`, type: 'npc', system: { hp: { value: 6, max: 10 } } }
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
        expect(result.mitigation.armorData).toHaveLength(1);
        expect(result.mitigation.armorData[0].new).toBe(3);
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

        expect(result.armorData).toHaveLength(1);
        expect(result.armorData[0].new).toBe(0);
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

    test('computeArmorMitigation ignores an equipped shield when shieldCraftSuccess is false', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Shield NoRoll ${stamp}`, type: 'character' }]);
            const [shield] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Shield ${stamp}`,
                    type: 'armor',
                    system: {
                        isShield: true,
                        pvMelee: 2,
                        pvRanged: 2,
                        equipped: true,
                        resistance: { value: 12, max: 12 }
                    }
                }
            ]);

            const { computeArmorMitigation } = await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            // shieldCraftSuccess omitted -> defaults false: the shield is equipped but must not mitigate.
            const mitigation = await computeArmorMitigation(actor, 3, 0, 'melee');

            const persistedResistance = actor.items.get(shield.id).system.resistance.value;
            await actor.delete();
            return { mitigation, persistedResistance };
        });

        expect(result.mitigation.effectivePV).toBe(0);
        expect(result.mitigation.armorData).toBeNull();
        // Not touched at all -- the shield never even entered the mitigation.
        expect(result.persistedResistance).toBe(12);
    });

    test('computeArmorMitigation bypasses body armor and shield entirely when ignorePV is true', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E IgnorePV ${stamp}`, type: 'character' }]);
            const [armor, shield] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Body Armor ${stamp}`,
                    type: 'armor',
                    system: { pv: 6, equipped: true, isShield: false, resistance: { value: 10, max: 10 } }
                },
                {
                    name: `E2E Shield ${stamp}`,
                    type: 'armor',
                    system: {
                        isShield: true,
                        pvMelee: 3,
                        pvRanged: 3,
                        equipped: true,
                        resistance: { value: 12, max: 12 }
                    }
                }
            ]);

            const { computeArmorMitigation } = await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            // Shield Craft succeeded AND ignorePV is true -- ignorePV must still win: no armor,
            // no shield, no resistance degradation at all.
            const mitigation = await computeArmorMitigation(actor, 5, 0, 'melee', true, true);

            const armorRes = actor.items.get(armor.id).system.resistance.value;
            const shieldRes = actor.items.get(shield.id).system.resistance.value;
            await actor.delete();
            return { mitigation, armorRes, shieldRes };
        });

        expect(result.mitigation).toEqual({ targetPV: 0, rawPv: 0, effectivePV: 0, armorData: null });
        expect(result.armorRes).toBe(10);
        expect(result.shieldRes).toBe(12);
    });

    test('computeArmorMitigation stacks shield PV additively on top of body armor when the roll succeeds', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Shield Stack ${stamp}`, type: 'character' }]);
            await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Body Armor ${stamp}`,
                    type: 'armor',
                    system: { pv: 4, equipped: true, isShield: false, resistance: { value: 10, max: 10 } }
                },
                {
                    name: `E2E Breacher Shield ${stamp}`,
                    type: 'armor',
                    system: {
                        isShield: true,
                        pvMelee: 2,
                        pvRanged: 2,
                        equipped: true,
                        resistance: { value: 12, max: 12 }
                    }
                }
            ]);

            const { computeArmorMitigation } = await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            // No AD this hit, so neither item's resistance degrades -- pure additive-stacking check.
            const mitigation = await computeArmorMitigation(actor, 0, 0, 'melee', true);
            await actor.delete();
            return mitigation;
        });

        // Body armor 4 (max-PV loop, shield excluded from it) + shield's melee PV 2 = 6.
        expect(result.targetPV).toBe(4);
        expect(result.effectivePV).toBe(6);
    });

    test('computeArmorMitigation routes all AD to an active shield, leaving body armor resistance untouched', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E Shield Independent ${stamp}`, type: 'character' }
            ]);
            const [armor, shield] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Body Armor ${stamp}`,
                    type: 'armor',
                    system: { pv: 4, equipped: true, isShield: false, resistance: { value: 10, max: 10 } }
                },
                {
                    name: `E2E Breacher Shield ${stamp}`,
                    type: 'armor',
                    system: {
                        isShield: true,
                        pvMelee: 2,
                        pvRanged: 2,
                        equipped: true,
                        resistance: { value: 3, max: 12 }
                    }
                }
            ]);

            const { computeArmorMitigation } = await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            const mitigation = await computeArmorMitigation(actor, 5, 0, 'melee', true);

            const armorRes = actor.items.get(armor.id).system.resistance.value;
            const shieldRes = actor.items.get(shield.id).system.resistance.value;
            await actor.delete();
            return { mitigation, armorRes, shieldRes };
        });

        // Per the tabletop rule, all 5 AD goes to the shield (3 - 5 clamped to 0, destroyed,
        // contributes 0 PV); body armor's own resistance is never touched while the shield is
        // actively blocking, so it stays at 10 and its PV (4) still counts toward the total.
        expect(result.armorRes).toBe(10);
        expect(result.shieldRes).toBe(0);
        expect(result.mitigation.effectivePV).toBe(4);
        expect(result.mitigation.armorData).toHaveLength(1);
        expect(result.mitigation.armorData[0].kind).toBe('shield');
        expect(result.mitigation.armorData[0].effectivePV).toBe(0);
        expect(result.mitigation.armorData[0].new).toBe(0);
    });

    test('computeArmorMitigation still routes AD to body armor when no shield is actively blocking', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E No Active Shield ${stamp}`, type: 'character' }]);
            const [armor] = await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Body Armor ${stamp}`,
                    type: 'armor',
                    system: { pv: 4, equipped: true, isShield: false, resistance: { value: 10, max: 10 } }
                },
                {
                    name: `E2E Idle Shield ${stamp}`,
                    type: 'armor',
                    system: {
                        isShield: true,
                        pvMelee: 2,
                        pvRanged: 2,
                        equipped: true,
                        resistance: { value: 12, max: 12 }
                    }
                }
            ]);

            const { computeArmorMitigation } = await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            // shieldCraftSuccess: false -- the shield is equipped but didn't block this hit, so
            // this is the pre-shield-feature regression path: AD hits body armor as always.
            const mitigation = await computeArmorMitigation(actor, 5, 0, 'melee', false);

            const armorRes = actor.items.get(armor.id).system.resistance.value;
            await actor.delete();
            return { mitigation, armorRes };
        });

        expect(result.armorRes).toBe(5);
        expect(result.mitigation.armorData).toHaveLength(1);
        expect(result.mitigation.armorData[0].kind).toBe('armor');
    });

    test('computeArmorMitigation selects the shield PV matching the attacking weapon type', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E Shield AttackType ${stamp}`, type: 'character' }
            ]);
            await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Advanced Shield ${stamp}`,
                    type: 'armor',
                    system: {
                        isShield: true,
                        pvMelee: 2,
                        pvRanged: 4,
                        equipped: true,
                        resistance: { value: 16, max: 16 }
                    }
                }
            ]);

            const { computeArmorMitigation } = await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            const meleeHit = await computeArmorMitigation(actor, 0, 0, 'melee', true);
            const rangedHit = await computeArmorMitigation(actor, 0, 0, 'ranged', true);
            await actor.delete();
            return { meleeHit, rangedHit };
        });

        expect(result.meleeHit.effectivePV).toBe(2);
        expect(result.rangedHit.effectivePV).toBe(4);
    });

    test('applyDamageToVictim renders only the shield row (not body armor) and the correct total PV Reduction when the shield blocks', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E Shield ChatRender ${stamp}`, type: 'character', system: { hp: { value: 10, max: 10 } } }
            ]);
            await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Body Armor ${stamp}`,
                    type: 'armor',
                    system: { pv: 4, equipped: true, isShield: false, resistance: { value: 10, max: 10 } }
                },
                {
                    name: `E2E Breacher Shield ${stamp}`,
                    type: 'armor',
                    system: {
                        isShield: true,
                        pvMelee: 2,
                        pvRanged: 2,
                        equipped: true,
                        resistance: { value: 12, max: 12 }
                    }
                }
            ]);

            const beforeIds = new Set(game.messages.map((m) => m.id));
            const { applyDamageToVictim } = await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            await applyDamageToVictim(actor, 10, 3, 0, null, 'melee', true);
            const newMessage = game.messages.find((m) => !beforeIds.has(m.id));
            const content = newMessage?.content ?? '';

            await newMessage?.delete();
            await actor.delete();
            return { content };
        });

        // All AD (3) routed to the shield: resistance 12-3=9 (still full PV 2). Body armor's
        // own resistance is untouched, so it gets no row -- only its PV (4) still counts toward
        // the combined total shown in "PV Reduction" (4 + 2 = 6).
        expect(result.content).not.toContain('damage-armor--armor');
        expect(result.content).toContain('damage-armor--shield');
        expect(result.content).toMatch(/PV Reduction:<\/span>\s*<strong>-6<\/strong>/);
    });

    test('applyDamageToVictim renders the body-armor row when no shield is actively blocking', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Armor Only ChatRender ${stamp}`,
                    type: 'character',
                    system: { hp: { value: 10, max: 10 } }
                }
            ]);
            await actor.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Body Armor ${stamp}`,
                    type: 'armor',
                    system: { pv: 4, equipped: true, isShield: false, resistance: { value: 10, max: 10 } }
                }
            ]);

            const beforeIds = new Set(game.messages.map((m) => m.id));
            const { applyDamageToVictim } = await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            await applyDamageToVictim(actor, 10, 3, 0, null, 'melee', false);
            const newMessage = game.messages.find((m) => !beforeIds.has(m.id));
            const content = newMessage?.content ?? '';

            await newMessage?.delete();
            await actor.delete();
            return { content };
        });

        expect(result.content).toContain('damage-armor--armor');
        expect(result.content).not.toContain('damage-armor--shield');
        expect(result.content).toMatch(/PV Reduction:<\/span>\s*<strong>-4<\/strong>/);
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

        expect(result.cleared).toEqual({ clearedCount: 1, clearedKeys: ['head'] });
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

    test('onApplyDamage reads the live "Shield Craft Succeeded" checkbox and gates the shield accordingly', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [victim] = await Actor.createDocuments([
                {
                    name: `E2E Shield Checkbox Victim ${stamp}`,
                    type: 'character',
                    system: { hp: { value: 10, max: 10 } }
                }
            ]);
            await victim.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Shield ${stamp}`,
                    type: 'armor',
                    system: {
                        isShield: true,
                        pvMelee: 5,
                        pvRanged: 5,
                        equipped: true,
                        resistance: { value: 12, max: 12 }
                    }
                }
            ]);

            // Use the self-target Ebb path (`ebbTarget: 'self'`) rather than the target-uuid
            // path: onApplyDamage resolves a self target straight from the card's actor-uuid,
            // side-stepping resolveActorFromUuid's Token-only uuid resolution (that path expects
            // a Token uuid, not a bare Actor uuid, and isn't what this test needs to exercise).
            const buildCard = async (checked) => {
                const message = await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: victim }),
                    content: '<div class="sla-chat-card"></div>',
                    flags: { sla: { ammoName: null, ebbTarget: 'self' } }
                });
                const card = document.createElement('div');
                card.className = 'sla-chat-card';
                card.dataset.actorUuid = victim.uuid;

                const messageWrapper = document.createElement('div');
                messageWrapper.className = 'message';
                messageWrapper.dataset.messageId = message.id;
                messageWrapper.appendChild(card);

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'shield-craft-success';
                checkbox.checked = checked;
                card.appendChild(checkbox);

                const applyBtn = document.createElement('button');
                applyBtn.dataset.dmg = '10';
                applyBtn.dataset.ad = '0';
                applyBtn.dataset.pvMod = '0';
                applyBtn.dataset.ebbTarget = 'self';
                card.appendChild(applyBtn);

                return { message, applyBtn };
            };

            const { onApplyDamage } = await import('/systems/sla-industries/module/helpers/chat/handlers.mjs');

            // Unchecked: the equipped shield must not mitigate.
            const unchecked = await buildCard(false);
            await onApplyDamage({ preventDefault: () => {}, currentTarget: unchecked.applyBtn });
            const hpAfterUnchecked = victim.system.hp.value;
            await unchecked.message.delete();

            await victim.update({ 'system.hp.value': 10 });

            // Checked: the shield must mitigate.
            const checked = await buildCard(true);
            await onApplyDamage({ preventDefault: () => {}, currentTarget: checked.applyBtn });
            const hpAfterChecked = victim.system.hp.value;
            await checked.message.delete();

            await victim.delete();
            return { hpAfterUnchecked, hpAfterChecked };
        });

        expect(result.hpAfterUnchecked).toBe(0); // 10 raw damage, no mitigation at all.
        expect(result.hpAfterChecked).toBe(5); // 10 raw damage - 5 shield PV.
    });

    test('onApplyDamage reads the live "Ignore Armor PV" checkbox and bypasses body armor accordingly', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [victim] = await Actor.createDocuments([
                {
                    name: `E2E IgnorePV Checkbox Victim ${stamp}`,
                    type: 'character',
                    system: { hp: { value: 10, max: 10 } }
                }
            ]);
            await victim.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Body Armor ${stamp}`,
                    type: 'armor',
                    system: { pv: 6, equipped: true, isShield: false, resistance: { value: 10, max: 10 } }
                }
            ]);

            // Same self-target Ebb path as the Shield Craft checkbox test above.
            const buildCard = async (checked) => {
                const message = await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: victim }),
                    content: '<div class="sla-chat-card"></div>',
                    flags: { sla: { ammoName: null, ebbTarget: 'self' } }
                });
                const card = document.createElement('div');
                card.className = 'sla-chat-card';
                card.dataset.actorUuid = victim.uuid;

                const messageWrapper = document.createElement('div');
                messageWrapper.className = 'message';
                messageWrapper.dataset.messageId = message.id;
                messageWrapper.appendChild(card);

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'ignore-armor-pv';
                checkbox.checked = checked;
                card.appendChild(checkbox);

                const applyBtn = document.createElement('button');
                applyBtn.dataset.dmg = '10';
                applyBtn.dataset.ad = '0';
                applyBtn.dataset.pvMod = '0';
                applyBtn.dataset.ebbTarget = 'self';
                card.appendChild(applyBtn);

                return { message, applyBtn };
            };

            const { onApplyDamage } = await import('/systems/sla-industries/module/helpers/chat/handlers.mjs');

            // Unchecked: the equipped body armor must mitigate as normal.
            const unchecked = await buildCard(false);
            await onApplyDamage({ preventDefault: () => {}, currentTarget: unchecked.applyBtn });
            const hpAfterUnchecked = victim.system.hp.value;
            await unchecked.message.delete();

            await victim.update({ 'system.hp.value': 10 });

            // Checked: armor must be bypassed entirely.
            const checked = await buildCard(true);
            await onApplyDamage({ preventDefault: () => {}, currentTarget: checked.applyBtn });
            const hpAfterChecked = victim.system.hp.value;
            await checked.message.delete();

            await victim.delete();
            return { hpAfterUnchecked, hpAfterChecked };
        });

        expect(result.hpAfterUnchecked).toBe(6); // 10 raw damage - 6 armor PV mitigated = 4 dmg -> hp 10-4=6.
        expect(result.hpAfterChecked).toBe(0); // 10 raw damage, armor bypassed entirely -> hp 10-10=0.
    });

    test('executeStandardDamageRoll hides the Shield Craft checkbox unless the target has an equipped shield, on both PCs and NPCs', async ({
        page
    }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [npc] = await Actor.createDocuments([
                { name: `E2E NPC Shield Toggle ${stamp}`, type: 'npc', system: { hp: { value: 10, max: 10 } } }
            ]);
            const [shield] = await npc.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Shield ${stamp}`,
                    type: 'armor',
                    system: {
                        isShield: true,
                        pvMelee: 3,
                        pvRanged: 3,
                        equipped: false,
                        resistance: { value: 10, max: 10 }
                    }
                }
            ]);

            let scene = game.scenes.active;
            let createdScene = false;
            if (!scene) {
                scene = await Scene.create({ name: `E2E Scene ${stamp}`, width: 1000, height: 1000 });
                await scene.activate();
                createdScene = true;
            }
            const [tokenDoc] = await scene.createEmbeddedDocuments('Token', [
                { ...npc.prototypeToken.toObject(), actorId: npc.id, x: 100, y: 100 }
            ]);

            const { executeStandardDamageRoll } =
                await import('/systems/sla-industries/module/helpers/chat/damage.mjs');

            const renderCard = async () => {
                const before = game.messages.size;
                await executeStandardDamageRoll({
                    actor: npc,
                    rollFormula: '5',
                    adValue: 0,
                    attackType: 'melee',
                    parentTargets: [tokenDoc.uuid],
                    flavorText: 'Verify Shield Checkbox'
                });
                const msgs = Array.from(game.messages).slice(before);
                return msgs[msgs.length - 1]?.content ?? '';
            };

            const unequippedContent = await renderCard();

            await shield.update({ 'system.equipped': true });
            const equippedContent = await renderCard();

            await scene.deleteEmbeddedDocuments('Token', [tokenDoc.id]);
            if (createdScene) await scene.delete();
            await npc.delete();

            return {
                unequippedHasCheckbox: unequippedContent.includes('shield-craft-success'),
                equippedHasCheckbox: equippedContent.includes('shield-craft-success')
            };
        });

        // NPC armor's equip toggle is a real, GM-facing control (unlike computeArmorMitigation's
        // own mitigation math, which treats all NPC armor as equipped) -- the checkbox must not
        // render for a shield that isn't actually equipped, on either actor type.
        expect(result.unequippedHasCheckbox).toBe(false);
        expect(result.equippedHasCheckbox).toBe(true);
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
                    changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 2 }]
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

test.describe('GM: undoDamageApplication (document API)', () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
    });

    test('reverts HP and armor resistance to their pre-apply values and locks the message', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [victim] = await Actor.createDocuments([
                { name: `E2E Undo Victim ${stamp}`, type: 'character', system: { hp: { value: 10, max: 10 } } }
            ]);
            const [armor] = await victim.createEmbeddedDocuments('Item', [
                {
                    name: `E2E Undo Armor ${stamp}`,
                    type: 'armor',
                    system: { pv: 6, equipped: true, resistance: { value: 10, max: 10 } }
                }
            ]);

            const { applyDamageToVictim, undoDamageApplication } =
                await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            await applyDamageToVictim(victim, 10, 3, 0, null, 'melee', false, false);

            const message = game.messages.contents.at(-1);
            const beforeUndo = {
                hp: victim.system.hp.value,
                resistance: game.items.get(armor.id)?.system.resistance.value ?? armor.system.resistance.value
            };

            const undoResult = await undoDamageApplication(message);

            const fresh = game.actors.get(victim.id);
            const freshArmor = fresh.items.get(armor.id);
            const persisted = {
                hp: fresh.system.hp.value,
                resistance: freshArmor.system.resistance.value,
                undone: game.messages.get(message.id)?.flags?.sla?.undo?.undone
            };

            await message.delete();
            await victim.delete();
            return { undoResult, beforeUndo, persisted };
        });

        expect(result.beforeUndo).toEqual({ hp: 6, resistance: 7 });
        expect(result.undoResult).toEqual({ ok: true });
        expect(result.persisted).toEqual({ hp: 10, resistance: 10, undone: true });
    });

    test('refuses to undo the same message twice', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [victim] = await Actor.createDocuments([
                { name: `E2E Undo Twice ${stamp}`, type: 'character', system: { hp: { value: 10, max: 10 } } }
            ]);

            const { applyDamageToVictim, undoDamageApplication } =
                await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            await applyDamageToVictim(victim, 4, 0, 0, null, 'melee', false, false);
            const message = game.messages.contents.at(-1);

            const first = await undoDamageApplication(message);
            const second = await undoDamageApplication(game.messages.get(message.id));

            const hp = game.actors.get(victim.id).system.hp.value;

            await message.delete();
            await victim.delete();
            return { first, second, hp };
        });

        expect(result.first).toEqual({ ok: true });
        expect(result.second).toEqual({ ok: false, reason: 'already-undone' });
        expect(result.hp).toBe(10);
    });

    test('refuses to undo when the victim actor has been deleted', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [victim] = await Actor.createDocuments([
                { name: `E2E Undo Deleted ${stamp}`, type: 'character', system: { hp: { value: 10, max: 10 } } }
            ]);

            const { applyDamageToVictim, undoDamageApplication } =
                await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            await applyDamageToVictim(victim, 4, 0, 0, null, 'melee', false, false);
            const message = game.messages.contents.at(-1);

            await victim.delete();
            const undoResult = await undoDamageApplication(message);

            await message.delete();
            return undoResult;
        });

        expect(result).toEqual({ ok: false, reason: 'actor-deleted' });
    });

    test('refuses to undo and leaves HP untouched when HP changed by something else since apply', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [victim] = await Actor.createDocuments([
                { name: `E2E Undo Stale HP ${stamp}`, type: 'character', system: { hp: { value: 10, max: 10 } } }
            ]);

            const { applyDamageToVictim, undoDamageApplication } =
                await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            await applyDamageToVictim(victim, 4, 0, 0, null, 'melee', false, false);
            const message = game.messages.contents.at(-1);

            // Simulate an out-of-band HP change (manual GM edit / another effect) after the apply.
            await victim.update({ 'system.hp.value': 3 });

            const undoResult = await undoDamageApplication(message);
            const hp = game.actors.get(victim.id).system.hp.value;

            await message.delete();
            await victim.delete();
            return { undoResult, hp };
        });

        expect(result.undoResult).toEqual({ ok: false, reason: 'hp-mismatch' });
        expect(result.hp).toBe(3);
    });

    test('reverts Ebb-cleared wounds alongside damage in one undo', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [victim] = await Actor.createDocuments([
                {
                    name: `E2E Undo Wounds ${stamp}`,
                    type: 'character',
                    system: { hp: { value: 10, max: 10 }, wounds: { head: true } }
                }
            ]);

            const { applyEbbOutcomeToActor, undoDamageApplication } =
                await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            await applyEbbOutcomeToActor(victim, 4, 0, {
                isHeal: false,
                removeWoundsCount: 1,
                pvMod: 0,
                ammoName: null
            });
            const message = game.messages.contents.at(-1);

            const midway = { headWound: game.actors.get(victim.id).system.wounds.head };

            const undoResult = await undoDamageApplication(message);
            const fresh = game.actors.get(victim.id);
            const persisted = { hp: fresh.system.hp.value, headWound: fresh.system.wounds.head };

            await message.delete();
            await victim.delete();
            return { undoResult, midway, persisted };
        });

        expect(result.midway).toEqual({ headWound: false });
        expect(result.undoResult).toEqual({ ok: true });
        expect(result.persisted).toEqual({ hp: 10, headWound: true });
    });

    test('reverts a heal application', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [victim] = await Actor.createDocuments([
                { name: `E2E Undo Heal ${stamp}`, type: 'character', system: { hp: { value: 3, max: 10 } } }
            ]);

            const { applyEbbOutcomeToActor, undoDamageApplication } =
                await import('/systems/sla-industries/module/helpers/chat/damage.mjs');
            await applyEbbOutcomeToActor(victim, 5, 0, { isHeal: true, removeWoundsCount: 0, pvMod: 0 });
            const message = game.messages.contents.at(-1);

            const beforeUndo = { hp: game.actors.get(victim.id).system.hp.value };
            const undoResult = await undoDamageApplication(message);
            const hp = game.actors.get(victim.id).system.hp.value;

            await message.delete();
            await victim.delete();
            return { undoResult, beforeUndo, hp };
        });

        expect(result.beforeUndo).toEqual({ hp: 8 });
        expect(result.undoResult).toEqual({ ok: true });
        expect(result.hp).toBe(3);
    });
});
