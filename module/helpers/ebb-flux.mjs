/**
 * Apply Ebb critical (MOS 4+): regain 1 FLUX, capped at max.
 * Keeps actor flux in sync when GM changes TN or luck alters the roll.
 *
 * @param {ChatMessage} message
 * @param {Actor} actor - Ebb caster (flux owner)
 * @param {object} flags - `message.flags.sla` (must include `isEbb` when true)
 * @param {boolean} isSuccess
 * @param {number} skillSuccessCount - skill dice successes (incl. auto successes if already folded in)
 */
export async function syncEbbCriticalFlux(message, actor, flags, isSuccess, skillSuccessCount) {
    if (!flags?.isEbb || !message || !actor) return;

    const shouldHave = Boolean(isSuccess && skillSuccessCount >= 4);
    const applied = Boolean(flags.ebbFluxRegainApplied);
    if (shouldHave === applied) return;

    const canModify = actor.testUserPermission(game.user, "OWNER") || game.user.isGM;
    if (!canModify) return;

    const max = Number(actor.system?.stats?.flux?.max) || 0;
    const cur = Number(actor.system?.stats?.flux?.value) || 0;

    if (shouldHave && !applied) {
        const next = Math.min(max, cur + 1);
        await actor.update({ "system.stats.flux.value": next });
        await message.update({ "flags.sla.ebbFluxRegainApplied": true });
        if (next > cur) {
            ui.notifications.info(game.i18n.format("SLA.EbbCriticalFluxRegained", { name: actor.name }));
        }
    } else if (!shouldHave && applied) {
        await actor.update({ "system.stats.flux.value": Math.max(0, cur - 1) });
        await message.update({ "flags.sla.ebbFluxRegainApplied": false });
        ui.notifications.info(game.i18n.format("SLA.EbbCriticalFluxRevoked", { name: actor.name }));
    }
}
