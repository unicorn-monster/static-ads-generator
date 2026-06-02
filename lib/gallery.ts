import type { SessionItem } from "./types";

// localStorage-backed Gallery. FIX #3: no destructive prune — entries persist; dead media is
// handled visually (ResultCard onError shows "expired"). Legacy entries are normalized on read.

interface LegacyImage {
  id: string;
  prompt?: string;
  image_url?: string;
  mediaUrl?: string;
  kind?: SessionItem["kind"];
  settings?: Record<string, string | number | boolean>;
  timestamp?: number;
}

function normalize(raw: LegacyImage): SessionItem {
  return {
    id: raw.id,
    kind: raw.kind ?? "image",
    prompt: raw.prompt ?? "",
    mediaUrl: raw.mediaUrl ?? raw.image_url ?? "",
    settings: raw.settings ?? {},
    timestamp: raw.timestamp ?? 0,
  };
}

export function loadGallery(key: string): SessionItem[] {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const arr = JSON.parse(stored) as LegacyImage[];
    return Array.isArray(arr) ? arr.map(normalize) : [];
  } catch {
    return [];
  }
}

export function saveGallery(key: string, items: SessionItem[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    /* quota / unavailable — ignore */
  }
}

export function clearGalleryStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
