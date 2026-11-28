import { SlaSimpleContentDialog } from '../../apps/sla-simple-dialog.mjs';
import { parseSituationalModifier } from './roll-math.mjs';

/**
 * Reads the "Situational Modifier (+/-)" input from a confirmed roll dialog.
 * @param {HTMLElement | HTMLFormElement | null} html
 * @returns {number}
 */
export function readSituationalModifier(html) {
    const root = html?.jquery ? html[0] : html;
    const form = root instanceof HTMLFormElement ? root : root?.querySelector?.('form');
    return parseSituationalModifier(form?.elements?.situationalModifier?.value);
}

/**
 * Pre-roll confirmation dialog with a free-form situational modifier, shared by skill and stat rolls.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.summary  One-line description of the roll (e.g. "DEX 5 + Rank 2")
 * @param {string} [opts.summaryLabel]
 * @param {(situationalModifier: number) => void | Promise<void>} opts.onConfirm
 */
export async function renderSituationalRollDialog({ title, summary, summaryLabel = 'Roll', onConfirm }) {
    const content = await foundry.applications.handlebars.renderTemplate(
        'systems/sla-industries/templates/dialogs/roll-modifier-dialog.hbs',
        { summary, summaryLabel }
    );

    await new SlaSimpleContentDialog({
        title,
        contentHtml: content,
        width: 420,
        classes: ['sla-dialog-window', 'dialog'],
        actionLabel: 'ROLL',
        onConfirm: (root) => void onConfirm(readSituationalModifier(root))
    }).render(true);
}
