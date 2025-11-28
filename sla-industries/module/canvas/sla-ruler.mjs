/**
 * Custom Ruler for SLA Industries.
 * Automatically detects Closing/Rushing speeds for color coding.
 */
export class SLARuler extends Ruler {

  /** * @override 
   * This function controls the color of the ruler line.
   */
  _highlightMeasurement(ray) {
    // 1. Get the token being dragged
    const token = this.user.activity?.token || canvas.tokens.controlled[0];
    
    // If no token (or no actor data), use default behavior
    if (!token?.actor) return super._highlightMeasurement(ray);

    // 2. Get SLA Speeds directly from the Actor
    const closing = token.actor.system.move?.closing || 0;
    const rushing = token.actor.system.move?.rushing || 0;
    
    // 3. Calculate distance
    // 'this.totalDistance' tracks how far we have dragged so far
    const totalDistance = this.totalDistance;

    // 4. Determine Color
    let color = this.color; // Default User Color

    if (closing > 0) {
        if (totalDistance <= closing) {
            color = 0x00FF00; // GREEN (Closing)
        } else if (totalDistance <= rushing) {
            color = 0xFFFF00; // YELLOW (Rushing)
        } else {
            color = 0xFF0000; // RED (Maximum/Over)
        }
    }

    // 5. Apply Color and Draw
    this.color = color;
    super._highlightMeasurement(ray);
  }
}