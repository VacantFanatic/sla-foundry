/**
 * WAI-ARIA APG "Tabs" pattern keyboard navigation, shared by the actor and item
 * sheet tab rails (both use the same `nav.sheet-tabs[role="tablist"]` /
 * `[role="tab"]` / roving-`tabindex` markup contract).
 */

/**
 * Resolves which tab index a keydown on a tab rail should move focus to.
 * @param {string} key - `event.key` from the keydown event.
 * @param {number} currentIndex - Index of the currently focused tab.
 * @param {number} tabCount - Total number of tabs in the rail.
 * @returns {number|null} The target index, or null if this key isn't handled.
 */
export function resolveTabKeyNavIndex(key, currentIndex, tabCount) {
    if (tabCount <= 0) return null;
    switch (key) {
        case 'ArrowRight':
        case 'ArrowDown':
            return (currentIndex + 1) % tabCount;
        case 'ArrowLeft':
        case 'ArrowUp':
            return (currentIndex - 1 + tabCount) % tabCount;
        case 'Home':
            return 0;
        case 'End':
            return tabCount - 1;
        default:
            return null;
    }
}

/**
 * Binds Arrow/Home/End keyboard navigation onto a sheet's tab rail. Moving focus
 * also activates the target tab (a real `.click()`), reusing whatever click
 * handler the sheet already wires up for tab switching.
 * @param {HTMLElement} root
 * @param {AbortSignal} signal
 */
export function bindTabKeyboardNav(root, signal) {
    const tablist = root.querySelector('nav.sheet-tabs[role="tablist"]');
    if (!tablist) return;
    tablist.addEventListener(
        'keydown',
        (event) => {
            const currentTab = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
            if (!currentTab) return;
            const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
            const currentIndex = tabs.indexOf(currentTab);
            if (currentIndex === -1) return;
            const nextIndex = resolveTabKeyNavIndex(event.key, currentIndex, tabs.length);
            if (nextIndex === null) return;
            event.preventDefault();
            const target = tabs[nextIndex];
            if (target instanceof HTMLElement) target.focus();
            if (typeof target?.click === 'function') target.click();
        },
        { signal }
    );
}
