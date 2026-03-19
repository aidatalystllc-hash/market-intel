import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const maxDuration = 30;

/**
 * Save processed company data to Vercel Blob so it can be shared via URL.
 * Only callable from the admin upload flow.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companies, industryName, warnings } = body;

    if (!companies || !Array.isArray(companies)) {
      return NextResponse.json({ error: 'No companies data provided.' }, { status: 400 });
    }

    const payload = JSON.stringify({
      companies,
      industryName: industryName || 'Market',
      warnings: warnings || [],
      savedAt: new Date().toISOString(),
    });

    // Save to Vercel Blob
    const blob = await put('marketintel-data.json', payload, {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false, // Always overwrite the same file
    });

    return NextResponse.json({
      success: true,
      url: blob.url,
      size: payload.length,
      companiesCount: companies.length,
    });
  } catch (err) {
    console.error('Save data error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to save data: ${message}` }, { status: 500 });
  }
}
