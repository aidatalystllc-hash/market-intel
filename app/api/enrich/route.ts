import { NextRequest, NextResponse } from 'next/server';

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
      return NextResponse.json(
        {
          error: 'Add FIRECRAWL_API_KEY to .env.local to enable enrichment',
          enrichedData: null,
        },
        { status: 200 }
      );
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
      console.error('Firecrawl error:', errText);
      return NextResponse.json(
        { error: 'Could not enrich at this time. Try again later.', enrichedData: null },
        { status: 200 }
      );
    }

    const scrapeData = await scrapeRes.json();
    const markdown = scrapeData?.data?.markdown || '';

    if (!markdown) {
      return NextResponse.json(
        { error: 'No content found on the page.', enrichedData: null },
        { status: 200 }
      );
    }

    // Use Claude to structure the scraped content
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey || anthropicKey === 'your_key_here') {
      return NextResponse.json({
        enrichedData: { description: markdown.slice(0, 500) },
        raw: markdown.slice(0, 1000),
      });
    }

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: anthropicKey });

    const prompt =
      type === 'company'
        ? `Extract structured company data from this scraped webpage content. Return JSON with any of these fields you can find: description, phone, services (comma-separated), socialLinks (object with linkedin, twitter, facebook, instagram URLs), about, pricing, hours. Only include fields you actually find.\n\nContent:\n${markdown.slice(0, 3000)}`
        : `Extract structured location data from this scraped page. Return JSON with any of these fields: hours, services (comma-separated), recentReviews (array of strings), phone, address. Only include fields you actually find.\n\nContent:\n${markdown.slice(0, 3000)}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const enrichedData = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return NextResponse.json({
      enrichedData,
      lastEnriched: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Enrich error:', err);
    return NextResponse.json(
      { error: 'Could not enrich at this time. Try again later.', enrichedData: null },
      { status: 200 }
    );
  }
}
