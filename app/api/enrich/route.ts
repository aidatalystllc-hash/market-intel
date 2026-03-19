import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, type, domain } = body as {
      url: string;
      type: 'company' | 'location';
      domain: string;
    };

    const apiKey = process.env.FIRECRAWL_API_KEY;

    if (!apiKey || apiKey === 'your_key_here') {
      return NextResponse.json({
        error: 'Enrichment requires a Firecrawl API key. Contact your administrator.',
        enrichedData: null,
      });
    }

    const targetUrl = url || (domain ? `https://${domain}` : '');
    if (!targetUrl) {
      return NextResponse.json(
        { error: 'No URL or domain provided.', enrichedData: null },
        { status: 400 }
      );
    }

    // Call Firecrawl API
    const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: targetUrl,
        formats: ['markdown'],
      }),
    });

    if (!scrapeRes.ok) {
      const errText = await scrapeRes.text();
      console.error('Firecrawl error:', scrapeRes.status, errText);
      return NextResponse.json({
        error: `Firecrawl returned ${scrapeRes.status}. The page may be unreachable or blocked.`,
        enrichedData: null,
      });
    }

    const scrapeData = await scrapeRes.json();
    const markdown = scrapeData?.data?.markdown || '';

    if (!markdown) {
      return NextResponse.json({
        error: 'Page was scraped but no readable content was found.',
        enrichedData: null,
      });
    }

    // Try to use Claude to structure the content, but don't fail if unavailable
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    let enrichedData: Record<string, unknown> = {};

    if (anthropicKey && anthropicKey !== 'your_key_here') {
      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey: anthropicKey });

        const prompt =
          type === 'company'
            ? `Extract structured company data from this scraped webpage. Return ONLY valid JSON with these fields (include only what you find): description, phone, services, about, pricing, hours.\n\nContent:\n${markdown.slice(0, 3000)}`
            : `Extract structured location data from this scraped page. Return ONLY valid JSON with these fields (include only what you find): hours, services, phone, address.\n\nContent:\n${markdown.slice(0, 3000)}`;

        const response = await client.messages.create({
          model: 'claude-sonnet-4-6-20250514',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          enrichedData = JSON.parse(jsonMatch[0]);
        }
      } catch (claudeErr) {
        console.error('Claude structuring failed, returning raw excerpt:', claudeErr);
        // Fall back to raw excerpt — still useful
      }
    }

    // If Claude didn't produce structured data, extract basic info from the markdown
    if (Object.keys(enrichedData).length === 0) {
      // Simple regex-based extraction as fallback
      const phoneMatch = markdown.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      const descriptionExcerpt = markdown.replace(/[#*_\[\]()]/g, '').slice(0, 500).trim();

      enrichedData = {
        description: descriptionExcerpt || undefined,
        phone: phoneMatch?.[0] || undefined,
        source: 'basic extraction (AI structuring unavailable)',
      };
    }

    return NextResponse.json({
      enrichedData,
      lastEnriched: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Enrich error:', message);
    return NextResponse.json({
      error: `Enrichment failed: ${message.slice(0, 150)}`,
      enrichedData: null,
    });
  }
}
