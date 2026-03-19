import { NextResponse } from 'next/server';
import { list } from '@vercel/blob';

/**
 * Load the latest saved company data from Vercel Blob.
 * This is the public endpoint — anyone with the link can view the map.
 */
export async function GET() {
  try {
    // List blobs to find our data file
    const { blobs } = await list({ prefix: 'marketintel-data' });

    if (blobs.length === 0) {
      return NextResponse.json({ data: null, message: 'No data uploaded yet.' });
    }

    // Get the most recent blob
    const latest = blobs.sort((a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];

    // Fetch the blob content
    const res = await fetch(latest.url);
    if (!res.ok) {
      return NextResponse.json({ data: null, message: 'Could not load data.' });
    }

    const data = await res.json();

    return NextResponse.json({
      data,
      blobUrl: latest.url,
      uploadedAt: latest.uploadedAt,
    });
  } catch (err) {
    console.error('Load data error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';

    // If Vercel Blob is not configured, fall back gracefully
    if (message.includes('BLOB_READ_WRITE_TOKEN') || message.includes('not configured')) {
      return NextResponse.json({
        data: null,
        message: 'Server storage not configured. Data is stored locally in your browser.',
        fallbackToLocal: true,
      });
    }

    return NextResponse.json({ data: null, message: `Error: ${message}` }, { status: 500 });
  }
}
