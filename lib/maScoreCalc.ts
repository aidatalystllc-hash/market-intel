import type { Company } from './types';

/**
 * Calculate M&A Attractiveness Score (0-100).
 * Higher score = more attractive acquisition target.
 */
export function calcMAScore(company: Partial<Company>): number {
  let score = 0;

  // +30: not PE-backed (available target)
  if (!company.isPE) score += 30;

  // +20: locationCount between 3 and 20 (right size for roll-up)
  const lc = company.locationCount ?? 0;
  if (lc >= 3 && lc <= 20) score += 20;

  // +15: avgRating >= 4.5 (quality brand)
  if (company.avgRating && company.avgRating >= 4.5) score += 15;

  // +10: totalReviews >= 50 (proven customer base)
  if (company.totalReviews && company.totalReviews >= 50) score += 10;

  // +15: services includes 'Membership' or 'Subscription' (recurring revenue signal)
  const svcs = (company.services ?? []).map((s) => s.toLowerCase());
  if (svcs.some((s) => s.includes('membership') || s.includes('subscription'))) {
    score += 15;
  }

  // +10: founded before 2015 (established, likely owner-operated)
  if (company.founded && company.founded < 2015) score += 10;

  return Math.min(score, 100);
}

/**
 * Get label and color for M&A score.
 */
export function getMALabel(score: number): { label: string; color: string } {
  if (score >= 70) return { label: 'Strong Target', color: '#1a7040' };
  if (score >= 40) return { label: 'Potential Target', color: '#b07d10' };
  return { label: 'Monitor', color: '#b03a1a' };
}
