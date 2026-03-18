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
  const lower = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const lowerKeepSpaces = (s: string) => s.toLowerCase().trim();

  // Track which schema fields are already mapped to avoid duplicates
  const mapped = new Set<string>();

  // Priority-ordered mapping rules. First match wins per column.
  // We also ensure each schema field is only mapped once (best match).
  const rules: { test: (l: string, orig: string) => boolean; field: string }[] = [
    // Name — very important, handle common patterns
    { test: (l) => l === 'name' || l === 'companyname' || l === 'businessname' || l === 'company' || l === 'namelinkedin' || l === 'nameforemails', field: 'name' },
    // Coordinates
    { test: (l) => l === 'latitude' || (l.includes('lat') && !l.includes('late') && !l.includes('relat')), field: 'latitude' },
    { test: (l) => l === 'longitude' || l.includes('lng') || l.includes('longitude') || l === 'lon', field: 'longitude' },
    // Domain/website
    { test: (l) => l === 'domain' || l === 'website' || (l.includes('domain') && !l.includes('creation')), field: 'domain' },
    // Rating
    { test: (l) => l === 'rating' || l.includes('avgrating') || l.includes('averagerating') || l.includes('googlerating'), field: 'rating' },
    // Reviews
    { test: (l) => l === 'reviews' || l.includes('reviewcount') || l.includes('totalreviews') || l.includes('numberofreviews'), field: 'reviews' },
    // City — handle "(LinkedIn)" suffixed columns
    { test: (l) => l === 'city' || l === 'hqcity' || l === 'hqcitylinkedin' || l.includes('citylinkedin'), field: 'city' },
    // State
    { test: (l) => (l.includes('state') && !l.includes('status')) || l.includes('province') || l === 'hqstatelinkedin' || l === 'statecode', field: 'state' },
    // Employee size
    { test: (l) => l === 'sizelinkedin' || (l.includes('employee') && l.includes('size')), field: 'employee_size' },
    // Employees
    { test: (l) => l.includes('employee') && !l.includes('size') && !l.includes('count6') && !l.includes('event'), field: 'employees' },
    // Founded
    { test: (l) => l.includes('founded') || l.includes('yearfounded'), field: 'founded' },
    // Revenue
    { test: (l) => l.includes('revenue') && !l.includes('6month'), field: 'revenue' },
    // Phone
    { test: (l) => l === 'phone' || (l.includes('phone') && !l.includes('2') && !l.includes('3')), field: 'phone' },
    // Address
    { test: (l) => l === 'address' || l === 'streetaddress' || (l === 'street' && !l.includes('view')), field: 'address' },
    // LinkedIn URL
    { test: (l) => l === 'urllinkedin' || l === 'linkedinlead411' || (l.includes('linkedin') && l.includes('url')), field: 'linkedin_url' },
    // Description
    { test: (l) => l === 'description' || l === 'descriptionlinkedin' || l === 'companydescriptionlead411' || l.includes('about'), field: 'description' },
    // PE/Investor detection — handle "Investors (PEI)_type" patterns
    { test: (l, orig) => lowerKeepSpaces(orig).includes('investors (pei)_type') || l === 'investorspeiitype' || ((l.includes('pe') || l.includes('investor')) && (l.includes('back') || l.includes('type'))), field: 'is_pe_backed' },
    { test: (l, orig) => lowerKeepSpaces(orig).includes('investors (pei)_firm') || l.includes('pefirm') || l.includes('investorfirm'), field: 'pe_firm' },
    // Score
    { test: (l) => l === 'score' || l === 'uduscore' || l.includes('uduscore') || l.includes('platformscore') || l === 'udumatch', field: 'score' },
    // Location count
    { test: (l) => l.includes('locationcount') || (l.includes('location') && l.includes('count')), field: 'location_count' },
    // Services / specialties / target phrases
    { test: (l) => l.includes('specialties') || l.includes('targetphraseslist') || l.includes('service') || l.includes('offering'), field: 'services' },
    // Parent company
    { test: (l, orig) => lowerKeepSpaces(orig).includes('parent company') || l.includes('parentcompany') || l.includes('holding'), field: 'parent_company' },
    // Executive name
    { test: (l, orig) => lowerKeepSpaces(orig).includes('key executives') && lowerKeepSpaces(orig).includes('name_1'), field: 'executive_name' },
    // Executive title
    { test: (l, orig) => lowerKeepSpaces(orig).includes('key executives') && lowerKeepSpaces(orig).includes('title_1'), field: 'executive_title' },
    // Executive email
    { test: (l, orig) => (lowerKeepSpaces(orig).includes('contact cards') && lowerKeepSpaces(orig).includes('emails_1')) || (lowerKeepSpaces(orig).includes('apollo contact') && lowerKeepSpaces(orig).includes('email_1')), field: 'executive_email' },
  ];

  for (const col of columnNames) {
    const l = lower(col);
    for (const rule of rules) {
      if (!mapped.has(rule.field) && rule.test(l, col)) {
        mapping[col] = rule.field;
        mapped.add(rule.field);
        break;
      }
    }
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
      model: 'claude-sonnet-4-6-20250514',
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
