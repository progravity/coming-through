/** Device tier: picks crowd size, pixel ratio, ink outlines and ground grain to suit the platform. */
export type Tier = 'low' | 'mid' | 'high';
export const TIERS: readonly Tier[] = ['low', 'mid', 'high'];

export interface TierSettings {
    label: string;
    crowd: number;
    /** Upper bound on devicePixelRatio. */
    maxPixelRatio: number;
    ink: boolean;
    /** The ground's per-pixel surface grain: the only thing here that costs fill rather than geometry. */
    grain: boolean;
}

export const TIER_SETTINGS: Record<Tier, TierSettings> = {
    low:  { label: 'Low',  crowd: 40, maxPixelRatio: 1,   ink: false, grain: false },
    mid:  { label: 'Mid',  crowd: 60, maxPixelRatio: 1.5, ink: true,  grain: true },
    high: { label: 'High', crowd: 80, maxPixelRatio: 2,   ink: true,  grain: true },
};

const STORAGE_KEY = 'coming-through.tier';

function isTier(v: unknown): v is Tier { return typeof v === 'string' && (TIERS as readonly string[]).includes(v); }

/** Guess a tier from the platform: phones low, tablets and other touch devices mid, desktops high. */
export function detectTier(): Tier {
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (!coarse) return 'high';
    const nav = navigator as Navigator & { deviceMemory?: number };
    const shortSide = Math.min(screen.width, screen.height);
    const weak = (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) || (navigator.hardwareConcurrency ?? 8) <= 4;
    return shortSide < 700 || weak ? 'low' : 'mid';
}

/** Tier from `?tier=` in the URL, then a saved choice, then platform detection. */
export function initialTier(): Tier {
    const fromUrl = new URLSearchParams(location.search).get('tier');
    if (isTier(fromUrl)) return fromUrl;
    try { const saved = localStorage.getItem(STORAGE_KEY); if (isTier(saved)) return saved; } catch { /* storage unavailable */ }
    return detectTier();
}

export function saveTier(t: Tier): void {
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* storage unavailable */ }
}

export function nextTier(t: Tier): Tier { return TIERS[(TIERS.indexOf(t) + 1) % TIERS.length]; }

export function pixelRatioFor(t: Tier): number { return Math.min(devicePixelRatio, TIER_SETTINGS[t].maxPixelRatio); }
