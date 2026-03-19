import Anthropic from '@anthropic-ai/sdk';
import type { ColumnMapping } from './types';

const SCHEMA_FIELDS = [
  'name', 'domain', 'latitude', 'longitude', 'city', 'state',
  'description', 'employees', 'revenue', 'founded', 'rating',
  'reviews', 'is_pe_backed', 'pe_firm', 'executive_name',
  'executive_title', 'executive_email', 'services', 'location_count',
  'score', 'phone', 'address', 'linkedin_url', 'parent_company',
  'employee_size', 'pe_type',
];

/**
 * Auto-detect column mappings using simple pattern matching.
 * Returns columns that could be confidently mapped without AI.
 */
export function autoDetectColumns(columnNames: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const lc = (s: string) => s.toLowerCase().trim();

  // Track which schema fields are already mapped to avoid duplicates
  const mapped = new Set<string>();

  function assign(col: string, field: string) {
    if (!mapped.has(field) && !mapping[col]) {
      mapping[col] = field;
      mapped.add(field);
    }
  }

  // PASS 1: Exact/high-confidence matches using original column names
  // These use the full original column name for precision
  for (const col of columnNames) {
    const c = lc(col);

    // Name — prefer "Name" over "Company" (Company is often a URL in UDU data)
    if (c === 'name') assign(col, 'name');
    // Coordinates — exact match only, NOT substring (to avoid "platform" matching "lat")
    else if (c === 'latitude') assign(col, 'latitude');
    else if (c === 'longitude') assign(col, 'longitude');
    // Domain
    else if (c === 'domain') assign(col, 'domain');
    else if (c === 'website' || c === 'site') assign(col, 'domain');
    // Rating/reviews
    else if (c === 'rating') assign(col, 'rating');
    else if (c === 'reviews') assign(col, 'reviews');
    // Location data
    else if (c === 'city') assign(col, 'city');
    else if (c === 'state') assign(col, 'state');
    else if (c === 'phone') assign(col, 'phone');
    else if (c === 'address' || c === 'full_address' || c === 'street') assign(col, 'address');
    else if (c === 'description') assign(col, 'description');
    else if (c === 'subtypes' || c === 'category') assign(col, 'services');
    else if (c === 'photos_count') assign(col, 'photos_count');
    // Score
    else if (c === 'udu score' || c === 'udu_score') assign(col, 'score');
    else if (c === 'score') assign(col, 'score');
  }

  // PASS 2: Pattern matches for UDU/LinkedIn/Lead411 columns
  for (const col of columnNames) {
    const c = lc(col);

    // PE Investors — ONLY from Investors (PEI) columns, NOT Company Type or Ownership Status
    if (c.startsWith('investors (pei)_type')) assign(col, 'is_pe_backed');
    else if (c.startsWith('investors (pei)_firm_1') && !c.includes('platform') && !c.includes('addon')) assign(col, 'pe_firm');

    // LinkedIn-specific columns — these OVERRIDE Lead411/generic columns
    else if (c === 'name (linkedin)' && !mapped.has('name')) assign(col, 'name');
    else if (c === 'hq city (linkedin)') {
      // Override any previously mapped city (LinkedIn HQ is more accurate)
      for (const [k, v] of Object.entries(mapping)) { if (v === 'city') { delete mapping[k]; mapped.delete('city'); break; } }
      assign(col, 'city');
    }
    else if (c === 'hq state (linkedin)') assign(col, 'hq_state'); // separate field for HQ state
    else if (c === 'size (linkedin)') assign(col, 'employee_size');
    else if (c === 'employees (linkedin)' && !mapped.has('employees')) assign(col, 'employees');
    else if (c === 'founded (linkedin)') assign(col, 'founded');
    else if (c === 'specialties (linkedin)' && !mapped.has('services')) assign(col, 'services');
    else if (c === 'description (linkedin)' && !mapped.has('description')) assign(col, 'description');
    else if (c === 'url (linkedin)') assign(col, 'linkedin_url');
    else if (c === 'parent company (linkedin)_name') assign(col, 'parent_company');
    else if (c === 'ownership status (linkedin)') assign(col, 'ownership_status'); // NOT pe_backed

    // Lead411 columns
    else if (c === 'employees (lead411)' && !mapped.has('employees')) assign(col, 'employees');
    else if (c === 'city (lead411)' && !mapped.has('city')) assign(col, 'city');
    else if (c === 'state (lead411)' && !mapped.has('state')) assign(col, 'state');
    else if (c === 'phone (lead411)' && !mapped.has('phone')) assign(col, 'phone');
    else if (c === 'linkedin (lead411)' && !mapped.has('linkedin_url')) assign(col, 'linkedin_url');
    else if (c.startsWith('annual revenue') && c.includes('printed') && !mapped.has('revenue')) assign(col, 'revenue');

    // Key executives
    else if (c === 'key executives (linkedin)_name_1') assign(col, 'executive_name');
    else if (c === 'key executives (linkedin)_title_1') assign(col, 'executive_title');

    // Contact data — multiple sources
    else if (c === 'contact cards_emails_1' && !mapped.has('executive_email')) assign(col, 'executive_email');
    else if (c === 'contact cards_name_1' && !mapped.has('executive_name')) assign(col, 'executive_name');
    else if (c === 'contact cards_job_title_1' && !mapped.has('executive_title')) assign(col, 'executive_title');
    else if (c === 'contact cards_phone_numbers_1') assign(col, 'executive_phone');

    // Apollo contact data
    else if (c === 'apollo contact data_email_1' && !mapped.has('executive_email')) assign(col, 'executive_email');
    else if (c === 'apollo contact data_first_name_1') assign(col, 'apollo_first_name');
    else if (c === 'apollo contact data_last_name_1') assign(col, 'apollo_last_name');
    else if (c === 'apollo contact data_title_1' && !mapped.has('executive_title')) assign(col, 'executive_title');
  }

  // PASS 3: Fuzzy fallbacks for columns not yet mapped
  for (const col of columnNames) {
    if (mapping[col]) continue; // already mapped
    const stripped = col.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Name fallback — only if name not yet mapped
    if (!mapped.has('name') && (stripped === 'companyname' || stripped === 'businessname')) assign(col, 'name');
    // Company column as name fallback (often a URL in UDU but name in other formats)
    else if (!mapped.has('name') && stripped === 'company') assign(col, 'name');
    // Domain fallback
    else if (!mapped.has('domain') && stripped.includes('website')) assign(col, 'domain');
    else if (!mapped.has('domain') && stripped.includes('domain') && !stripped.includes('creation')) assign(col, 'domain');
    // Coordinates — strict check to avoid "platform" matching
    else if (!mapped.has('latitude') && (stripped === 'lat' || stripped === 'companylat' || stripped === 'hqlat')) assign(col, 'latitude');
    else if (!mapped.has('longitude') && (stripped === 'lng' || stripped === 'lon' || stripped === 'companylng' || stripped === 'hqlng')) assign(col, 'longitude');
    // Founded
    else if (!mapped.has('founded') && stripped.includes('founded')) assign(col, 'founded');
    // Revenue
    else if (!mapped.has('revenue') && stripped.includes('revenue') && !stripped.includes('6month')) assign(col, 'revenue');
    // Score
    else if (!mapped.has('score') && (stripped.includes('uduscore') || stripped.includes('platformscore'))) assign(col, 'score');
    // Parent company
    else if (!mapped.has('parent_company') && stripped.includes('parentcompany')) assign(col, 'parent_company');
  }

  return mapping;
}

/**
 * Map columns using Claude API for ambiguous columns that auto-detect missed.
 */
export async function mapColumnsWithClaude(
  columnNames: string[],
  autoMapped: ColumnMapping
): Promise<ColumnMapping> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    // Fall back to auto-detect only
    return autoMapped;
  }

  // Only send unmapped columns to Claude — cap at 60 to avoid huge API calls
  const unmapped = columnNames.filter((col) => !autoMapped[col]).slice(0, 60);
  if (unmapped.length === 0) return autoMapped;

  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are a data schema mapper for a market intelligence platform.
You will receive column names from an uploaded Excel/JSON file and must map them to
our standard schema fields. Return ONLY valid JSON, no explanation.

Standard schema fields:
${SCHEMA_FIELDS.map((f) => `- ${f}`).join('\n')}

Map each column name to the closest schema field. If a column doesn't match anything,
return it as "unmapped". If multiple columns could map to the same field, pick the best one.

Already mapped columns (do NOT re-map these): ${JSON.stringify(autoMapped)}`;

  try {
    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Map these column names to schema fields:\n${JSON.stringify(unmapped)}`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const claudeMapping = JSON.parse(jsonMatch[0]) as ColumnMapping;
      return { ...autoMapped, ...claudeMapping };
    }
  } catch (err) {
    console.error('Claude API mapping failed, using auto-detect only:', err);
  }

  return autoMapped;
}

/**
 * Combined mapping: auto-detect first, then Claude for the rest.
 */
export async function mapColumns(columnNames: string[]): Promise<ColumnMapping> {
  const autoMapped = autoDetectColumns(columnNames);
  return mapColumnsWithClaude(columnNames, autoMapped);
}
