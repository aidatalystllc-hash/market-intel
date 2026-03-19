import { NextRequest, NextResponse } from 'next/server';
import { list, getDownloadUrl } from '@vercel/blob';

export const dynamic = 'force-dynamic';

/**
 * Load a specific dataset by ID, or the latest dataset if no ID provided.
 * Uses getDownloadUrl for signed access to private blobs.
 */
export async function GET(req: NextRequest) {
  try {
    const datasetId = req.nextUrl.searchParams.get('d');

    if (datasetId) {
      const { blobs } = await list({ prefix: `datasets/${datasetId}` });

      if (blobs.length === 0) {
        return NextResponse.json({ data: null, message: `Dataset "${datasetId}" not found.` });
      }

      const signedUrl = await getDownloadUrl(blobs[0].url);
      const res = await fetch(signedUrl);
      if (!res.ok) {
        return NextResponse.json({ data: null, message: `Could not load dataset (HTTP ${res.status}).` });
      }

      const data = await res.json();
      return NextResponse.json({ data, uploadedAt: blobs[0].uploadedAt });
    }

    // No ID — load the most recent dataset
    const { blobs } = await list({ prefix: 'datasets/' });

    if (blobs.length === 0) {
      return NextResponse.json({ data: null, message: 'No data uploaded yet.' });
    }

    const latest = blobs.sort((a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];

    const signedUrl = await getDownloadUrl(latest.url);
    const res = await fetch(signedUrl);
    if (!res.ok) {
      return NextResponse.json({ data: null, message: 'Could not load data.' });
    }

    const data = await res.json();
    return NextResponse.json({ data, uploadedAt: latest.uploadedAt });
  } catch (err) {
    console.error('Load data error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('BLOB_READ_WRITE_TOKEN') || message.includes('not configured')) {
      return NextResponse.json({
        data: null,
        message: 'Server storage not configured.',
        fallbackToLocal: true,
      });
    }

    return NextResponse.json({ data: null, message: `Error: ${message}` }, { status: 500 });
  }
}
