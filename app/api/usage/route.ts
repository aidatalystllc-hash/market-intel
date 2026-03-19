import { NextRequest, NextResponse } from 'next/server';
import { loadUsage } from '@/lib/usageTracker';

export const dynamic = 'force-dynamic';

/**
 * GET /api/usage?d=datasetId
 * Returns usage stats for a dataset (how much has been spent on enrichment).
 */
export async function GET(req: NextRequest) {
  const datasetId = req.nextUrl.searchParams.get('d');

  if (!datasetId) {
    return NextResponse.json({ error: 'Dataset ID required (?d=...)' }, { status: 400 });
  }

  try {
    const usage = await loadUsage(datasetId);
    return NextResponse.json({
      datasetId: usage.datasetId,
      totalCost: `$${usage.totalEstimatedCost.toFixed(4)}`,
      totalCalls: usage.totalCalls,
      remaining: `$${Math.max(0, usage.capUsd - usage.totalEstimatedCost).toFixed(4)}`,
      cap: `$${usage.capUsd.toFixed(2)}`,
      percentUsed: Math.min(100, (usage.totalEstimatedCost / usage.capUsd) * 100).toFixed(1),
      firecrawlCredits: usage.totalFirecrawlCredits,
      lastUsed: usage.updatedAt,
      recentHistory: usage.history.slice(-10),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('BLOB_READ_WRITE_TOKEN')) {
      return NextResponse.json({ error: 'Blob storage not configured.' }, { status: 500 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
