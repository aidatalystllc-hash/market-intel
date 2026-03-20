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
- acquisitions: array of {company, date, details} for any acquisitions mentioned — always include the date if mentioned (e.g., "January 2024")
- investors: array of investor/firm names mentioned
- funding: any funding rounds or investment amounts mentioned, include dates (e.g., "Series B $20M (March 2023)")
- ownership_notes: any other relevant ownership information with dates when changes occurred (1-2 sentences)
If no PE/acquisition info is found, return {"pe_backed": false, "ownership_notes": "No PE or acquisition information found on this page."}`,
  },
  'recent-news': {
    label: 'Recent News & Growth',
    pages: ['', '/news', '/press', '/blog', '/press-releases'],
    prompt: '', // Generated dynamically with date cutoff
    useWebSearch: true,
  },
  'services-pricing': {
    label: 'Services & Pricing',
    pages: ['/services', '/pricing', '/our-services', '/what-we-do', '/membership', '/memberships', '/specials', ''],
    prompt: `Extract detailed service offerings and pricing from this business webpage. Return ONLY valid JSON:
- services: array of service names offered
- pricing: array of {service, price, details} for any pricing found (memberships, packages, etc.)
- membership_options: array of {name, price, benefits} if membership/subscription plans exist
- specials: any current promotions or special offers — include expiration dates if visible (e.g., "20% off through March 2024")
- differentiators: what makes their services unique (1 sentence)`,
  },
  'location-detail': {
    label: 'This Location',
    pages: [], // URL built dynamically from location info
    prompt: `Extract location-specific details from this business location page. Return ONLY valid JSON:
- hours: business hours (formatted nicely)
- services_at_location: array of services available at THIS specific location
- local_phone: phone number for this location
- local_address: full address
- local_pricing: any location-specific pricing (membership tiers, session prices, packages — include ALL pricing you see)
- membership_options: array of {name, price, benefits} if membership/subscription plans exist at this location
- staff: array of {name, role} for any staff members listed
- amenities: array of amenities or features at this location
- booking_link: URL for booking/scheduling if found`,
  },
} as const;

type EnrichType = keyof typeof ENRICH_TYPES;

function getNewsPrompt(): string {
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const cutoffStr = sixMonthsAgo.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const todayStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return `You are a business news analyst. Today's date is ${todayStr}. Extract ONLY recent news from the last 6 months (since ${cutoffStr}). IMPORTANT: Do NOT include any news older than ${cutoffStr}. If a news item doesn't have a clear date, skip it. If all news is older than ${cutoffStr}, return {"recent_news": [], "growth_signals": "No recent news found in the last 6 months."}.

Return ONLY valid JSON:
- recent_news: array of {headline, date, summary} for news items from the last 6 months ONLY (max 5). Always include the date. Exclude anything before ${cutoffStr}.
- new_locations: string with date if mentioned (e.g., "Opened Kansas City location (March 2026)")
- partnerships: string with date if mentioned
- awards: string with date if mentioned
- growth_signals: 1-2 sentences summarizing recent growth trajectory based on what you see`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { domain, enrichType = 'services-pricing', locationUrl, locationName, locationCity, locationState, datasetId } = body as {
      domain: string;
      enrichType?: EnrichType;
      locationUrl?: string;
      locationName?: string;
      locationCity?: string;
      locationState?: string;
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

    // Build the prompt — use dynamic prompt for news
    let prompt = '';
    if (enrichType === 'recent-news') {
      prompt = getNewsPrompt();
    } else {
      prompt = config.prompt;
    }

    // Determine which URLs to scrape
    let pagesToTry: string[];
    let markdown = '';
    let scrapedUrl = '';

    if (enrichType === 'location-detail') {
      // For location-specific enrichment, try to find the specific location page
      // Strategy: Use Firecrawl search to find the location's page on the company website
      const locationQuery = [locationName, locationCity, locationState, domain].filter(Boolean).join(' ');

      // Try Firecrawl search first to find the specific location page
      let locationPageUrl = '';
      try {
        const searchRes = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${firecrawlKey}`,
          },
          body: JSON.stringify({
            query: locationQuery,
            limit: 5,
          }),
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const results = searchData?.data || [];
          // Look for a result on the company domain that mentions the city/location
          for (const r of results) {
            const url = r.url || '';
            const content = (r.markdown || r.description || '').toLowerCase();
            if (url.includes(domain) && (
              (locationCity && content.includes(locationCity.toLowerCase())) ||
              (locationName && content.includes(locationName.toLowerCase()))
            )) {
              locationPageUrl = url;
              markdown = r.markdown || '';
              scrapedUrl = url;
              break;
            }
          }
          // If no domain-specific match, try the first result that has content about this location
          if (!locationPageUrl && results.length > 0) {
            for (const r of results) {
              if (r.markdown && r.markdown.length > 200) {
                locationPageUrl = r.url || '';
                markdown = r.markdown;
                scrapedUrl = r.url || '';
                break;
              }
            }
          }
        }
      } catch {
        // Search failed, fall back to direct scraping
      }

      // If search didn't work, try common location URL patterns on the company domain
      if (!markdown) {
        const citySlug = (locationCity || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const stateSlug = (locationState || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const nameSlug = (locationName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

        pagesToTry = [
          locationUrl, // Explicit URL if provided
          `https://${domain}/locations/${citySlug}`,
          `https://${domain}/location/${citySlug}`,
          `https://${domain}/locations/${stateSlug}/${citySlug}`,
          `https://${domain}/location/${stateSlug}/${citySlug}`,
          `https://${domain}/${citySlug}`,
          `https://${domain}/locations/${nameSlug}`,
          `https://${domain}/locations`,
          `https://${domain}`,
        ].filter(Boolean) as string[];

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
              // Check if this page mentions the specific city/location
              const contentLower = content.toLowerCase();
              const isRelevant = content.length > 200 && (
                (locationCity && contentLower.includes(locationCity.toLowerCase())) ||
                (locationName && contentLower.includes(locationName.toLowerCase())) ||
                targetUrl.includes(citySlug)
              );
              if (isRelevant) {
                markdown = content;
                scrapedUrl = targetUrl;
                break;
              }
              // Fallback: accept any substantial content if we've tried enough URLs
              if (!markdown && content.length > 200) {
                markdown = content;
                scrapedUrl = targetUrl;
              }
            }
          } catch {
            continue;
          }
        }
      }
    } else if (enrichType === 'recent-news' && 'useWebSearch' in config && config.useWebSearch) {
      // For news, try web search first to get recent results
      const companyName = domain.replace(/\.(com|net|org|io|co)$/i, '').replace(/[.-]/g, ' ');
      try {
        const searchRes = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${firecrawlKey}`,
          },
          body: JSON.stringify({
            query: `"${companyName}" news recent ${new Date().getFullYear()}`,
            limit: 5,
          }),
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const results = searchData?.data || [];
          // Combine top results into a single markdown for Claude to analyze
          const combined = results
            .filter((r: { markdown?: string }) => r.markdown && r.markdown.length > 100)
            .slice(0, 3)
            .map((r: { url?: string; markdown?: string }) => `Source: ${r.url || 'unknown'}\n${(r.markdown || '').slice(0, 2000)}`)
            .join('\n\n---\n\n');
          if (combined.length > 200) {
            markdown = combined;
            scrapedUrl = 'web search results';
          }
        }
      } catch {
        // Search failed, fall back to scraping
      }

      // Fall back to scraping company website
      if (!markdown) {
        pagesToTry = config.pages.map((path) => `https://${domain}${path}`);
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
      }
    } else {
      // Standard enrichment — scrape company pages
      pagesToTry = config.pages.map((path) => `https://${domain}${path}`);
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

      // For location enrichment, add location context to the prompt
      let contextualPrompt = prompt;
      if (enrichType === 'location-detail' && (locationCity || locationName)) {
        contextualPrompt += `\n\nIMPORTANT: I am looking for information specifically about the ${locationName || 'location'} in ${locationCity || 'unknown city'}, ${locationState || ''}. Extract pricing, hours, and services for THIS specific location only. If you see pricing tiers or membership options, include ALL of them with their prices.`;
      }

      // Try up to 2 times with a delay for rate limiting
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await client.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1500,
            messages: [{
              role: 'user',
              content: `${contextualPrompt}\n\nWebpage content from ${scrapedUrl}:\n${markdown.slice(0, 5000)}`,
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

    // Record usage for cost tracking — inline to avoid module import issues
    let costInfo = { estimated: 0, remaining: budgetRemaining, trackingError: '', saved: false };
    if (datasetId) {
      try {
        // @vercel/blob used via blobHelpers below
        const firecrawlCreditsUsed = 1;
        const FIRECRAWL_COST = 0.0053;
        const CLAUDE_IN_COST = 0.00025 / 1000;
        const CLAUDE_OUT_COST = 0.00125 / 1000;
        const cost = firecrawlCreditsUsed * FIRECRAWL_COST + claudeInputTokens * CLAUDE_IN_COST + claudeOutputTokens * CLAUDE_OUT_COST;

        // Load existing usage
        let usage = { totalEstimatedCost: 0, totalCalls: 0, totalFirecrawlCredits: 0, history: [] as unknown[] };
        try {
          const { readBlob } = await import('@/lib/blobHelpers');
          const existing = await readBlob(`usage/${datasetId}`);
          if (existing && typeof existing === 'object') {
            usage = existing as typeof usage;
          }
        } catch (loadErr) {
          console.error('Usage load failed:', loadErr);
        }

        // Update
        usage.totalEstimatedCost += cost;
        usage.totalCalls += 1;
        usage.totalFirecrawlCredits += firecrawlCreditsUsed;
        usage.history.push({
          timestamp: new Date().toISOString(),
          enrichType: enrichType || 'unknown',
          domain,
          firecrawlCredits: firecrawlCreditsUsed,
          claudeInputTokens,
          claudeOutputTokens,
          estimatedCost: cost,
        });
        if (usage.history.length > 100) usage.history = usage.history.slice(-100);

        // Save
        const savePayload = JSON.stringify({
          datasetId,
          ...usage,
          capUsd: parseFloat(process.env.ENRICHMENT_CAP_USD || '3'),
          updatedAt: new Date().toISOString(),
        });

        const { writeBlob } = await import('@/lib/blobHelpers');
        const saveUrl = await writeBlob(`usage/${datasetId}.json`, JSON.parse(savePayload));

        costInfo = {
          estimated: cost,
          remaining: Math.max(0, (parseFloat(process.env.ENRICHMENT_CAP_USD || '3')) - usage.totalEstimatedCost),
          trackingError: '',
          saved: true,
        };
        console.log(`Usage saved: ${saveUrl}, total=$${usage.totalEstimatedCost.toFixed(4)}, calls=${usage.totalCalls}`);
      } catch (trackErr) {
        const msg = trackErr instanceof Error ? trackErr.message : String(trackErr);
        console.error('Usage tracking failed:', msg);
        costInfo.trackingError = msg;
      }
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
      debug: {
        trackingSaved: costInfo.saved,
        trackingError: costInfo.trackingError || null,
      },
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
