import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

// Enrichment types focused on data NOT already in the uploaded files
const ENRICH_TYPES = {
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
  'location-news': {
    label: 'Location News',
    pages: [],
    prompt: '', // Generated dynamically with date cutoff + location context
    useWebSearch: true,
  },
  'location-pricing': {
    label: 'Location Pricing & Services',
    pages: [],
    prompt: `Extract pricing and service details specific to this business location. Return ONLY valid JSON:
- services_at_location: array of services available at THIS specific location
- pricing: array of {service, price, details} for any pricing found
- membership_options: array of {name, price, benefits} if membership/subscription plans exist at this location
- specials: any current promotions or special offers at this location — include expiration dates if visible
- packages: array of {name, price, includes} for any bundled offerings
- differentiators: what makes this location's services unique (1 sentence)`,
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

// Helper: location-specific enrichment types
const LOCATION_TYPES: EnrichType[] = ['location-news', 'location-pricing', 'location-detail'];

function isLocationType(t: EnrichType): boolean {
  return LOCATION_TYPES.includes(t);
}

// Helper: build Firecrawl search query for a given enrichment type
function buildSearchQuery(
  enrichType: EnrichType,
  domain: string,
  locationName?: string,
  locationCity?: string,
  locationState?: string,
): string {
  const companyName = domain.replace(/\.(com|net|org|io|co|us|biz)$/i, '').replace(/[.-]/g, ' ');
  const locationParts = [locationName, locationCity, locationState].filter(Boolean).join(' ');

  switch (enrichType) {
    case 'recent-news':
      return `"${companyName}" news recent ${new Date().getFullYear()}`;
    case 'location-news':
      return `"${companyName}" ${locationParts} news recent ${new Date().getFullYear()}`;
    case 'location-pricing':
      return `"${companyName}" ${locationParts} pricing services membership`;
    case 'location-detail':
      return [locationName, locationCity, locationState, domain].filter(Boolean).join(' ');
    case 'services-pricing':
      return `"${companyName}" services pricing membership`;
    default:
      return companyName;
  }
}

// Helper: try Claude web search to find additional content
async function tryClaudeWebSearch(
  anthropicKey: string,
  searchQuery: string,
  contextDescription: string,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: anthropicKey });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (client.messages.create as any)({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{
        role: 'user',
        content: `Search the web for: ${searchQuery}\n\nContext: ${contextDescription}\n\nReturn all relevant information you find as plain text, including dates, sources, and key facts. Be thorough and include as much detail as possible.`,
      }],
    });

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;

    // Extract text from the response (may have multiple content blocks from tool use)
    let content = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text + '\n';
      }
    }

    return { content: content.trim(), inputTokens, outputTokens };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Claude web search failed (graceful fallback):', errMsg);
    return { content: '', inputTokens: 0, outputTokens: 0 };
  }
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

    // Build the extraction prompt — use dynamic prompt for news types
    let prompt = '';
    if (enrichType === 'recent-news' || enrichType === 'location-news') {
      prompt = getNewsPrompt();
    } else {
      prompt = config.prompt;
    }

    // Track how many Firecrawl search and scrape credits are used
    let firecrawlSearchCredits = 0;
    let firecrawlScrapeCredits = 0;

    // ─── STEP A: Firecrawl search/scrape to get content ───
    let markdown = '';
    let scrapedUrl = '';

    if (enrichType === 'location-detail' || enrichType === 'location-news' || enrichType === 'location-pricing') {
      // Location-specific enrichment: search for the specific location page
      const locationQuery = buildSearchQuery(enrichType, domain, locationName, locationCity, locationState);

      // Try Firecrawl search first to find the location's page
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
        firecrawlSearchCredits++;

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

        const pagesToTry = [
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
            firecrawlScrapeCredits++;

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
      const searchQuery = buildSearchQuery(enrichType, domain);
      try {
        const searchRes = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${firecrawlKey}`,
          },
          body: JSON.stringify({
            query: searchQuery,
            limit: 5,
          }),
        });
        firecrawlSearchCredits++;

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
        const pagesToTry = config.pages.map((path) => `https://${domain}${path}`);
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
            firecrawlScrapeCredits++;

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
      const pagesToTry = config.pages.map((path: string) => `https://${domain}${path}`);
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
          firecrawlScrapeCredits++;

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

    // ─── STEP B: Claude web search as additional source ───
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    let webSearchContent = '';
    let sonnetInputTokens = 0;
    let sonnetOutputTokens = 0;

    if (anthropicKey && anthropicKey !== 'your_key_here') {
      // Determine if we should try Claude web search (always try, but especially if Firecrawl didn't find enough)
      const webSearchQuery = buildSearchQuery(enrichType, domain, locationName, locationCity, locationState);
      let contextDescription = '';

      switch (enrichType) {
        case 'recent-news':
          contextDescription = `Looking for recent news about the company at ${domain} from the last 6 months.`;
          break;
        case 'location-news':
          contextDescription = `Looking for recent news about ${locationName || domain} in ${locationCity || 'unknown'}, ${locationState || ''} from the last 6 months.`;
          break;
        case 'location-pricing':
          contextDescription = `Looking for pricing, services, and membership information at ${locationName || domain} in ${locationCity || 'unknown'}, ${locationState || ''}.`;
          break;
        case 'location-detail':
          contextDescription = `Looking for details about the ${locationName || domain} location in ${locationCity || 'unknown'}, ${locationState || ''} including hours, services, staff, and contact info.`;
          break;
        case 'services-pricing':
          contextDescription = `Looking for service offerings, pricing, and membership options at ${domain}.`;
          break;
        default:
          contextDescription = `Looking for business information about ${domain}.`;
      }

      const webSearchResult = await tryClaudeWebSearch(anthropicKey, webSearchQuery, contextDescription);
      webSearchContent = webSearchResult.content;
      sonnetInputTokens = webSearchResult.inputTokens;
      sonnetOutputTokens = webSearchResult.outputTokens;
    }

    // Combine Firecrawl content and web search content
    if (webSearchContent && webSearchContent.length > 100) {
      if (markdown) {
        markdown = markdown + '\n\n--- Additional web search results ---\n\n' + webSearchContent;
      } else {
        markdown = webSearchContent;
        scrapedUrl = scrapedUrl || 'claude web search';
      }
    }

    if (!markdown) {
      return NextResponse.json({
        error: `Could not find readable content on ${domain}. The site may be blocking scrapers.`,
        enrichedData: null,
      });
    }

    // ─── STEP C: Claude Haiku extraction of structured JSON ───
    let enrichedData: Record<string, unknown> = {};
    let haikuInputTokens = 0;
    let haikuOutputTokens = 0;

    if (anthropicKey && anthropicKey !== 'your_key_here') {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: anthropicKey });

      // For location enrichment, add location context to the prompt (type-aware)
      let contextualPrompt = prompt;
      if (isLocationType(enrichType) && (locationCity || locationName)) {
        const locDesc = `${locationName || 'location'} in ${locationCity || 'unknown city'}, ${locationState || ''}`;
        if (enrichType === 'location-news') {
          contextualPrompt += `\n\nIMPORTANT: I am looking for recent news specifically about or near the ${locDesc}. Focus on local events, openings, closings, renovations, or community involvement at this specific location.`;
        } else if (enrichType === 'location-pricing') {
          contextualPrompt += `\n\nIMPORTANT: I am looking for pricing specifically at the ${locDesc}. Extract ALL pricing tiers, membership options, session prices, and packages for THIS specific location. Include every price you find.`;
        } else {
          contextualPrompt += `\n\nIMPORTANT: I am looking for information specifically about the ${locDesc}. Extract hours, services, amenities, and contact info for THIS specific location only.`;
        }
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

          haikuInputTokens = response.usage?.input_tokens ?? 0;
          haikuOutputTokens = response.usage?.output_tokens ?? 0;

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

    // ─── STEP D: Record usage for cost tracking ───
    let costInfo = { estimated: 0, remaining: budgetRemaining, trackingError: '', saved: false };
    if (datasetId) {
      try {
        // Cost constants
        const FIRECRAWL_SEARCH_COST = 0.0053; // per search
        const FIRECRAWL_SCRAPE_COST = 0.0053; // per scrape credit
        const HAIKU_IN_COST = 0.00025 / 1000;  // $0.00025 per 1K input tokens
        const HAIKU_OUT_COST = 0.00125 / 1000;  // $0.00125 per 1K output tokens
        const SONNET_IN_COST = 0.003 / 1000;    // $0.003 per 1K input tokens
        const SONNET_OUT_COST = 0.015 / 1000;   // $0.015 per 1K output tokens

        const firecrawlCost = firecrawlSearchCredits * FIRECRAWL_SEARCH_COST + firecrawlScrapeCredits * FIRECRAWL_SCRAPE_COST;
        const haikuCost = haikuInputTokens * HAIKU_IN_COST + haikuOutputTokens * HAIKU_OUT_COST;
        const sonnetCost = sonnetInputTokens * SONNET_IN_COST + sonnetOutputTokens * SONNET_OUT_COST;
        const cost = firecrawlCost + haikuCost + sonnetCost;

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

        const totalFirecrawlCredits = firecrawlSearchCredits + firecrawlScrapeCredits;

        // Update
        usage.totalEstimatedCost += cost;
        usage.totalCalls += 1;
        usage.totalFirecrawlCredits += totalFirecrawlCredits;
        usage.history.push({
          timestamp: new Date().toISOString(),
          enrichType: enrichType || 'unknown',
          domain,
          firecrawlSearchCredits,
          firecrawlScrapeCredits,
          haikuInputTokens,
          haikuOutputTokens,
          sonnetInputTokens,
          sonnetOutputTokens,
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
