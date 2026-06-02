"use client";

import { useEffect } from "react";
import type { Modality } from "@/lib/types";

export function Lightbox({
  preview,
  onClose,
}: {
  preview: { url: string; kind: Modality } | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!preview) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-[90vh] w-full mx-6" onClick={(e) => e.stopPropagation()}>
        {preview.kind === "video" ? (
          <video
            src={preview.url}
            controls
            autoPlay
            playsInline
            className="w-full h-full object-contain rounded-lg shadow-2xl max-h-[85vh]"
          />
        ) : (
          <img
            src={preview.url}
            alt="Preview"
            className="w-full h-full object-contain rounded-lg shadow-2xl max-h-[85vh]"
          />
        )}
      </div>
    </div>
  );
}
