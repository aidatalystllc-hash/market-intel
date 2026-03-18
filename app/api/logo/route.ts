import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get('domain');

  if (!domain) {
    return new NextResponse(generateFallbackSVG('?', '#9e9488'), {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' },
    });
  }

  // Clean domain
  const cleanDomain = domain
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim();

  if (!cleanDomain) {
    return new NextResponse(generateFallbackSVG('?', '#9e9488'), {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' },
    });
  }

  try {
    // Try Clearbit Logo API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(
      `https://logo.clearbit.com/${cleanDomain}?size=128`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (res.ok) {
      const buffer = await res.arrayBuffer();
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': res.headers.get('content-type') || 'image/png',
          'Cache-Control': 'public, max-age=604800',
        },
      });
    }
  } catch {
    // Clearbit failed or timed out — fall through to fallback
  }

  // Fallback: colored circle with first letter
  const letter = cleanDomain.charAt(0).toUpperCase();
  const color = getColorForDomain(cleanDomain);

  return new NextResponse(generateFallbackSVG(letter, color), {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' },
  });
}

function generateFallbackSVG(letter: string, bgColor: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <circle cx="64" cy="64" r="64" fill="${bgColor}"/>
    <text x="64" y="64" text-anchor="middle" dominant-baseline="central" fill="white" font-family="system-ui,sans-serif" font-size="56" font-weight="600">${letter}</text>
  </svg>`;
}

function getColorForDomain(domain: string): string {
  // Simple hash to pick a consistent color
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#b03a1a', '#1a4f96', '#1a7040', '#7a1050', '#b07d10'];
  return colors[Math.abs(hash) % colors.length];
}
