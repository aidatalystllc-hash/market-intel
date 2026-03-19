// ── MarketIntel Core Types ──

export interface Location {
  name: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  rating: number | null;
  reviews: number | null;
  photosCount: number | null;
  phone: string;
  website: string;
  hours: string;
  photos: string[];
  bookingLink: string;
  googleMapsLink: string;
}

export interface Company {
  id: string;
  name: string;
  domain: string;
  lat: number | null;
  lng: number | null;
  city: string;
  state: string;
  description: string;
  employees: number | null;
  employeeSize: string;
  revenue: string;
  founded: number | null;
  footprint: 'national' | 'regional' | 'local';
  isPE: boolean;
  peFirm: string;
  peType: string;
  isFamily: boolean;
  services: string[];
  score: number;
  locationCount: number;
  avgRating: number | null;
  totalReviews: number | null;
  linkedinUrl: string;
  executiveName: string;
  executiveTitle: string;
  executiveEmail: string;
  executivePhone: string;
  parentCompany: string;
  totalPhotos: number | null;
  locations: Location[];
  maScore: number;
}

export interface ColumnMapping {
  [originalColumn: string]: string; // maps to schema field name or "unmapped"
}

export interface ProcessedData {
  companies: Company[];
  industryName: string;
  warnings: string[];
}

export interface FilterState {
  footprint: 'all' | 'national' | 'regional' | 'local';
  ownership: 'all' | 'pe' | 'independent';
  service: string | null;
  minRating: number;
}

export type SortKey =
  | 'name'
  | 'city'
  | 'footprint'
  | 'ownership'
  | 'locationCount'
  | 'avgRating'
  | 'score'
  | 'maScore'
  | 'employees'
  | 'founded'
  | 'services';

export type ViewMode = 'map' | 'strategy';

export interface ColorTheme {
  name: string;
  primary: string;
  accent: string;
}

export const COLOR_THEMES: ColorTheme[] = [
  { name: 'Warm Gold', primary: '#b07d10', accent: '#d4a020' },
  { name: 'Navy', primary: '#1a4f96', accent: '#2d6bc4' },
  { name: 'Forest Green', primary: '#1a7040', accent: '#2a9a5a' },
  { name: 'Burgundy', primary: '#7a1050', accent: '#a01868' },
  { name: 'Steel', primary: '#4a5568', accent: '#718096' },
];

export interface AppState {
  companies: Company[];
  filteredCompanies: Company[];
  selectedCompany: Company | null;
  filters: FilterState;
  currentView: ViewMode;
  industryName: string;
  colorTheme: ColorTheme;
  sortKey: SortKey;
  sortAscending: boolean;
  isLoading: boolean;
  loadingStep: string;
}

export type AppAction =
  | { type: 'SET_COMPANIES'; payload: Company[] }
  | { type: 'SET_SELECTED'; payload: Company | null }
  | { type: 'SET_FILTER'; payload: Partial<FilterState> }
  | { type: 'SET_VIEW'; payload: ViewMode }
  | { type: 'SET_INDUSTRY'; payload: string }
  | { type: 'SET_THEME'; payload: ColorTheme }
  | { type: 'SET_SORT'; payload: { key: SortKey; ascending: boolean } }
  | { type: 'SET_LOADING'; payload: { isLoading: boolean; step?: string } }
  | { type: 'UPDATE_COMPANY'; payload: Company }
  | { type: 'CLEAR_FILTERS' };

// Footprint color constants
export const FOOTPRINT_COLORS = {
  national: '#b03a1a',
  regional: '#1a4f96',
  local: '#1a7040',
} as const;

export const PE_COLOR = '#7a1050';
export const ACCENT_COLOR = '#b07d10';
