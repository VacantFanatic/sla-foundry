/**
 * Escape-to-close for the system's ApplicationV2-based dialogs (XPDialog, LuckDialog,
 * SlaSimpleContentDialog — which also hosts the Attack/Reload dialog content). Foundry's
 * plain `ApplicationV2` (unlike `Dialog`/`DialogV2`) does not bind Escape by default, so
 * without this, Escape does nothing on any of the system's own dialogs.
 */

/**
 * Binds a keydown listener that closes the dialog on Escape.
 * @param {HTMLElement} root
 * @param {AbortSignal} signal
 * @param {() => void} onClose
 */
export function bindEscapeToClose(root, signal, onClose) {
    root.addEventListener(
        'keydown',
        (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            onClose();
        },
        { signal }
    );
}
