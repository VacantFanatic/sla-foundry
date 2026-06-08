import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildGrantedSkillPayload,
    buildSpeciesStatUpdates,
    shouldAutoEquipDroppedItem,
    validatePackageRequirements
} from '../../module/sheets/actor/actor-drops-pure.mjs';

describe('validatePackageRequirements', () => {
    test('passes when all stats meet minimums', () => {
        const r = validatePackageRequirements({ str: 3, dex: 2 }, { str: { value: 4 }, dex: { value: 2 } });
        assert.equal(r.valid, true);
    });

    test('fails with key and minimum when stat is too low', () => {
        const r = validatePackageRequirements({ conc: 5 }, { conc: { value: 3 } });
        assert.equal(r.valid, false);
        assert.equal(r.failedKey, 'conc');
        assert.equal(r.minVal, 5);
    });
});

describe('buildSpeciesStatUpdates', () => {
    test('uses min from ranged stat objects', () => {
        const updates = buildSpeciesStatUpdates({ str: { min: 2, max: 6 }, dex: 3 });
        assert.equal(updates['system.stats.str.value'], 2);
        assert.equal(updates['system.stats.dex.value'], 3);
    });
});

describe('shouldAutoEquipDroppedItem', () => {
    test('auto-equips weapons on NPC and vehicle sheets', () => {
        assert.equal(shouldAutoEquipDroppedItem('npc', 'weapon'), true);
        assert.equal(shouldAutoEquipDroppedItem('vehicle', 'weapon'), true);
        assert.equal(shouldAutoEquipDroppedItem('character', 'weapon'), false);
    });
});

describe('buildGrantedSkillPayload', () => {
    test('maps skill stat from config by name', () => {
        const payload = buildGrantedSkillPayload(
            { name: 'Firearms', system: { description: 'Shoot' } },
            'fromPackage',
            { firearms: 'dex' }
        );
        assert.equal(payload.system.stat, 'dex');
        assert.equal(payload.flags['sla-industries'].fromPackage, true);
    });
});
