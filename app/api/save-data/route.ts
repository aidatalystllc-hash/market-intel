import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const maxDuration = 30;

/**
 * Save processed company data to Vercel Blob with a unique dataset ID.
 * Each upload gets its own ID so multiple datasets can coexist.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companies, industryName, warnings } = body;

    if (!companies || !Array.isArray(companies)) {
      return NextResponse.json({ error: 'No companies data provided.' }, { status: 400 });
    }

    // Generate a unique dataset ID: industry slug + short random string
    const slug = (industryName || 'market')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30);
    const rand = Math.random().toString(36).slice(2, 8);
    const datasetId = `${slug}-${rand}`;

    const payload = JSON.stringify({
      companies,
      industryName: industryName || 'Market',
      warnings: warnings || [],
      datasetId,
      savedAt: new Date().toISOString(),
    });

    // Save to Vercel Blob with unique filename
    const blob = await put(`datasets/${datasetId}.json`, payload, {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });

    return NextResponse.json({
      success: true,
      datasetId,
      url: blob.url,
      shareLink: `/?d=${datasetId}`,
      size: payload.length,
      companiesCount: companies.length,
    });
  } catch (err) {
    console.error('Save data error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to save data: ${message}` }, { status: 500 });
  }
}
