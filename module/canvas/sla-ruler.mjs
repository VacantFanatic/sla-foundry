/**
 * Custom TokenRuler for SLA Industries (V13).
 * Characters/NPCs: Closing (Green) vs Rushing (Yellow) vs Over (Red).
 * Vehicles: Move (Green) vs Over (Red).
 */
export class SLATokenRuler extends foundry.canvas.placeables.tokens.TokenRuler {

  /** @override */
  _getSegmentStyle(waypoint) {
    // Get default Foundry style first
    const style = super._getSegmentStyle(waypoint);
    // Apply SLA logic
    return this.#getSpeedBasedStyle(waypoint, style);
  }

  /** @override */
  _getGridHighlightStyle(waypoint, offset) {
    const style = super._getGridHighlightStyle(waypoint, offset);
    return this.#getSpeedBasedStyle(waypoint, style);
  }

  /** @override */
  _getWaypointStyle(waypoint) {
    const style = super._getWaypointStyle(waypoint);
    return this.#getSpeedBasedStyle(waypoint, style);
  }

  /**
   * Apply SLA Color Logic based on movement speeds.
   * @param {object} waypoint - The waypoint data containing measurement info
   * @param {object} style - The style object to modify (color, alpha)
   */
  #getSpeedBasedStyle(waypoint, style) {
    // 1. Safety Checks
    // Don't color if not dragging our own token
    if ( !(game.user.id in this.token._plannedMovement) ) return style;
    
    const actor = this.token.actor;
    if (!actor) return style;
    const tokenDoc = this.token.document ?? this.token;

    // In combat, once movement action is spent this turn, always show over-limit color.
    const canMove = game.sla?.canTokenMoveThisTurn?.(tokenDoc);
    if (canMove === false) {
      style.color = 0xFF0000;
      return style;
    }

    // 2. Get Distance
    // In V13, 'cost' represents the cumulative distance traversed at this waypoint.
    const distance = waypoint.measurement.cost;

    // 3. Vehicle rule: green up to move.value, red after.
    if (actor.type === "vehicle") {
      const move = Number(actor.system.move?.value) || 0;
      if (move <= 0) return style;
      style.color = (distance <= move + 0.1) ? 0x39ff14 : 0xFF0000;
      return style;
    }

    // 4. Character/NPC SLA speeds
    const closing = Number(actor.system.move?.closing) || 0;
    const rushing = Number(actor.system.move?.rushing) || 0;
    
    // If speeds are 0 (e.g. Immobile or not set), keep default color
    if (closing === 0 && rushing === 0) return style;

    // 5. Apply Colors
    // We add a tiny buffer (-0.1) to handle floating point inconsistencies (e.g. 1.9999 vs 2)
    if (distance <= closing + 0.1) {
        style.color = 0x39ff14; // SLA Neon Green (Closing)
    } 
    else if (distance <= rushing + 0.1) {
        style.color = 0xFFFF00; // Yellow (Rushing)
    } 
    else {
        style.color = 0xFF0000; // Red (Over Limit)
    }

    return style;
  }
}