import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { shouldShowMosWoundChoice } from "../../module/helpers/wound-visibility.mjs";

describe("shouldShowMosWoundChoice", () => {
    test("hides wound option for NPC when NPC wound tracking is disabled", () => {
        const result = shouldShowMosWoundChoice({
            hasChoice: true,
            targetActorType: "npc",
            enableNpcWoundTracking: false
        });
        assert.equal(result, false);
    });

    test("shows wound option for NPC when NPC wound tracking is enabled", () => {
        const result = shouldShowMosWoundChoice({
            hasChoice: true,
            targetActorType: "npc",
            enableNpcWoundTracking: true
        });
        assert.equal(result, true);
    });

    test("shows wound option for non-NPC target even when NPC wound tracking is disabled", () => {
        const result = shouldShowMosWoundChoice({
            hasChoice: true,
            targetActorType: "character",
            enableNpcWoundTracking: false
        });
        assert.equal(result, true);
    });

    test("shows wound option when no target actor type is available", () => {
        const result = shouldShowMosWoundChoice({
            hasChoice: true,
            targetActorType: undefined,
            enableNpcWoundTracking: false
        });
        assert.equal(result, true);
    });

    test("hides wound option when MOS does not offer a choice", () => {
        const result = shouldShowMosWoundChoice({
            hasChoice: false,
            targetActorType: "character",
            enableNpcWoundTracking: true
        });
        assert.equal(result, false);
    });
});
