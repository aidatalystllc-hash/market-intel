/**
 * Calculate footprint classification based on location count, state count, and employee size.
 */
export function calcFootprint(
  locationCount: number,
  stateCount: number,
  employeeSize: string
): 'national' | 'regional' | 'local' {
  const bigSizes = ['501-1000', '1001-5000', '5001-10000', '10001+'];
  const midSizes = ['201-500'];

  if (locationCount >= 20 || bigSizes.includes(employeeSize)) {
    return 'national';
  }
  if (locationCount >= 3 || stateCount >= 2 || midSizes.includes(employeeSize)) {
    return 'regional';
  }
  return 'local';
}
