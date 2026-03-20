/**
 * Calculate footprint classification based on location count, state count, and employee size.
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

  if (locationCount >= 20 || isBig) {
    return 'national';
  }
  if (locationCount >= 3 || stateCount >= 2 || isMid) {
    return 'regional';
  }
  return 'local';
}
