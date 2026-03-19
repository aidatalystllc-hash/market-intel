import { NextRequest, NextResponse } from 'next/server';
import { readBlob } from '@/lib/blobHelpers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const datasetId = req.nextUrl.searchParams.get('d');

  if (!datasetId) {
    return NextResponse.json({ error: 'Dataset ID required (?d=...)' }, { status: 400 });
  }

  try {
    const usage = await readBlob(`usage/${datasetId}`) as Record<string, unknown> | null;

    if (!usage) {
      return NextResponse.json({
        datasetId,
        totalCost: '$0.0000',
        totalCalls: 0,
        remaining: '$3.0000',
        cap: '$3.00',
        percentUsed: '0.0',
        firecrawlCredits: 0,
        recentHistory: [],
        note: 'No enrichment usage recorded yet for this dataset.',
      });
    }

    const cap = parseFloat(process.env.ENRICHMENT_CAP_USD || '3');
    const totalCost = (usage.totalEstimatedCost as number) || 0;

    return NextResponse.json({
      datasetId: usage.datasetId || datasetId,
      totalCost: `$${totalCost.toFixed(4)}`,
      totalCalls: usage.totalCalls || 0,
      remaining: `$${Math.max(0, cap - totalCost).toFixed(4)}`,
      cap: `$${cap.toFixed(2)}`,
      percentUsed: ((totalCost / cap) * 100).toFixed(1),
      firecrawlCredits: usage.totalFirecrawlCredits || 0,
      lastUsed: usage.updatedAt,
      recentHistory: (Array.isArray(usage.history) ? usage.history : []).slice(-10),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
