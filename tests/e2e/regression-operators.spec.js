const { test, expect } = require("@playwright/test");
const { joinGame, waitForSLASystem } = require("./fixtures");

const needsAuth = () => {
    test.skip(!process.env.FOUNDRY_USER, "Set FOUNDRY_USER (and FOUNDRY_URL / FOUNDRY_PASSWORD if needed)");
};

test.describe("SLA runtime — dice and CONFIG", () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
    });

    test("Foundry Roll evaluates numeric result", async ({ page }) => {
        const out = await page.evaluate(async () => {
            const roll = new Roll("1d10 + 2d10");
            await roll.evaluate();
            return {
                total: roll.total,
                termCount: roll.terms?.length ?? 0
            };
        });
        expect(out.total).toBeGreaterThanOrEqual(3);
        expect(out.total).toBeLessThanOrEqual(30);
        expect(out.termCount).toBeGreaterThanOrEqual(2);
    });

    test("CONFIG.SLA exposes combat skills and ammo config", async ({ page }) => {
        const ok = await page.evaluate(() => {
            const c = globalThis.CONFIG?.SLA;
            return !!(
                c?.combatSkills?.pistol &&
                c?.ammoModifiers?.standard &&
                typeof c.ammoModifiers.standard.damage === "number"
            );
        });
        expect(ok).toBe(true);
    });

    test("Actors directory shows Create Actor for GM users", async ({ page }) => {
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, "Requires GM — use a GM account for FOUNDRY_USER");
        await page.getByRole("tab", { name: /^actors$/i }).click();
        await expect(page.getByRole("button", { name: /create actor/i })).toBeVisible();
    });
});

test.describe("GM: operative creation and weapon item (document API)", () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, "Requires GM — use a Gamemaster account for FOUNDRY_USER");
    });

    test("creates and deletes a character (operative) actor", async ({ page }) => {
        const id = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E Operative ${stamp}`, type: "character" }
            ]);
            const actorId = actor?.id;
            await actor.delete();
            return actorId;
        });
        expect(id).toBeTruthy();
    });

    test("creates operative with embedded weapon and item roll data", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([
                { name: `E2E Weapon Test ${stamp}`, type: "character" }
            ]);
            const [created] = await actor.createEmbeddedDocuments("Item", [
                {
                    name: `E2E Pistol ${stamp}`,
                    type: "weapon",
                    system: {
                        attackType: "ranged",
                        skill: "pistol",
                        damage: "1d10"
                    }
                }
            ]);
            const item = actor.items.get(created.id);
            const rollData = item.getRollData?.() ?? null;
            const type = item?.type;
            const dmg = item?.system?.damage;
            await actor.delete();
            return { type, dmg, hasRollData: typeof rollData === "object" && rollData !== null };
        });
        expect(result.type).toBe("weapon");
        expect(result.dmg).toBe("1d10");
        expect(result.hasRollData).toBe(true);
    });

    test("Roll with weapon item roll data evaluates (attack-style formula)", async ({ page }) => {
        const total = await page.evaluate(async () => {
            const stamp = Date.now();
            const [actor] = await Actor.createDocuments([{ name: `E2E Roller ${stamp}`, type: "character" }]);
            const [created] = await actor.createEmbeddedDocuments("Item", [
                { name: `E2E Gun ${stamp}`, type: "weapon", system: { skill: "pistol", damage: "1d10" } }
            ]);
            const item = actor.items.get(created.id);
            const rd = item.getRollData();
            const roll = new Roll("1d10 + 2d10 + 3", rd);
            await roll.evaluate();
            const t = roll.total;
            await actor.delete();
            return t;
        });
        expect(total).toBeGreaterThanOrEqual(4);
        expect(total).toBeLessThanOrEqual(36);
    });
});

test.describe("GM: Ebb formula active effects (document API)", () => {
    test.beforeEach(async ({ page }) => {
        needsAuth();
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, "Requires GM — use a Gamemaster account for FOUNDRY_USER");
    });

    test("applyItemEffectsToActor copies embedded ActiveEffects from Ebb formula to target actor", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [caster] = await Actor.createDocuments([{ name: `E2E Ebb Caster ${stamp}`, type: "character" }]);
            const [target] = await Actor.createDocuments([{ name: `E2E Ebb Target ${stamp}`, type: "character" }]);
            const [created] = await caster.createEmbeddedDocuments("Item", [
                {
                    name: `E2E Ebb Formula ${stamp}`,
                    type: "ebbFormula",
                    img: "icons/svg/explosion.svg",
                    system: {
                        formulaRating: 4,
                        cost: 1,
                        discipline: "blast",
                        description: "",
                        damage: "",
                        minDamage: "",
                        ad: 0,
                        rof: "",
                        recoil: "",
                        range: "",
                        skill: ""
                    }
                }
            ]);
            const formula = caster.items.get(created.id);
            await formula.createEmbeddedDocuments("ActiveEffect", [
                {
                    name: "E2E Formula Effect",
                    img: "icons/svg/aura.svg",
                    disabled: false,
                    transfer: true
                }
            ]);
            const originUuid = formula.uuid;
            await formula.applyItemEffectsToActor(target);
            const onTarget = target.effects.filter((e) => e.origin === originUuid);
            const transferFlags = onTarget.map((e) => e.transfer);
            const payload = {
                count: onTarget.length,
                transferFalse: transferFlags.every((t) => t === false),
                itemType: formula.type,
                embeddedFx: formula.effects.size
            };
            await caster.delete();
            await target.delete();
            return payload;
        });
        expect(result.itemType).toBe("ebbFormula");
        expect(result.embeddedFx).toBe(1);
        expect(result.count).toBe(1);
        expect(result.transferFalse).toBe(true);
    });

    test("applyItemEffectsToActor replaces prior effects from same formula origin on repeat apply", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const stamp = Date.now();
            const [caster] = await Actor.createDocuments([{ name: `E2E Ebb Caster2 ${stamp}`, type: "character" }]);
            const [target] = await Actor.createDocuments([{ name: `E2E Ebb Target2 ${stamp}`, type: "character" }]);
            const [created] = await caster.createEmbeddedDocuments("Item", [
                {
                    name: `E2E Ebb Formula2 ${stamp}`,
                    type: "ebbFormula",
                    system: {
                        formulaRating: 4,
                        cost: 1,
                        discipline: "blast",
                        description: "",
                        damage: "",
                        minDamage: "",
                        ad: 0,
                        rof: "",
                        recoil: "",
                        range: "",
                        skill: ""
                    }
                }
            ]);
            const formula = caster.items.get(created.id);
            await formula.createEmbeddedDocuments("ActiveEffect", [
                {
                    name: "E2E Repeat Apply",
                    img: "icons/svg/aura.svg",
                    disabled: false
                }
            ]);
            const originUuid = formula.uuid;
            await formula.applyItemEffectsToActor(target);
            await formula.applyItemEffectsToActor(target);
            const onTarget = target.effects.filter((e) => e.origin === originUuid);
            await caster.delete();
            await target.delete();
            return { count: onTarget.length };
        });
        expect(result.count).toBe(1);
    });
});
