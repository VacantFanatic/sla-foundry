import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * @param {string} tag - e.g. "pre-2.9.0-rc2" or "pre-v2.9.0"
 * @returns {{ tagName: string, version: string, baseVersion: string }}
 */
export function resolveTag(tag) {
    const version = tag.replace(/^pre-v?/, '');
    const baseVersion = version.replace(/-rc\d+$/, '');
    return { tagName: tag, version, baseVersion };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
    const tag = process.argv[2];
    if (!tag) {
        console.error('Usage: node resolve-prerelease-tag.mjs <tag>');
        process.exit(1);
    }
    const { tagName, version, baseVersion } = resolveTag(tag);
    process.stdout.write(`tag_name=${tagName}\nversion=${version}\nbase_version=${baseVersion}\n`);
}
