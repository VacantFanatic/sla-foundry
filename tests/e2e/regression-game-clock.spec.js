/**
 * E2E coverage for the GM game clock's "set date and time" control, against the REAL world calendar.
 *
 * Foundry's world calendar is quirky: its displayed leap years (7, 11, ... 2203) are one year away from what its
 * own `isLeapYear` says (8, 12, ... 2204), and converting a date to a time and back can land a day off. The unit
 * tests use a miniature of that quirk; these tests prove the real thing, by typing dates into the real form and
 * reading back what the calendar displays.
 *
 * Every test restores the world clock in a `finally`.
 */
const { test, expect } = require('@playwright/test');
const { joinGame, waitForSLASystem, dismissFoundryNotifications } = require('./fixtures');

test.describe.configure({ timeout: 300_000 });

test.describe('GM: game clock, set date and time', () => {
    test.beforeEach(async ({ page }) => {
        test.skip(!process.env.FOUNDRY_USER, 'Set FOUNDRY_USER');
        await joinGame(page);
        await waitForSLASystem(page);
        const gm = await page.evaluate(() => game.user?.isGM === true);
        test.skip(!gm, 'Requires GM — use a Gamemaster account for FOUNDRY_USER');
        await dismissFoundryNotifications(page);
        await page.evaluate(() => {
            window.__t0 = game.time.worldTime;
        });
    });

    test.afterEach(async ({ page }) => {
        await page.evaluate(async () => {
            await foundry.applications.instances.get('sla-game-clock')?.close();
            await game.time.set(window.__t0);
        });
    });

    const openClock = async (page) => {
        await page.evaluate(() => game.sla.openGameClock());
        const win = page.locator('#sla-game-clock');
        await expect(win).toBeVisible();
        return win;
    };

    /** Type a date into the real form and press Set date. */
    const fillAndApply = async (win, { year, month, day, hour, minute }) => {
        await win.locator('input[name="year"]').fill(String(year));
        await win.locator('select[name="month"]').selectOption(String(month));
        await win.locator('input[name="day"]').fill(String(day));
        await win.locator('input[name="hour"]').fill(String(hour));
        await win.locator('input[name="minute"]').fill(String(minute));
        await win.locator('button[data-action="setDate"]').click();
    };

    const displayed = (page) =>
        page.evaluate(() => {
            const c = game.time.calendar.timeToComponents(game.time.worldTime);
            return { year: c.year, month: c.month + 1, day: c.dayOfMonth + 1, hour: c.hour, minute: c.minute };
        });

    test('typing a date and pressing Set date makes the calendar display exactly that date, leap days included', async ({
        page
    }) => {
        const win = await openClock(page);
        const dates = [
            { year: 2204, month: 3, day: 12, hour: 14, minute: 30 },
            { year: 2203, month: 2, day: 29, hour: 6, minute: 5 }, // displayed leap year
            { year: 2203, month: 3, day: 1, hour: 0, minute: 0 },
            { year: 2204, month: 2, day: 28, hour: 23, minute: 59 }, // isLeapYear says leap, display says not
            { year: 2204, month: 3, day: 1, hour: 0, minute: 0 },
            { year: 2204, month: 12, day: 31, hour: 23, minute: 59 },
            { year: 2205, month: 1, day: 1, hour: 0, minute: 0 },
            { year: 7, month: 2, day: 29, hour: 12, minute: 0 },
            { year: 0, month: 1, day: 1, hour: 0, minute: 0 }
        ];
        for (const date of dates) {
            await fillAndApply(win, date);
            await expect.poll(() => displayed(page), { message: JSON.stringify(date) }).toEqual(date);
            await expect(win.locator('.sla-clock-error')).toBeHidden();
        }
    });

    test('the window shows the date it was set to, and the form follows the clock', async ({ page }) => {
        const win = await openClock(page);
        await fillAndApply(win, { year: 2204, month: 3, day: 12, hour: 14, minute: 30 });
        await expect(win.locator('[data-clock="date"]')).toHaveText('12 March 2204');
        await expect(win.locator('[data-clock="time"]')).toHaveText(/^14:30:\d\d$/);
        // A preset moves the clock and the untouched form refills from it.
        await win.locator('button[data-preset="hour1"][data-seconds="3600"]').click();
        await expect(win.locator('[data-clock="time"]')).toHaveText(/^15:30:\d\d$/);
        await expect(win.locator('input[name="hour"]')).toHaveValue('15');
    });

    test('a date the calendar does not have shows an inline error and changes nothing', async ({ page }) => {
        const win = await openClock(page);
        await fillAndApply(win, { year: 2204, month: 3, day: 12, hour: 14, minute: 30 });
        const before = await page.evaluate(() => game.time.worldTime);
        const bad = [
            [{ year: 2204, month: 2, day: 29, hour: 0, minute: 0 }, /does not have that day/i], // not displayed leap
            [{ year: 2204, month: 4, day: 31, hour: 0, minute: 0 }, /does not have that day/i],
            [{ year: 2204, month: 3, day: 12, hour: 24, minute: 0 }, /hour/i],
            [{ year: 2204, month: 3, day: 12, hour: 0, minute: 60 }, /minute/i]
        ];
        for (const [date, message] of bad) {
            await fillAndApply(win, date);
            await expect(win.locator('.sla-clock-error')).toBeVisible();
            await expect(win.locator('.sla-clock-error')).toHaveText(message);
            expect(await page.evaluate(() => game.time.worldTime)).toBe(before);
        }
        // A good date afterwards clears the error.
        await fillAndApply(win, { year: 2204, month: 3, day: 13, hour: 0, minute: 0 });
        await expect(win.locator('.sla-clock-error')).toBeHidden();
    });

    test('game.sla.setDate sets the date, defaults the time to midnight, and rejects bad input without changing the clock', async ({
        page
    }) => {
        const out = await page.evaluate(async () => {
            const read = () => {
                const c = game.time.calendar.timeToComponents(game.time.worldTime);
                return { year: c.year, month: c.month + 1, day: c.dayOfMonth + 1, hour: c.hour, minute: c.minute };
            };
            const out = {};
            out.returned = await game.sla.setDate({ year: 2210, month: 6, day: 15 });
            out.shown = read();
            const before = game.time.worldTime;
            out.bad = await game.sla.setDate({ year: 2210, month: 13, day: 1 });
            out.leapBad = await game.sla.setDate({ year: 2204, month: 2, day: 29 });
            out.unchanged = game.time.worldTime === before;
            out.returnedMatchesClock = out.returned === (await game.sla.setDate({ year: 2210, month: 6, day: 15 }));
            return out;
        });
        expect(out.shown).toEqual({ year: 2210, month: 6, day: 15, hour: 0, minute: 0 });
        expect(out.bad).toBeNull();
        expect(out.leapBad).toBeNull();
        expect(out.unchanged).toBe(true);
        expect(out.returnedMatchesClock).toBe(true);
    });

    test('moving the date forward expires a timed effect, and moving it back brings the still-present effect back', async ({
        page
    }) => {
        const out = await page.evaluate(async () => {
            const [actor] = await Actor.createDocuments([
                {
                    name: `E2E Date Jump ${Date.now()}`,
                    type: 'character',
                    system: { stats: { str: { value: 3, bonus: 0 } } }
                }
            ]);
            const wait = async (predicate, ms = 8000) => {
                const deadline = Date.now() + ms;
                while (Date.now() < deadline && !predicate()) await new Promise((r) => setTimeout(r, 100));
                return predicate();
            };
            const str = () => game.actors.get(actor.id).system.stats.str.total;
            const out = {};
            try {
                await game.sla.setDate({ year: 2204, month: 3, day: 12, hour: 8, minute: 0 });
                await actor.createEmbeddedDocuments('ActiveEffect', [
                    {
                        name: 'E2E Date Jump',
                        disabled: false,
                        duration: { value: 1, units: 'hours' },
                        changes: [{ key: 'system.stats.str.bonus', type: 'add', value: 2 }]
                    }
                ]);
                out.live = str();
                await game.sla.setDate({ year: 2204, month: 3, day: 13, hour: 8, minute: 0 });
                out.expired = await wait(() => str() === 3);
                out.afterForward = {
                    str: str(),
                    stored: game.actors.get(actor.id).effects.contents[0].toObject().duration.expired
                };
                await game.sla.setDate({ year: 2204, month: 3, day: 12, hour: 8, minute: 30 });
                out.revived = await wait(() => str() === 5);
                out.afterBack = {
                    str: str(),
                    stored: game.actors.get(actor.id).effects.contents[0].toObject().duration.expired
                };
            } finally {
                await actor.delete();
            }
            return out;
        });
        expect(out.live).toBe(5);
        expect(out.expired).toBe(true);
        expect(out.afterForward).toEqual({ str: 3, stored: true });
        expect(out.revived).toBe(true);
        expect(out.afterBack).toEqual({ str: 5, stored: false });
    });
});
