# MarketIntel — M&A Intelligence for Any Industry

MarketIntel transforms raw spreadsheet data into a professional, interactive M&A intelligence dashboard. Upload Excel or JSON files containing company and location data for **any industry** — tanning salons, pest control, HVAC, dental, auto repair — and instantly get a geographic market map, M&A attractiveness scores, competitive analysis, and executive-ready insights.

Built for PE firms, investors, and C-suite executives evaluating acquisition targets and mapping competitive landscapes.

## Features

- **Dynamic Column Mapping** — AI-powered (Claude API) auto-detection of any column format
- **Interactive Canvas Map** — Pan, zoom, density heatmap, minimap, auto-fit to data bounds
- **Company Profiles** — Click any dot for full detail: ratings, M&A score, locations, competitors, contacts
- **M&A Scoring** — Automated 0-100 attractiveness scoring with factor breakdown
- **Footprint Classification** — National / Regional / Local with color-coded dots
- **PE Ownership Detection** — Identifies PE-backed companies with visual indicators
- **Strategy Bubble Chart** — Configurable axes for strategic positioning analysis
- **Sortable Company Table** — Full roster with logo, badges, and inline metrics
- **Global Search** — Cmd+K to find any company by name, city, investor, or service
- **Filters** — Footprint, ownership, services, quality rating (4.8+)
- **Logo System** — Auto-fetches company logos via Clearbit with SVG fallbacks
- **Enrichment** — Firecrawl integration to scrape additional company data
- **PDF Export** — Print-ready market intelligence reports
- **Guided Tour** — Interactive onboarding walkthrough for new users

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Upload Page (app/page.tsx)                      │
│  Drag & drop Excel/JSON → /api/process           │
└──────────────┬──────────────────────────────────┘
               │ sessionStorage
┌──────────────▼──────────────────────────────────┐
│  Map Dashboard (app/map/page.tsx)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ MapCanvas│ │ Strategy │ │  Detail Panel    │ │
│  │ (Canvas) │ │ (Chart.js│ │  (slide-in)      │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ FilterBar│ │ StatBar  │ │  CompanyTable    │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└─────────────────────────────────────────────────┘

API Routes:
  /api/process  — Parse files + Claude column mapping + transform
  /api/logo     — Clearbit logo proxy with SVG fallback
  /api/enrich   — Firecrawl web scraping + Claude structuring
```

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd marketintel
npm install
```

### 2. Add API keys

Copy `.env.example` to `.env.local` and add your keys:

```bash
cp .env.example .env.local
```

```env
ANTHROPIC_API_KEY=sk-ant-...    # For AI column mapping (optional — auto-detect works without it)
FIRECRAWL_API_KEY=fc-...        # For "Enrich Company" button (optional)
NEXT_PUBLIC_APP_NAME=MarketIntel
```

**Where to get keys:**
- **Anthropic API Key** — [console.anthropic.com](https://console.anthropic.com/) (sign up, create key)
- **Firecrawl API Key** — [firecrawl.dev](https://firecrawl.dev/) (sign up, get key)
- **Neither key is required** — the app works fully without them using pattern-based column detection

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## How to Upload Data

You need at least one file. Ideally two:

### Company File (required)
One row per company. Best columns to include:
- Company Name, Website/Domain, City, State
- Employees, Founded Year, Rating, Reviews
- Services/Specialties, PE Investor info
- Latitude, Longitude (if no location file)

### Location File (optional, recommended)
One row per branch/store location:
- Location Name, Website/Domain (must match company file)
- Latitude, Longitude (required for map dots)
- City, State, Rating, Reviews, Phone, Address

**Important:** Both files must share a **Website/Domain** column for linking. Column names don't need to be exact — the AI mapper handles variations like "HQ City (LinkedIn)" or "udu score".

## Logo System

Logos are fetched automatically:
1. **Primary:** Clearbit Logo API (`https://logo.clearbit.com/{domain}`) — free, no key needed
2. **Fallback:** SVG circle with company initial in footprint color

Logos appear in: tooltips (32px), detail panel (48px), and company table (24px). The `/api/logo` route handles caching and fallback transparently.

## Deploy to Vercel

1. Push to GitHub
2. Import project in [vercel.com](https://vercel.com)
3. Add environment variables (ANTHROPIC_API_KEY, FIRECRAWL_API_KEY)
4. Deploy — `vercel.json` configures function timeouts automatically

## Tech Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Map:** Pure HTML5 Canvas (no Leaflet)
- **Charts:** Chart.js + react-chartjs-2
- **AI:** Anthropic Claude API (claude-sonnet-4-6)
- **Logos:** Clearbit Logo API
- **Enrichment:** Firecrawl API
- **Hosting:** Vercel
