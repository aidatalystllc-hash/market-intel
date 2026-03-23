import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

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
    prompt: `Extract detailed service offerings and pricing from this business webpage.

CRITICAL: Only extract information that is EXPLICITLY written on the page. Do NOT invent services, prices, or details that are not visible in the source text. If pricing is not listed on the page, set pricing to an empty array — do NOT guess prices. If a field has no data on the page, use null or an empty array.

Return ONLY valid JSON:
- services: array of service names that are EXPLICITLY listed on the page
- pricing: array of {service, price, details} for pricing that is EXPLICITLY shown on the page (memberships, packages, etc.). Only include prices you can see in the text.
- membership_options: array of {name, price, benefits} if membership/subscription plans are EXPLICITLY listed on the page
- specials: any current promotions or special offers EXPLICITLY shown — include expiration dates ONLY if they are written on the page, otherwise omit the date
- differentiators: what makes their services unique based ONLY on what the page says (1 sentence), or null if not clear from the page`,
  },
  'location-detail': {
    label: 'This Location',
    pages: [], // URL built dynamically from location info
    prompt: `Extract location-specific details from this business location page.

CRITICAL: Only extract information that is EXPLICITLY written on the page. Do NOT invent hours, services, phone numbers, staff names, or any other details. If a piece of information is not on the page, use null or an empty array — never fabricate data. It is better to return fewer fields with accurate data than to guess.

Return ONLY valid JSON:
- hours: business hours ONLY if explicitly listed on the page, otherwise null
- services_at_location: array of services EXPLICITLY listed for THIS location
- local_phone: phone number ONLY if shown on the page, otherwise null
- local_address: full address ONLY if shown on the page, otherwise null
- local_pricing: pricing EXPLICITLY shown for this location (membership tiers, session prices, packages), or empty array if none shown
- membership_options: array of {name, price, benefits} ONLY if membership plans are explicitly listed, otherwise empty array
- staff: array of {name, role} ONLY for staff members explicitly named on the page, otherwise empty array
- amenities: array of amenities ONLY if explicitly listed on the page, otherwise empty array
- booking_link: URL for booking/scheduling ONLY if a link is visible on the page, otherwise null`,
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
    prompt: `Extract pricing and service details specific to this business location.

CRITICAL: Only extract information that is EXPLICITLY written on the page. Do NOT invent prices, services, or promotions. If pricing is not visible on the page, return empty arrays — do NOT guess. If a date appears on a special/promotion, copy it exactly as written. Never fabricate dates.

Return ONLY valid JSON:
- services_at_location: array of services EXPLICITLY listed for THIS location
- pricing: array of {service, price, details} ONLY for pricing explicitly shown on the page
- membership_options: array of {name, price, benefits} ONLY if explicitly listed on the page
- specials: any promotions EXPLICITLY shown on the page — include expiration dates ONLY if written on the page
- packages: array of {name, price, includes} ONLY for bundled offerings explicitly listed
- differentiators: what makes this location unique based ONLY on what the page says (1 sentence), or null if not clear`,
  },
} as const;

type EnrichType = keyof typeof ENRICH_TYPES;

function getNewsPrompt(): string {
  return `You are a business news analyst extracting news from scraped web content.

CRITICAL RULES — READ CAREFULLY:
1. You must ONLY extract information that is EXPLICITLY written in the source text below.
2. For dates: Use ONLY dates that appear VERBATIM in the source text. Copy them exactly as written.
3. If a news item has NO date visible in the source text, set date to "Date not found in source".
4. NEVER guess, estimate, infer, or fabricate a date. NEVER use today's date as a substitute.
5. NEVER change a date you find in the source. If it says "March 2023", report "March 2023" — do NOT update it to a more recent date.
6. If the source material contains no news at all, return {"recent_news": [], "growth_signals": "No news content found on this page."}.
7. It is MUCH better to return fewer results with accurate dates than more results with guessed dates.

Return ONLY valid JSON:
- recent_news: array of {headline, date, summary, source_url} (max 5). The "date" field must be copied EXACTLY from the source text, or set to "Date not found in source" if no date is visible near that article. The "source_url" should be the URL where this news was found if visible in the source, or null if not.
- new_locations: string describing any new location openings mentioned, with the EXACT date as written in the source, or null if not found
- partnerships: string describing any partnerships mentioned, with the EXACT date as written in the source, or null if not found
- awards: string describing any awards mentioned, with the EXACT date as written in the source, or null if not found
- growth_signals: 1-2 sentences summarizing growth trajectory ONLY based on what is explicitly stated in the source text. Do not speculate.`;
}

// Helper: location-specific enrichment types
const LOCATION_TYPES: EnrichType[] = ['location-news', 'location-pricing', 'location-detail'];

function isLocationType(t: EnrichType): boolean {
  return LOCATION_TYPES.includes(t);
}

// Helper: build Firecrawl search query for a given enrichment type
// Detect error/404 pages that scrapers pick up as "content"
function isErrorPage(content: string): boolean {
  const lower = content.toLowerCase();
  const errorPatterns = [
    'page not found',
    '404 not found',
    'page you are looking for could not be found',
    'this page doesn\'t exist',
    'this page does not exist',
    'sorry, we couldn\'t find',
    'error 404',
    'page doesn\'t exist',
    'nothing was found',
    'no results found',
    'the requested url was not found',
  ];
  const firstChunk = lower.slice(0, 500);
  return errorPatterns.some(p => firstChunk.includes(p));
}

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
        content: `Search the web for: ${searchQuery}\n\nContext: ${contextDescription}\n\nIMPORTANT INSTRUCTIONS FOR YOUR RESPONSE:
1. For EVERY piece of information you report, include the SOURCE URL where you found it.
2. For dates: ONLY report dates that are EXPLICITLY published on the source pages. Copy them exactly as written.
3. NEVER guess, approximate, or fabricate a date. If an article has no visible publication date, write "Date: not specified on page".
4. Format each finding as: [Source: URL] Date: [exact date from page or "not specified on page"] — [the information]
5. Do NOT change dates to make them appear more recent. Report them exactly as they appear.
6. If you find no relevant results, say so honestly rather than fabricating information.`,
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
            const content = (r.markdown || r.description || '');
            if (isErrorPage(content)) continue;
            const contentLower = content.toLowerCase();
            if (url.includes(domain) && (
              (locationCity && contentLower.includes(locationCity.toLowerCase())) ||
              (locationName && contentLower.includes(locationName.toLowerCase()))
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
              if (r.markdown && r.markdown.length > 200 && !isErrorPage(r.markdown)) {
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
              // Reject error/404 pages
              if (isErrorPage(content)) continue;

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
            .filter((r: { markdown?: string }) => r.markdown && r.markdown.length > 100 && !isErrorPage(r.markdown))
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
              if (content.length > 200 && !isErrorPage(content)) {
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
            if (content.length > 200 && !isErrorPage(content)) {
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

    // Only try Claude web search if Firecrawl didn't find substantial content (saves time + cost)
    const needsWebSearch = !markdown || markdown.length < 500;

    if (needsWebSearch && anthropicKey && anthropicKey !== 'your_key_here') {
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

    // Final check: reject if we only captured error pages
    if (markdown && isErrorPage(markdown)) {
      markdown = '';
    }

    if (!markdown) {
      const locationHint = locationCity ? ` for ${locationName || 'this location'} in ${locationCity}` : '';
      return NextResponse.json({
        error: `Could not find ${enrichType.replace(/-/g, ' ')} data${locationHint} on ${domain}. This often means the website doesn't have a dedicated page for this, or the site blocks automated access. Try a different enrichment type.`,
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
          contextualPrompt += `\n\nIMPORTANT: I am looking for news specifically about or near the ${locDesc}. Focus on local events, openings, closings, renovations, or community involvement at this specific location. Remember: use ONLY dates that appear verbatim in the source text. If no date is shown, set date to "Date not found in source". NEVER fabricate or guess dates.`;
        } else if (enrichType === 'location-pricing') {
          contextualPrompt += `\n\nIMPORTANT: I am looking for pricing specifically at the ${locDesc}. Extract ONLY pricing tiers, membership options, session prices, and packages that are EXPLICITLY listed on the page. Do NOT invent prices.`;
        } else {
          contextualPrompt += `\n\nIMPORTANT: I am looking for information specifically about the ${locDesc}. Extract ONLY hours, services, amenities, and contact info that are EXPLICITLY shown on the page for THIS specific location.`;
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

    // ─── STEP C2: Post-processing date validation for news enrichment ───
    if ((enrichType === 'recent-news' || enrichType === 'location-news') && enrichedData.recent_news && Array.isArray(enrichedData.recent_news)) {
      const sourceText = markdown.toLowerCase();
      enrichedData.recent_news = (enrichedData.recent_news as { headline?: string; date?: string; summary?: string; source_url?: string | null }[]).map(item => {
        if (!item.date || item.date === 'Date not found in source') {
          return { ...item, date: 'Date not found in source', _date_verified: false };
        }

        const dateStr = item.date;

        // Check 1: Can we find this date (or key parts of it) in the actual source text?
        // Look for the year, month, or full date string in the source markdown
        const dateLower = dateStr.toLowerCase().trim();
        const yearMatch = dateLower.match(/\b(19|20)\d{2}\b/);
        const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        const monthAbbrevs = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
        let monthMatch = monthNames.find(m => dateLower.includes(m));
        let monthAbbrev: string | null = monthMatch ? monthAbbrevs[monthNames.indexOf(monthMatch)] : null;
        // If no full month name found, try abbreviated (e.g., "Mar 2025")
        if (!monthMatch) {
          const abbrevMatch = monthAbbrevs.find(a => dateLower.includes(a));
          if (abbrevMatch) {
            monthAbbrev = abbrevMatch;
            monthMatch = monthNames[monthAbbrevs.indexOf(abbrevMatch)];
          }
        }

        let dateFoundInSource = false;

        // Try to find the exact date string in source
        if (sourceText.includes(dateLower)) {
          dateFoundInSource = true;
        }
        // Try to find year + month combination near each other in source
        else if (yearMatch && (monthMatch || monthAbbrev)) {
          // Look for both the year and month (full or abbreviated) appearing within 30 chars of each other in source
          const yearStr = yearMatch[0];
          let searchPos = 0;
          while (searchPos < sourceText.length) {
            const yearIdx = sourceText.indexOf(yearStr, searchPos);
            if (yearIdx === -1) break;
            const nearby = sourceText.slice(Math.max(0, yearIdx - 30), yearIdx + yearStr.length + 30);
            if ((monthMatch && nearby.includes(monthMatch)) || (monthAbbrev && nearby.includes(monthAbbrev))) {
              dateFoundInSource = true;
              break;
            }
            searchPos = yearIdx + 1;
          }
        }
        // Try to find just the year in source (weak signal but better than nothing)
        else if (yearMatch) {
          dateFoundInSource = sourceText.includes(yearMatch[0]);
        }

        // Check 2: Is this date suspiciously in the future?
        try {
          const parsedDate = new Date(dateStr);
          if (!isNaN(parsedDate.getTime())) {
            const now = new Date();
            const oneMonthFromNow = new Date(now);
            oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
            if (parsedDate > oneMonthFromNow) {
              // Date is more than a month in the future — very suspicious
              return { ...item, date: `${dateStr} (unverified — date appears to be in the future)`, _date_verified: false };
            }
          }
        } catch {
          // Date parsing failed, that's fine
        }

        // If we couldn't find the date in the source at all, flag it
        if (!dateFoundInSource) {
          return { ...item, date: `${dateStr} (unverified)`, _date_verified: false };
        }

        return { ...item, _date_verified: true };
      });
    }

    // Also validate date fields on other news-related string fields (new_locations, partnerships, awards)
    if (enrichType === 'recent-news' || enrichType === 'location-news') {
      const sourceText = markdown.toLowerCase();
      for (const field of ['new_locations', 'partnerships', 'awards'] as const) {
        const val = enrichedData[field];
        if (val && typeof val === 'string') {
          // Check if any year mentioned in the field actually appears in the source
          const yearsInField = String(val).match(/\b(19|20)\d{2}\b/g) || [];
          for (const year of yearsInField) {
            if (!sourceText.includes(year)) {
              enrichedData[field] = `${val} (date unverified)`;
              break;
            }
          }
        }
      }
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
