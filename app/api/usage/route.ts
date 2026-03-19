import { NextRequest, NextResponse } from 'next/server';
import { list, getDownloadUrl } from '@vercel/blob';

export const dynamic = 'force-dynamic';

/**
 * GET /api/usage?d=datasetId
 * Returns usage stats for a dataset — reads directly from Vercel Blob.
 */
export async function GET(req: NextRequest) {
  const datasetId = req.nextUrl.searchParams.get('d');

  if (!datasetId) {
    return NextResponse.json({ error: 'Dataset ID required (?d=...)' }, { status: 400 });
  }

  try {
    const { blobs } = await list({ prefix: `usage/${datasetId}` });

    if (blobs.length === 0) {
      return NextResponse.json({
        datasetId,
        totalCost: '$0.0000',
        totalCalls: 0,
        remaining: '$3.0000',
        cap: '$3.00',
        percentUsed: '0.0',
        firecrawlCredits: 0,
        lastUsed: new Date().toISOString(),
        recentHistory: [],
        debug: { blobsFound: 0 },
      });
    }

    // Get a signed download URL for the private blob
    const signedUrl = await getDownloadUrl(blobs[0].url);
    const res = await fetch(signedUrl);

    if (!res.ok) {
      return NextResponse.json({
        error: `Could not read usage blob (HTTP ${res.status})`,
        debug: { blobUrl: blobs[0].url, signedUrl: signedUrl.slice(0, 80) + '...' },
      });
    }

    const usage = await res.json();
    const cap = parseFloat(process.env.ENRICHMENT_CAP_USD || '3');

    return NextResponse.json({
      datasetId: usage.datasetId || datasetId,
      totalCost: `$${(usage.totalEstimatedCost || 0).toFixed(4)}`,
      totalCalls: usage.totalCalls || 0,
      remaining: `$${Math.max(0, cap - (usage.totalEstimatedCost || 0)).toFixed(4)}`,
      cap: `$${cap.toFixed(2)}`,
      percentUsed: ((usage.totalEstimatedCost || 0) / cap * 100).toFixed(1),
      firecrawlCredits: usage.totalFirecrawlCredits || 0,
      lastUsed: usage.updatedAt || blobs[0].uploadedAt,
      recentHistory: (usage.history || []).slice(-10),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
