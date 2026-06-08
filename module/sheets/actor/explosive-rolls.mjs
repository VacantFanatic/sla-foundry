import { SlaSimpleContentDialog } from '../../apps/sla-simple-dialog.mjs';
import { createSLARoll } from '../../helpers/dice.mjs';
import {
    applyExplosiveRollAdjustments,
    buildExplosiveMods,
    buildSkillDiceResults,
    computeExplosiveMaxRange,
    computeSuccessDieOutcome,
    readExplosiveRollForm,
    resolveExplosiveBlastData
} from './roll-math.mjs';

function resolveExplosiveSkillContext(sheet, item) {
    const skillName = item.system.skill || 'throw';
    const combatSkills = CONFIG.SLA?.combatSkills || {};
    const resolvedSkillName = combatSkills[skillName] || skillName;

    let rank = 0;
    let skillItemForStat = null;
    if (resolvedSkillName) {
        const skillItem = sheet.actor.items.find(
            (i) => i.type === 'skill' && i.name.trim().toLowerCase() === resolvedSkillName.trim().toLowerCase()
        );
        if (skillItem) {
            rank = Number(skillItem.system.rank) || 0;
            skillItemForStat = skillItem;
        }
    }

    const statKey = skillItemForStat?.system?.stat || 'dex';
    const statValue = sheet.actor.system.stats[statKey]?.total ?? sheet.actor.system.stats[statKey]?.value ?? 0;
    const strValue = sheet.actor.system.stats.str?.total ?? sheet.actor.system.stats.str?.value ?? 0;
    return { rank, statValue, strValue };
}

function getActorTokenForExplosiveRange(sheet) {
    return sheet.token?.object ?? sheet.actor.getActiveTokens()[0];
}

function appendExplosiveRangeNotes(notes, item, strValue, target, token) {
    if (item.system.blastRadiusInner || item.system.blastRadiusOuter) {
        const txt =
            item.system.blastRadiusInner > 0
                ? `${item.system.blastRadiusInner}/${item.system.blastRadiusOuter}m`
                : `${item.system.blastRadiusOuter}m`;
        notes.push(`<strong>Blast:</strong> ${txt}`);
    }

    const effectiveRange = computeExplosiveMaxRange(strValue);
    notes.push(`<strong>Max Range:</strong> ${effectiveRange}m`);

    if (!token || target == null) return;
    const ray = new foundry.canvas.geometry.Ray(token.center, target);
    const distMeters = (ray.distance / canvas.scene.grid.size) * canvas.scene.grid.distance;
    if (distMeters > effectiveRange) {
        notes.push(`<strong style='color:#ffa500'>OUT OF RANGE (${Math.round(distMeters)}m)</strong>`);
    }
}

function resolveDeviationWallCollision(start, end, epsilon = 2, source = null) {
    const fallback = { x: end.x, y: end.y, blocked: false };
    if (!canvas?.walls) return fallback;

    const ray = new foundry.canvas.geometry.Ray(start, end);
    const distanceFromStart = (point) => {
        if (point?.x == null || point?.y == null) return Number.POSITIVE_INFINITY;
        return Math.hypot(point.x - start.x, point.y - start.y);
    };
    const extractImpact = (collision) => {
        if (!collision) return null;
        const impact = collision.intersection || collision.point || collision;
        if (impact?.x == null || impact?.y == null) return null;
        return impact;
    };
    const resolveImpact = (collision) => {
        if (!collision) return null;
        if (Array.isArray(collision)) {
            const impacts = collision.map(extractImpact).filter((p) => p?.x != null && p?.y != null);
            if (!impacts.length) return null;
            impacts.sort((a, b) => distanceFromStart(a) - distanceFromStart(b));
            return resolveImpact(impacts[0]);
        }

        const impact = extractImpact(collision);
        if (impact?.x == null || impact?.y == null) return null;

        const impactDistance = distanceFromStart(impact);
        if (impactDistance <= epsilon) return { x: start.x, y: start.y, blocked: true };
        const safeDistance = Math.max(0, impactDistance - epsilon);
        const t = safeDistance / (impactDistance || 1);
        return {
            x: start.x + (impact.x - start.x) * t,
            y: start.y + (impact.y - start.y) * t,
            blocked: true
        };
    };

    try {
        const backend = CONFIG?.Canvas?.polygonBackends?.move;
        const backendClosest = backend?.testCollision
            ? backend.testCollision(start, end, { type: 'move', mode: 'closest', source })
            : null;
        const resolvedBackendClosest = resolveImpact(backendClosest);
        if (resolvedBackendClosest) return resolvedBackendClosest;
    } catch (_err) {
        // Keep fallback path active for API/version differences.
    }

    try {
        const closest = canvas.walls.checkCollision(ray, { type: 'move', mode: 'closest', source });
        const resolvedClosest = resolveImpact(closest);
        if (resolvedClosest) return resolvedClosest;
    } catch (_err) {
        // Keep fallback path active for API/version differences.
    }

    try {
        const any = canvas.walls.checkCollision(ray, { type: 'move', mode: 'any', source });
        if (any === true) {
            const collisions = canvas.walls.checkCollision(ray, { type: 'move', mode: 'all', source });
            const resolvedAll = resolveImpact(collisions);
            if (resolvedAll) return resolvedAll;
        }
    } catch (_err) {
        // Keep fallback path active for API/version differences.
    }

    return fallback;
}

function resolveExplosiveDeviation({ isBaseSuccess, skillSuccessCount, target, token }) {
    const noCanvasTarget = target == null;
    let outcomeText = '';
    let resultColor = '#f55';
    let isSuccess = false;
    let finalX = noCanvasTarget ? 0 : target.x;
    let finalY = noCanvasTarget ? 0 : target.y;
    let wallBlocked = false;

    const allDiceFailed = !isBaseSuccess && skillSuccessCount === 0;
    if (allDiceFailed) {
        outcomeText = "<strong style='color:#ff0000; font-size:1.1em;'>FUMBLE: Detonates on Thrower!</strong>";
        resultColor = '#ff0000';
        if (token) {
            finalX = token.center.x;
            finalY = token.center.y;
        }
        return { outcomeText, resultColor, isSuccess, finalX, finalY, wallBlocked };
    }

    if (isBaseSuccess && skillSuccessCount > 0) {
        outcomeText = noCanvasTarget
            ? "<strong style='color:#39ff14'>SUCCESS</strong>"
            : "<strong style='color:#39ff14'>LANDS ON TARGET</strong>";
        resultColor = '#39ff14';
        isSuccess = true;
        if (noCanvasTarget) {
            finalX = 0;
            finalY = 0;
        }
        return { outcomeText, resultColor, isSuccess, finalX, finalY, wallBlocked };
    }

    const devMeters = isBaseSuccess ? 5 : 10;
    outcomeText = isBaseSuccess
        ? "<strong style='color:#ffa500'>DEVIATION: 5m</strong>"
        : "<strong style='color:#ff5555'>DEVIATION: 10m</strong>";
    resultColor = isBaseSuccess ? '#ffa500' : '#ff5555';

    if (noCanvasTarget) {
        const originX = token?.center?.x ?? 0;
        const originY = token?.center?.y ?? 0;
        const grid = canvas?.scene?.grid;
        if (grid?.distance && grid?.size) {
            const devPixels = (devMeters / grid.distance) * grid.size;
            const angle = Math.random() * 2 * Math.PI;
            finalX = originX + Math.cos(angle) * devPixels;
            finalY = originY + Math.sin(angle) * devPixels;
        } else {
            finalX = originX;
            finalY = originY;
        }
        return { outcomeText, resultColor, isSuccess, finalX, finalY, wallBlocked: false };
    }

    const devPixels = (devMeters / canvas.scene.grid.distance) * canvas.scene.grid.size;
    const angle = Math.random() * 2 * Math.PI;
    finalX = target.x + Math.cos(angle) * devPixels;
    finalY = target.y + Math.sin(angle) * devPixels;

    const wallCollision = resolveDeviationWallCollision(target, { x: finalX, y: finalY }, 2, token?.document ?? null);
    finalX = wallCollision.x;
    finalY = wallCollision.y;
    wallBlocked = wallCollision.blocked;

    return { outcomeText, resultColor, isSuccess, finalX, finalY, wallBlocked };
}

async function placeExplosiveTemplates({ item, blastRadius, innerDist, finalX, finalY, isSuccess }) {
    try {
        const distancePixels =
            canvas?.dimensions?.distancePixels ?? canvas.scene.grid.size / canvas.scene.grid.distance;
        const visMode = game.settings.get('sla-industries', 'blastRegionVisibility') ?? 'observer';
        const visibility = visMode === 'always' ? CONST.REGION_VISIBILITY.ALWAYS : CONST.REGION_VISIBILITY.OBSERVER;
        const baseRegionData = {
            color: game.user.color,
            displayMeasurements: true,
            visibility,
            ownership: { [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
            ...(canvas.level?.id ? { levels: [canvas.level.id] } : {})
        };
        const regions = [
            {
                ...baseRegionData,
                name: `${item.name} (Outer)`,
                flags: { sla: { itemId: item.id, isDeviation: !isSuccess, type: 'outer' } },
                shapes: [
                    {
                        type: 'circle',
                        x: finalX,
                        y: finalY,
                        radius: blastRadius * distancePixels,
                        gridBased: false
                    }
                ]
            }
        ];

        if (innerDist > 0 && innerDist < blastRadius) {
            regions.push({
                ...baseRegionData,
                name: `${item.name} (Inner)`,
                flags: { sla: { itemId: item.id, isDeviation: !isSuccess, type: 'inner' } },
                shapes: [
                    {
                        type: 'circle',
                        x: finalX,
                        y: finalY,
                        radius: innerDist * distancePixels,
                        gridBased: false
                    }
                ]
            });
        }

        await canvas.scene.createEmbeddedDocuments('Region', regions);
    } catch (err) {
        console.error('SLA | Template Creation Failed:', err);
    }
}

function drawDashedCircle(graphics, centerX, centerY, radius, color, thickness, dashLength, gapLength) {
    if (!graphics || radius <= 0) return;
    const circumference = Math.PI * 2 * radius;
    const segmentLength = Math.max(1, dashLength + gapLength);
    const segmentCount = Math.max(12, Math.floor(circumference / segmentLength));
    const angleStep = (Math.PI * 2) / segmentCount;
    const dashStep = Math.max(1, Math.floor(segmentCount * (dashLength / segmentLength)));

    graphics.lineStyle(thickness, color, 1);
    for (let i = 0; i < segmentCount; i += dashStep * 2) {
        for (let j = 0; j < dashStep; j++) {
            const idx = i + j;
            if (idx >= segmentCount) break;
            const a1 = idx * angleStep;
            const a2 = (idx + 1) * angleStep;
            const x1 = centerX + Math.cos(a1) * radius;
            const y1 = centerY + Math.sin(a1) * radius;
            const x2 = centerX + Math.cos(a2) * radius;
            const y2 = centerY + Math.sin(a2) * radius;
            graphics.moveTo(x1, y1);
            graphics.lineTo(x2, y2);
        }
    }
}

function waitForCanvasClick({ outerDist = 0, innerDist = 0 } = {}) {
    return new Promise((resolve) => {
        const stage = canvas?.app?.stage;
        if (!stage) {
            resolve(null);
            return;
        }

        const distancePixels =
            canvas?.dimensions?.distancePixels ?? canvas?.scene?.grid?.size / canvas?.scene?.grid?.distance;
        const outerRadiusPx = Math.max(0, Number(outerDist) || 0) * (distancePixels || 0);
        const innerRadiusPx = Math.max(0, Number(innerDist) || 0) * (distancePixels || 0);
        const preview = new PIXI.Graphics();
        preview.eventMode = 'none';
        preview.zIndex = 9999;
        stage.addChild(preview);

        const redrawPreview = (x, y) => {
            preview.clear();

            if (outerRadiusPx > 0) {
                preview.beginFill(0xffaa00, 0.08);
                preview.drawCircle(x, y, outerRadiusPx);
                preview.endFill();
                drawDashedCircle(preview, x, y, outerRadiusPx, 0xffaa00, 2, 7, 6);
            }

            if (innerRadiusPx > 0 && innerRadiusPx < outerRadiusPx) {
                preview.beginFill(0xff4444, 0.1);
                preview.drawCircle(x, y, innerRadiusPx);
                preview.endFill();
                drawDashedCircle(preview, x, y, innerRadiusPx, 0xff4444, 2, 5, 5);
            }
        };

        const cleanup = () => {
            stage.off('click', clickHandler);
            stage.off('pointermove', moveHandler);
            stage.off('rightdown', cancelHandler);
            if (preview.parent) preview.parent.removeChild(preview);
            preview.destroy();
        };

        const moveHandler = (event) => {
            const pos = event?.data?.getLocalPosition(stage);
            if (!pos) return;
            redrawPreview(pos.x, pos.y);
        };

        if (canvas?.mousePosition) {
            redrawPreview(canvas.mousePosition.x, canvas.mousePosition.y);
        }

        stage.on('pointermove', moveHandler);

        const clickHandler = (event) => {
            event.stopPropagation();
            const pos = event.data.getLocalPosition(stage);
            cleanup();
            resolve({ x: pos.x, y: pos.y });
        };
        stage.on('click', clickHandler);

        const cancelHandler = (event) => {
            event?.stopPropagation?.();
            cleanup();
            resolve(null);
        };
        stage.on('rightdown', cancelHandler);
    });
}

async function resolveExplosiveRoll(sheet, item, rollData, target, blastRadius, innerDist) {
    const currentQty = item.system.quantity || 0;
    if (currentQty <= 0) {
        return ui.notifications.warn(`You are out of ${item.name}s.`);
    }

    const newQty = currentQty - 1;
    if (newQty === 0) {
        await item.delete();
    } else {
        await item.update({ 'system.quantity': newQty });
    }

    const { rank, statValue, strValue } = resolveExplosiveSkillContext(sheet, item);
    const mods = buildExplosiveMods(rollData);
    let notes = [];
    const token = getActorTokenForExplosiveRange(sheet);
    let resolvedTarget = target;
    if (target != null && token) {
        const throwCollision = resolveDeviationWallCollision(token.center, target, 2, token.document ?? null);
        if (throwCollision.blocked) {
            resolvedTarget = { x: throwCollision.x, y: throwCollision.y };
            notes.push('<strong>Throw:</strong> Stopped by wall.');
            ui.notifications.info(`${item.name} hit a wall before reaching the target point.`);
        }
    }

    appendExplosiveRangeNotes(notes, item, strValue, resolvedTarget, token);
    applyExplosiveRollAdjustments({
        prone: Boolean(sheet.actor.system.conditions?.prone),
        stunned: Boolean(sheet.actor.system.conditions?.stunned),
        woundPenalty: sheet.actor.system.wounds.penalty || 0,
        applyWoundPenalties: game.settings.get('sla-industries', 'enableAutomaticWoundPenalties'),
        rollData,
        mods
    });

    const baseModifier = statValue + rank + mods.allDice;
    const skillDiceCount = Math.max(0, rank + 1 + mods.rank);
    const rollFormula = `1d10 + ${skillDiceCount}d10`;
    let roll = createSLARoll(rollFormula);
    await roll.evaluate();

    const TN = 10;
    const { sdTotal, isBaseSuccess } = computeSuccessDieOutcome({
        sdRaw: roll.terms[0].results[0].result,
        baseModifier,
        successDieModifier: mods.successDie,
        targetNumber: TN
    });

    const { skillDiceData, skillSuccessCount } = buildSkillDiceResults({
        roll,
        baseModifier,
        targetNumber: TN,
        autoSuccesses: mods.autoSkillSuccesses
    });

    const deviationData = resolveExplosiveDeviation({
        isBaseSuccess,
        skillSuccessCount,
        target: resolvedTarget,
        token
    });
    const { outcomeText, resultColor, isSuccess, finalX, finalY, wallBlocked } = deviationData;

    if (wallBlocked) {
        notes.push('<strong>Deviation:</strong> Stopped by wall.');
        ui.notifications.info(`${item.name} deviation hit a wall.`);
    }

    if (innerDist > 0) {
        notes.push(`<br/><strong>Kill Zone (< ${innerDist}m):</strong> +2 Damage`);
    }

    if (game.settings.get('sla-industries', 'enableExplosiveThrowAutomation') && target != null) {
        await placeExplosiveTemplates({ item, blastRadius, innerDist, finalX, finalY, isSuccess });
    }

    let baseDmg = item.system.damage || '0';
    const adValue = Number(item.system.ad) || 0;

    const notesText = notes.join(' ');
    const templateData = {
        actorUuid: sheet.actor.uuid,
        borderColor: resultColor,
        headerColor: resultColor,
        resultColor: resultColor,
        itemName: item.name.toUpperCase(),
        successTotal: sdTotal,
        tooltip: sheet._generateTooltip(roll, baseModifier, mods.successDie),
        skillDice: skillDiceData,
        notes: notesText,
        showDamageButton: true,
        dmgFormula: baseDmg,
        dmgDisplay: sheet._resolveDamageDisplay(baseDmg),
        minDamage: Number(item.system.minDamage) || 0,
        adValue: adValue,
        mos: {
            isSuccess: isSuccess,
            hits: skillSuccessCount,
            effect: outcomeText
        },
        canUseLuck: sheet.actor.system.stats.luck.value > 0,
        luckValue: sheet.actor.system.stats.luck.value,
        isEbb: true
    };

    const chatContent = await foundry.applications.handlebars.renderTemplate(
        'systems/sla-industries/templates/chat/chat-weapon-rolls.hbs',
        templateData
    );

    roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
        content: chatContent,
        flags: {
            sla: sheet._buildSlaRollFlags({
                baseModifier: baseModifier,
                itemName: item.name.toUpperCase(),
                notes: notesText,
                tn: 10,
                extra: {
                    targets: Array.from(game.user.targets).map((t) => t.document.uuid),
                    damageBase: baseDmg,
                    adValue: adValue
                }
            })
        }
    });
}

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 */
export async function renderExplosiveDialog(sheet, item) {
    const templateData = {
        item: item,
        isMelee: false,
        validModes: { single: { label: 'Single', active: true, rounds: 1, recoil: 0 } },
        selectedMode: 'single',
        recoil: 0
    };

    const content = await foundry.applications.handlebars.renderTemplate(
        'systems/sla-industries/templates/dialogs/attack-dialog.hbs',
        templateData
    );

    await new SlaSimpleContentDialog({
        title: `Throw: ${item.name}`,
        contentHtml: content,
        width: 520,
        classes: ['sla-dialog-window', 'dialog'],
        actionLabel: 'THROW',
        onConfirm: (root) => void processExplosiveRoll(sheet, item, root)
    }).render(true);
}

/**
 * @param {import('../actor-sheet.mjs').SlaActorSheet} sheet
 */
export async function processExplosiveRoll(sheet, item, html) {
    const root = html?.jquery ? html[0] : html;
    const form = root instanceof HTMLFormElement ? root : root?.querySelector?.('form');
    if (!form) return;

    const rollData = readExplosiveRollForm(form);
    const { innerDist, outerDist } = resolveExplosiveBlastData(item.system);
    const automateThrow = game.settings.get('sla-industries', 'enableExplosiveThrowAutomation');
    let target = null;
    if (automateThrow) {
        ui.notifications.info('Select target position...');
        target = await waitForCanvasClick({ outerDist, innerDist });
        if (!target) return;
    }
    await resolveExplosiveRoll(sheet, item, rollData, target, outerDist, innerDist);
}
