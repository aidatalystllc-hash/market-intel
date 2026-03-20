/**
 * Calculate footprint classification based on location count, state count, and employee size.
 *
 * National:  Must operate in 5+ states, OR 10+ states with any location count,
 *            OR have 501+ employees AND be in 3+ states.
 * Regional:  Operates in 2-4 states, OR has 3+ locations in a single state,
 *            OR has 201-500 employees.
 * Single Loc: Everything else (1-2 locations in 1 state, small team).
 */
export function calcFootprint(
  locationCount: number,
  stateCount: number,
  employeeSize: string
): 'national' | 'regional' | 'local' {
  // Normalize employee size: strip commas and spaces for comparison
  const normalized = employeeSize.replace(/[,\s]/g, '').toLowerCase();

  const bigSizes = ['501-1000', '1001-5000', '5001-10000', '10001+', '10,001+'];
  const midSizes = ['201-500'];

  const isBig = bigSizes.some((s) => normalized === s.replace(/[,\s]/g, ''));
  const isMid = midSizes.some((s) => normalized === s.replace(/[,\s]/g, ''));

  // National: must have real multi-state presence
  // - 5+ states with significant locations, OR
  // - 10+ states regardless of location count, OR
  // - 501+ employees AND 3+ states
  if (stateCount >= 10) {
    return 'national';
  }
  if (stateCount >= 5 && locationCount >= 10) {
    return 'national';
  }
  if (isBig && stateCount >= 3) {
    return 'national';
  }

  // Regional: multi-state or multi-location within a state
  if (stateCount >= 2) {
    return 'regional';
  }
  if (locationCount >= 3) {
    return 'regional';
  }
  if (isMid) {
    return 'regional';
  }

  return 'local';
}
