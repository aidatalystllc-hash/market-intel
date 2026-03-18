/**
 * Flatten deeply nested UDU-style JSON objects into flat key-value rows.
 * Handles the specific structure from UDU Source exports where company data
 * is nested inside objects like linkedin_company_data, lead411_company_data, etc.
 */
export function flattenUduJson(
  rows: Record<string, unknown>[]
): { columns: string[]; rows: Record<string, unknown>[] } {
  if (rows.length === 0) return { columns: [], rows: [] };

  // Extract the fields we care about from nested structures
  const flattened = rows.map((row) => {
    const flat: Record<string, unknown> = {};

    // Top-level simple fields
    flat['name'] = row.name || row.website_name || '';
    flat['domain'] = row.domain || row.url || '';
    flat['description'] = typeof row.description === 'string' ? row.description.slice(0, 500) : '';
    flat['latitude'] = row.latitude;
    flat['longitude'] = row.longitude;

    // States
    if (Array.isArray(row.states) && row.states.length > 0) {
      flat['state'] = row.states[0];
    }

    // Addresses (nested)
    const addresses = row.addresses as { addresses?: { city?: string; state?: string; street?: string; zip_code?: string }[] } | undefined;
    if (addresses?.addresses?.[0]) {
      const addr = addresses.addresses[0];
      if (!flat['state'] && addr.state) flat['state'] = addr.state;
      if (addr.city) flat['city'] = addr.city;
      if (addr.street) flat['address'] = addr.street;
      if (addr.zip_code) flat['postal_code'] = addr.zip_code;
    }

    // Keywords / UDU Score
    const keywords = row.keywords as { udu_score?: number; score?: number; combined_score?: number; udu_confidence?: number } | undefined;
    if (keywords) {
      flat['udu_score'] = keywords.udu_score ?? keywords.combined_score ?? keywords.score ?? 0;
    }

    // LinkedIn company data (nested)
    const linkedin = row.linkedin_company_data as Record<string, unknown> | undefined;
    if (linkedin) {
      if (linkedin.name && !flat['name']) flat['name'] = linkedin.name;
      if (linkedin.description && !flat['description']) flat['description'] = String(linkedin.description).slice(0, 500);
      if (linkedin.linkedin_url) flat['linkedin_url'] = linkedin.linkedin_url;
      if (linkedin.founded) flat['founded'] = linkedin.founded;
      if (linkedin.industry) flat['industry'] = linkedin.industry;
      if (linkedin.specialties) flat['services'] = linkedin.specialties;
      if (linkedin.headquarters_city) flat['city'] = linkedin.headquarters_city;
      if (linkedin.headquarters_state) flat['state'] = linkedin.headquarters_state;
      if (linkedin.company_type) flat['company_type'] = linkedin.company_type;
      const size = linkedin.size as { min?: number; max?: number; size_range?: string } | undefined;
      if (size?.size_range) flat['employee_size'] = size.size_range;
      if (linkedin.linkedin_employee_count) flat['employees'] = linkedin.linkedin_employee_count;
      if (linkedin.logo_url) flat['logo_url'] = linkedin.logo_url;
    }

    // Lead411 company data (nested)
    const lead411 = row.lead411_company_data as Record<string, unknown> | undefined;
    if (lead411) {
      if (lead411.phone) flat['phone'] = lead411.phone;
      const rev = lead411.revenue_range as { revenue_range?: string } | undefined;
      if (rev?.revenue_range) flat['revenue'] = rev.revenue_range;
      const emp = lead411.employees_range as { employees_range?: string } | undefined;
      if (emp?.employees_range && !flat['employee_size']) flat['employee_size'] = emp.employees_range;
      if (lead411.linkedin_url && !flat['linkedin_url']) flat['linkedin_url'] = lead411.linkedin_url;
    }

    // Apollo company data (nested)
    const apollo = row.apollo_company_data as Record<string, unknown> | undefined;
    if (apollo) {
      if (apollo.estimated_num_employees && !flat['employees']) flat['employees'] = apollo.estimated_num_employees;
      if (apollo.founded_year && !flat['founded']) flat['founded'] = apollo.founded_year;
      if (apollo.phone && !flat['phone']) flat['phone'] = apollo.phone;
      if (apollo.linkedin_url && !flat['linkedin_url']) flat['linkedin_url'] = apollo.linkedin_url;
    }

    // PEI company data (nested)
    const pei = row.pei_company_data as Record<string, unknown> | undefined;
    if (pei) {
      flat['pe_type'] = pei.type || '';
      const firms = pei.firms as { firm_name?: string }[] | undefined;
      if (firms && firms.length > 0) {
        flat['pe_firm'] = firms.map((f) => f.firm_name || '').filter(Boolean).join(', ');
        flat['is_pe_backed'] = 'Yes';
      }
    }

    // Apollo contact data (nested)
    const contacts = row.apollo_contact_data as { contacts?: { first_name?: string; last_name?: string; title?: string; email?: string }[] } | undefined;
    if (contacts?.contacts?.[0]) {
      const c = contacts.contacts[0];
      flat['executive_name'] = [c.first_name, c.last_name].filter(Boolean).join(' ');
      flat['executive_title'] = c.title || '';
      flat['executive_email'] = c.email || '';
    }

    // Contact cards (nested)
    const cards = row.contact_cards as { contact_cards?: { name?: string; job_title?: string; emails?: string[]; phone_numbers?: string[] }[] } | undefined;
    if (cards?.contact_cards?.[0] && !flat['executive_name']) {
      const c = cards.contact_cards[0];
      if (c.name) flat['executive_name'] = c.name;
      if (c.job_title) flat['executive_title'] = c.job_title;
      if (c.emails?.[0]) flat['executive_email'] = c.emails[0];
      if (c.phone_numbers?.[0] && !flat['phone']) flat['phone'] = c.phone_numbers[0];
    }

    // Target phrases (services)
    const phrases = row.custom_columns_target_phrases_list as { custom_columns_target_phrases_list?: string[] } | undefined;
    if (phrases?.custom_columns_target_phrases_list) {
      flat['services'] = phrases.custom_columns_target_phrases_list.join(', ');
    }

    // Website creation date
    const wcd = row.website_creation_date as { website_creation_date?: string } | undefined;
    if (wcd?.website_creation_date) {
      const year = parseInt(wcd.website_creation_date);
      if (year > 1990 && year < 2030 && !flat['founded']) flat['founded'] = year;
    }

    return flat;
  });

  const columns = Object.keys(flattened[0] || {});
  return { columns, rows: flattened };
}

/**
 * Detect if a JSON array contains nested UDU-style objects.
 */
export function isNestedUduFormat(rows: Record<string, unknown>[]): boolean {
  if (rows.length === 0) return false;
  const sample = rows[0];
  // UDU format has these characteristic nested objects
  return (
    'linkedin_company_data' in sample ||
    'apollo_company_data' in sample ||
    'pei_company_data' in sample ||
    'lead411_company_data' in sample ||
    ('keywords' in sample && typeof sample.keywords === 'object' && sample.keywords !== null && 'udu_score' in (sample.keywords as Record<string, unknown>))
  );
}
