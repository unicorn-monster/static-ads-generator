"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionItem } from "@/lib/types";
import { loadGallery, saveGallery, clearGalleryStorage } from "@/lib/gallery";

/**
 * Recent (session, in-memory) + Gallery (persisted to localStorage under `storageKey`).
 * Image uses key "sag_gallery_v1" (preserves existing data); video uses "sag_video_gallery_v1".
 */
export function useGallery(storageKey: string) {
  const [session, setSession] = useState<SessionItem[]>([]);
  const [gallery, setGallery] = useState<SessionItem[]>([]);

  useEffect(() => {
    setGallery(loadGallery(storageKey));
  }, [storageKey]);

  const add = useCallback(
    (item: SessionItem) => {
      setSession((prev) => [item, ...prev]);
      setGallery((prev) => {
        const updated = [item, ...prev];
        saveGallery(storageKey, updated);
        return updated;
      });
    },
    [storageKey]
  );

  const removeSession = useCallback((id: string) => {
    setSession((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const removeGallery = useCallback(
    (id: string) => {
      setGallery((prev) => {
        const updated = prev.filter((i) => i.id !== id);
        saveGallery(storageKey, updated);
        return updated;
      });
    },
    [storageKey]
  );

  const clearSession = useCallback(() => setSession([]), []);

  const clearGallery = useCallback(() => {
    setGallery([]);
    clearGalleryStorage(storageKey);
  }, [storageKey]);

  return { session, gallery, add, removeSession, removeGallery, clearSession, clearGallery };
}
