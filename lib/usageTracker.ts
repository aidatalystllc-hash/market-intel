import { put, list } from '@vercel/blob';

export interface UsageEntry {
  timestamp: string;
  enrichType: string;
  domain: string;
  firecrawlCredits: number;
  claudeInputTokens: number;
  claudeOutputTokens: number;
  estimatedCost: number;
}

export interface UsageData {
  datasetId: string;
  totalEstimatedCost: number;
  totalCalls: number;
  totalFirecrawlCredits: number;
  totalClaudeTokens: number;
  capUsd: number;
  history: UsageEntry[];
  createdAt: string;
  updatedAt: string;
}

// Cost constants (per unit)
const FIRECRAWL_COST_PER_CREDIT = 0.0053; // Hobby plan: $16/3000
const CLAUDE_HAIKU_INPUT_PER_1K = 0.00025; // $0.25 per 1M tokens
const CLAUDE_HAIKU_OUTPUT_PER_1K = 0.00125; // $1.25 per 1M tokens

export function estimateCost(firecrawlCredits: number, claudeInputTokens: number, claudeOutputTokens: number): number {
  return (
    firecrawlCredits * FIRECRAWL_COST_PER_CREDIT +
    (claudeInputTokens / 1000) * CLAUDE_HAIKU_INPUT_PER_1K +
    (claudeOutputTokens / 1000) * CLAUDE_HAIKU_OUTPUT_PER_1K
  );
}

const DEFAULT_CAP = 3.0; // $3.00 default cap

function getCapUsd(): number {
  const envCap = process.env.ENRICHMENT_CAP_USD;
  if (envCap) {
    const parsed = parseFloat(envCap);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_CAP;
}

/**
 * Load usage data for a dataset from Vercel Blob.
 */
export async function loadUsage(datasetId: string): Promise<UsageData> {
  const cap = getCapUsd();
  const defaultData: UsageData = {
    datasetId,
    totalEstimatedCost: 0,
    totalCalls: 0,
    totalFirecrawlCredits: 0,
    totalClaudeTokens: 0,
    capUsd: cap,
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const { blobs } = await list({ prefix: `usage/${datasetId}` });
    if (blobs.length === 0) return defaultData;

    const downloadUrl = blobs[0].downloadUrl || blobs[0].url;
    const res = await fetch(downloadUrl);
    if (!res.ok) return defaultData;
    const data = await res.json() as UsageData;
    data.capUsd = cap; // Always use current cap from env
    return data;
  } catch {
    return defaultData;
  }
}

/**
 * Check if a dataset is under the spending cap.
 */
export async function checkBudget(datasetId: string): Promise<{ allowed: boolean; usage: UsageData; remaining: number }> {
  const usage = await loadUsage(datasetId);
  const remaining = usage.capUsd - usage.totalEstimatedCost;
  return {
    allowed: remaining > 0,
    usage,
    remaining: Math.max(0, remaining),
  };
}

/**
 * Record a new enrichment call's costs.
 */
export async function recordUsage(
  datasetId: string,
  entry: Omit<UsageEntry, 'timestamp' | 'estimatedCost'> & { estimatedCost?: number }
): Promise<UsageData> {
  const usage = await loadUsage(datasetId);

  const cost = entry.estimatedCost ?? estimateCost(entry.firecrawlCredits, entry.claudeInputTokens, entry.claudeOutputTokens);

  const fullEntry: UsageEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    estimatedCost: cost,
  };

  usage.history.push(fullEntry);
  usage.totalCalls += 1;
  usage.totalEstimatedCost += cost;
  usage.totalFirecrawlCredits += entry.firecrawlCredits;
  usage.totalClaudeTokens += entry.claudeInputTokens + entry.claudeOutputTokens;
  usage.updatedAt = new Date().toISOString();

  // Keep only last 100 history entries to save space
  if (usage.history.length > 100) {
    usage.history = usage.history.slice(-100);
  }

  // Save back to Vercel Blob — let errors propagate so caller can report them
  const saveResult = await put(`usage/${datasetId}.json`, JSON.stringify(usage), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  console.log('Usage saved to blob:', saveResult.url);

  return usage;
}
