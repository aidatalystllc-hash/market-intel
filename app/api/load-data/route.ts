import { NextRequest, NextResponse } from 'next/server';
import { readBlob } from '@/lib/blobHelpers';
import { list } from '@vercel/blob';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const datasetId = req.nextUrl.searchParams.get('d');

    if (datasetId) {
      const data = await readBlob(`datasets/${datasetId}`);
      if (!data) {
        return NextResponse.json({ data: null, message: `Dataset "${datasetId}" not found.` });
      }
      return NextResponse.json({ data });
    }

    // No ID — find the most recent dataset
    const { blobs } = await list({ prefix: 'datasets/' });
    if (blobs.length === 0) {
      return NextResponse.json({ data: null, message: 'No data uploaded yet.' });
    }

    const latest = blobs.sort((a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];

    // Extract dataset ID from path: "datasets/market-abc123.json" → "market-abc123"
    const latestId = latest.pathname.replace('datasets/', '').replace('.json', '');
    const data = await readBlob(`datasets/${latestId}`);
    if (!data) {
      return NextResponse.json({ data: null, message: 'Could not load latest dataset.' });
    }
    return NextResponse.json({ data });
  } catch (err) {
    console.error('Load data error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('BLOB_READ_WRITE_TOKEN')) {
      return NextResponse.json({ data: null, message: 'Server storage not configured.', fallbackToLocal: true });
    }
    return NextResponse.json({ data: null, message: `Error: ${message}` }, { status: 500 });
  }
}
