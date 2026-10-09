/**
 * Runs async tasks one at a time per key, in the order they were queued (no Foundry runtime).
 * Used to serialize an item's effect syncs, since each sync is "delete stale copies, then create
 * new ones" and two overlapping runs would both see the same stale set and double-create.
 * A failing task rejects its own caller but never blocks the tasks queued behind it.
 * @returns {{ run: <T>(key: string, task: () => Promise<T>) => Promise<T>, settled: (key: string) => Promise<void> }}
 */
export function createKeyedQueue() {
    /** @type {Map<string, Promise<unknown>>} */
    const tails = new Map();

    return {
        /**
         * @template T
         * @param {string} key
         * @param {() => Promise<T>} task
         * @returns {Promise<T>}
         */
        run(key, task) {
            const previous = tails.get(key) ?? Promise.resolve();
            const result = previous.then(task, task);
            const tail = result.catch(() => {});
            tails.set(key, tail);
            tail.then(() => {
                if (tails.get(key) === tail) tails.delete(key);
            });
            return result;
        },

        /**
         * Resolves once everything queued for `key` so far has finished (never rejects).
         * @param {string} key
         * @returns {Promise<void>}
         */
        settled(key) {
            return (tails.get(key) ?? Promise.resolve()).then(() => {});
        }
    };
}
