/**
 * Unit tests for the per-key async queue that serializes an item's effect syncs.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createKeyedQueue } from '../../module/helpers/keyed-queue.mjs';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe('createKeyedQueue', () => {
    test('runs tasks for one key strictly in order, never overlapping', async () => {
        const q = createKeyedQueue();
        const log = [];
        let running = 0;
        let maxRunning = 0;
        const task = (name, ms) => async () => {
            running++;
            maxRunning = Math.max(maxRunning, running);
            log.push(`start ${name}`);
            await tick(ms);
            log.push(`end ${name}`);
            running--;
            return name;
        };
        const results = await Promise.all([
            q.run('a', task('1', 20)),
            q.run('a', task('2', 1)),
            q.run('a', task('3', 1))
        ]);
        assert.deepEqual(results, ['1', '2', '3']);
        assert.deepEqual(log, ['start 1', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3']);
        assert.equal(maxRunning, 1);
    });

    test('different keys run concurrently', async () => {
        const q = createKeyedQueue();
        let running = 0;
        let maxRunning = 0;
        const task = async () => {
            running++;
            maxRunning = Math.max(maxRunning, running);
            await tick(10);
            running--;
        };
        await Promise.all([q.run('a', task), q.run('b', task)]);
        assert.equal(maxRunning, 2);
    });

    test('a failing task rejects its caller but does not block the next one', async () => {
        const q = createKeyedQueue();
        const failing = q.run('a', async () => {
            throw new Error('boom');
        });
        const next = q.run('a', async () => 'ok');
        await assert.rejects(failing, /boom/);
        assert.equal(await next, 'ok');
    });

    test('settled() waits for everything queued so far, never rejects, and is immediate when idle', async () => {
        const q = createKeyedQueue();
        let done = false;
        q.run('a', async () => {
            await tick(15);
            done = true;
        });
        q.run('a', async () => {
            throw new Error('ignored');
        }).catch(() => {});
        await q.settled('a');
        assert.equal(done, true);
        await q.settled('never-used');
    });

    test('forgets a key once its queue drains', async () => {
        const q = createKeyedQueue();
        await q.run('a', async () => 1);
        await tick(1);
        // A fresh task starts immediately instead of chaining onto stale state.
        assert.equal(await q.run('a', async () => 2), 2);
    });
});
