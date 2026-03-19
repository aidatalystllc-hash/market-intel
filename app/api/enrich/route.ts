import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

// Enrichment types that a PE executive would actually find valuable
const ENRICH_TYPES = {
  contacts: {
    label: 'Contact Info',
    pages: ['', '/contact', '/about', '/contact-us', '/about-us'],
    prompt: `Extract ALL contact information from this webpage. Return ONLY valid JSON with these fields (include only what you find):
- phone: main business phone number
- email: main business email
- address: full business address
- social: object with linkedin, facebook, instagram, twitter URLs
Be thorough — check headers, footers, and sidebar content.`,
  },
  services: {
    label: 'Services & Pricing',
    pages: ['', '/services', '/pricing', '/our-services', '/what-we-do'],
    prompt: `Extract the company's services and any pricing information. Return ONLY valid JSON:
- services: array of service names offered (e.g., ["Spray Tanning", "UV Beds", "Red Light Therapy"])
- pricing: array of objects with {service, price, details} for any pricing found
- specialties: what they specialize in or are known for (1-2 sentences)`,
  },
  overview: {
    label: 'Company Overview',
    pages: ['', '/about', '/about-us', '/our-story'],
    prompt: `Extract a professional company overview suitable for an M&A intelligence report. Return ONLY valid JSON:
- description: 2-3 sentence company description (professional tone, factual)
- founded: year founded if mentioned
- leadership: array of {name, title} for any leadership team members mentioned
- locations_mentioned: number of locations or cities mentioned
- differentiators: what makes this company unique (1-2 sentences)
- certifications: any certifications, awards, or memberships mentioned`,
  },
  reviews: {
    label: 'Customer Sentiment',
    pages: ['', '/reviews', '/testimonials'],
    prompt: `Extract customer review/testimonial information. Return ONLY valid JSON:
- sentiment: "positive", "mixed", or "negative" based on overall tone
- highlights: array of 3-5 short positive themes customers mention
- concerns: array of any negative themes or complaints if visible
- testimonial_count: approximate number of testimonials shown
- sample_quotes: array of 2-3 short representative customer quotes`,
  },
} as const;

type EnrichType = keyof typeof ENRICH_TYPES;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { domain, enrichType = 'overview' } = body as {
      url?: string;
      type?: string;
      domain: string;
      enrichType?: EnrichType;
    };

    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey || firecrawlKey === 'your_key_here') {
      return NextResponse.json({
        error: 'Enrichment requires a Firecrawl API key. Contact your administrator.',
        enrichedData: null,
      });
    }

    if (!domain) {
      return NextResponse.json({ error: 'No domain provided.', enrichedData: null }, { status: 400 });
    }

    const config = ENRICH_TYPES[enrichType] || ENRICH_TYPES.overview;

    // Try scraping multiple relevant pages — use the first one that returns content
    let markdown = '';
    let scrapedUrl = '';

    for (const path of config.pages) {
      const targetUrl = `https://${domain}${path}`;
      try {
        const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${firecrawlKey}`,
          },
          body: JSON.stringify({ url: targetUrl, formats: ['markdown'] }),
        });

        if (scrapeRes.ok) {
          const data = await scrapeRes.json();
          const content = data?.data?.markdown || '';
          if (content.length > 200) { // Only use if substantial content found
            markdown = content;
            scrapedUrl = targetUrl;
            break;
          }
        }
      } catch {
        continue; // Try next page
      }
    }

    if (!markdown) {
      return NextResponse.json({
        error: `Could not find readable content on ${domain}. The site may be blocking scrapers.`,
        enrichedData: null,
      });
    }

    // Try Claude for structured extraction
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    let enrichedData: Record<string, unknown> = {};

    if (anthropicKey && anthropicKey !== 'your_key_here') {
      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey: anthropicKey });

        const response = await client.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: `${config.prompt}\n\nWebpage content from ${scrapedUrl}:\n${markdown.slice(0, 4000)}`,
          }],
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          enrichedData = JSON.parse(jsonMatch[0]);
        }
      } catch (err) {
        console.error('Claude extraction failed:', err);
      }
    }

    // Fallback: basic extraction without Claude
    if (Object.keys(enrichedData).length === 0) {
      const cleaned = markdown
        .replace(/https?:\/\/[^\s)]+/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/[#*_|]/g, '')
        .replace(/Skip to (?:content|navigation|main)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      const phoneMatch = cleaned.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      const emailMatch = cleaned.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const sentences = cleaned.split(/[.!?]+/).filter((s: string) => s.trim().length > 40);

      if (phoneMatch) enrichedData.phone = phoneMatch[0];
      if (emailMatch) enrichedData.email = emailMatch[0];
      if (sentences.length > 0) enrichedData.description = sentences.slice(0, 2).join('. ').trim().slice(0, 250);
      enrichedData._note = 'Basic extraction only. Add an Anthropic API key for AI-powered enrichment.';
    }

    return NextResponse.json({
      enrichedData,
      enrichType,
      scrapedUrl,
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
