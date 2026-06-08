/**
 * Native DOM helpers for chat card interaction (replaces jQuery patterns).
 */

/**
 * @param {HTMLElement|null} el
 * @param {string} key  kebab-case data attribute without "data-" prefix
 */
export function readDataString(el, key) {
    if (!el) return undefined;
    const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const fromDataset = el.dataset?.[camel];
    if (fromDataset !== undefined) return fromDataset;
    return el.getAttribute(`data-${key}`) ?? undefined;
}

/**
 * @param {HTMLElement|null} el
 * @param {string} key
 * @param {number} [defaultValue=0]
 */
export function readDataNumber(el, key, defaultValue = 0) {
    const raw = readDataString(el, key);
    if (raw === undefined || raw === '') return defaultValue;
    const n = Number(raw);
    return Number.isFinite(n) ? n : defaultValue;
}

/**
 * @param {HTMLElement|null} card
 */
export function getChatMessageId(card) {
    const messageEl = card?.closest?.('.message');
    if (!messageEl) return null;
    return messageEl.dataset?.messageId ?? messageEl.getAttribute('data-message-id') ?? null;
}

/**
 * @param {HTMLElement} el
 * @param {boolean} disabled
 * @param {string} [title]
 */
export function setButtonDisabled(el, disabled, title) {
    if (!el) return;
    el.disabled = disabled;
    if (title !== undefined) {
        if (title) el.setAttribute('title', title);
        else el.removeAttribute('title');
    }
}

/**
 * @param {HTMLElement} tooltip
 */
export function toggleTooltip(tooltip) {
    if (!tooltip) return;
    const hidden = tooltip.hasAttribute('hidden');
    if (hidden) tooltip.removeAttribute('hidden');
    else tooltip.setAttribute('hidden', '');
}
