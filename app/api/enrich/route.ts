import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

// Enrichment types focused on data NOT already in the uploaded files
const ENRICH_TYPES = {
  'pe-news': {
    label: 'PE & Acquisition Intel',
    pages: ['', '/news', '/press', '/about', '/about-us'],
    prompt: `You are an M&A research analyst. Extract any information about private equity ownership, acquisitions, mergers, investments, or ownership changes from this webpage. Return ONLY valid JSON:
- pe_backed: true/false based on any PE/investor mentions
- pe_firm: name of PE firm if mentioned
- acquisitions: array of {company, date, details} for any acquisitions mentioned
- investors: array of investor/firm names mentioned
- funding: any funding rounds or investment amounts mentioned
- ownership_notes: any other relevant ownership information (1-2 sentences)
If no PE/acquisition info is found, return {"pe_backed": false, "ownership_notes": "No PE or acquisition information found on this page."}`,
  },
  'recent-news': {
    label: 'Recent News & Growth',
    pages: ['', '/news', '/press', '/blog', '/press-releases'],
    prompt: `Extract recent news, announcements, and growth signals from this company's webpage. Return ONLY valid JSON:
- recent_news: array of {headline, date, summary} for any news items (max 5)
- new_locations: any mentions of new location openings, expansions, or new markets
- partnerships: any new partnerships or collaborations mentioned
- awards: any recent awards or recognitions
- growth_signals: 1-2 sentences summarizing growth trajectory based on what you see`,
  },
  'services-pricing': {
    label: 'Services & Pricing',
    pages: ['/services', '/pricing', '/our-services', '/what-we-do', '/membership', '/memberships', '/specials', ''],
    prompt: `Extract detailed service offerings and pricing from this business webpage. Return ONLY valid JSON:
- services: array of service names offered
- pricing: array of {service, price, details} for any pricing found (memberships, packages, etc.)
- membership_options: array of {name, price, benefits} if membership/subscription plans exist
- specials: any current promotions or special offers
- differentiators: what makes their services unique (1 sentence)`,
  },
  'location-detail': {
    label: 'This Location',
    pages: [], // URL provided directly
    prompt: `Extract location-specific details from this business location page. Return ONLY valid JSON:
- hours: business hours (formatted nicely)
- services_at_location: array of services available at THIS specific location
- local_phone: phone number for this location
- local_address: full address
- local_pricing: any location-specific pricing
- staff: array of {name, role} for any staff members listed
- amenities: array of amenities or features at this location
- booking_link: URL for booking/scheduling if found`,
  },
} as const;

type EnrichType = keyof typeof ENRICH_TYPES;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { domain, enrichType = 'services-pricing', locationUrl, datasetId } = body as {
      domain: string;
      enrichType?: EnrichType;
      locationUrl?: string;
      datasetId?: string;
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

    // Check budget if dataset ID is provided
    let budgetOk = true;
    let budgetRemaining = Infinity;
    if (datasetId) {
      try {
        const { checkBudget } = await import('@/lib/usageTracker');
        const budget = await checkBudget(datasetId);
        budgetOk = budget.allowed;
        budgetRemaining = budget.remaining;
      } catch {
        // If usage tracking fails (no blob store), allow the call
      }
    }

    if (!budgetOk) {
      return NextResponse.json({
        error: `Enrichment budget has been reached for this dataset. Maximum: $${process.env.ENRICHMENT_CAP_USD || '3.00'}. Contact your administrator to increase the limit.`,
        enrichedData: null,
        budgetExceeded: true,
        remaining: 0,
      });
    }

    const config = ENRICH_TYPES[enrichType] || ENRICH_TYPES['services-pricing'];

    // Determine which URLs to scrape
    let pagesToTry: string[];
    if (enrichType === 'location-detail' && locationUrl) {
      // For location-specific enrichment, try the provided URL directly
      pagesToTry = [locationUrl];
    } else {
      pagesToTry = config.pages.map((path) => `https://${domain}${path}`);
    }

    // Try scraping pages — use the first one that returns substantial content
    let markdown = '';
    let scrapedUrl = '';

    for (const targetUrl of pagesToTry) {
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
          if (content.length > 200) {
            markdown = content;
            scrapedUrl = targetUrl;
            break;
          }
        }
      } catch {
        continue;
      }
    }

    if (!markdown) {
      return NextResponse.json({
        error: `Could not find readable content on ${domain}. The site may be blocking scrapers.`,
        enrichedData: null,
      });
    }

    // Try Claude for structured extraction — track token usage
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    let enrichedData: Record<string, unknown> = {};
    let claudeInputTokens = 0;
    let claudeOutputTokens = 0;

    if (anthropicKey && anthropicKey !== 'your_key_here') {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: anthropicKey });

      // Try up to 2 times with a delay for rate limiting
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await client.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1500,
            messages: [{
              role: 'user',
              content: `${config.prompt}\n\nWebpage content from ${scrapedUrl}:\n${markdown.slice(0, 5000)}`,
            }],
          });

          claudeInputTokens = response.usage?.input_tokens ?? 0;
          claudeOutputTokens = response.usage?.output_tokens ?? 0;

          const text = response.content[0].type === 'text' ? response.content[0].text : '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            enrichedData = JSON.parse(jsonMatch[0]);
          }
          break; // Success — exit retry loop
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`Claude attempt ${attempt + 1} failed:`, errMsg);

          // If rate limited, wait and retry
          if (errMsg.includes('rate') || errMsg.includes('429') || errMsg.includes('overloaded')) {
            if (attempt === 0) {
              await new Promise((r) => setTimeout(r, 3000)); // Wait 3 seconds
              continue;
            }
          }
          break; // Non-rate-limit error, don't retry
        }
      }
    }

    // Fallback without Claude
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

    // Record usage for cost tracking
    let costInfo = { estimated: 0, remaining: budgetRemaining, trackingError: '' };
    if (datasetId) {
      try {
        const { recordUsage, estimateCost } = await import('@/lib/usageTracker');
        const firecrawlCreditsUsed = 1;
        const cost = estimateCost(firecrawlCreditsUsed, claudeInputTokens, claudeOutputTokens);
        console.log(`Recording usage for ${datasetId}: firecrawl=${firecrawlCreditsUsed}, claude=${claudeInputTokens}+${claudeOutputTokens}, cost=$${cost.toFixed(4)}`);
        const updatedUsage = await recordUsage(datasetId, {
          enrichType: enrichType || 'unknown',
          domain,
          firecrawlCredits: firecrawlCreditsUsed,
          claudeInputTokens,
          claudeOutputTokens,
        });
        costInfo = {
          estimated: cost,
          remaining: Math.max(0, updatedUsage.capUsd - updatedUsage.totalEstimatedCost),
          trackingError: '',
        };
        console.log(`Usage recorded. Total: $${updatedUsage.totalEstimatedCost.toFixed(4)}, calls: ${updatedUsage.totalCalls}`);
      } catch (trackErr) {
        const msg = trackErr instanceof Error ? trackErr.message : String(trackErr);
        console.error('Usage tracking failed:', msg);
        costInfo.trackingError = msg;
      }
    } else {
      console.log('No datasetId provided — usage not tracked');
    }

    return NextResponse.json({
      enrichedData,
      enrichType,
      scrapedUrl,
      lastEnriched: new Date().toISOString(),
      cost: {
        thisCall: `$${costInfo.estimated.toFixed(4)}`,
        remaining: `$${costInfo.remaining.toFixed(2)}`,
      },
      datasetId: datasetId || null,
      debug: costInfo.trackingError ? { trackingError: costInfo.trackingError } : undefined,
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
