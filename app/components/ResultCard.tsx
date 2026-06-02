"use client";

import { useState } from "react";
import type { SessionItem } from "@/lib/types";

export function ResultCard({
  item,
  isNew,
  onPreview,
  onDownload,
  onDelete,
}: {
  item: SessionItem;
  isNew?: boolean;
  onPreview?: (item: SessionItem) => void;
  onDownload?: (url: string, ext: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [expired, setExpired] = useState(false);
  const ext = String(item.settings.ext ?? (item.kind === "video" ? "mp4" : "png"));

  return (
    <div
      className={`group relative rounded overflow-hidden bg-slate-900 shadow-sm hover:shadow-md transition-all duration-200 border-[1.5px] border-green-500/50 ${
        isNew ? "animate-fade-in-up" : ""
      }`}
    >
      <div className="px-3 pt-3 pb-1">
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-green-500/15 text-green-400">
          ✓ Completed
        </span>
      </div>

      <div className="relative aspect-square overflow-hidden bg-slate-800">
        {expired ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-center px-2">
            <svg className="h-8 w-8 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[11px]">Expired — generate again</p>
          </div>
        ) : item.kind === "video" ? (
          <video
            src={item.mediaUrl}
            controls
            playsInline
            onError={() => setExpired(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <img
            src={item.mediaUrl}
            alt={item.prompt}
            onClick={() => onPreview?.(item)}
            onError={() => setExpired(true)}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03] cursor-zoom-in"
            loading="lazy"
          />
        )}

        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center text-sm hover:bg-red-600 cursor-pointer"
            title="Delete"
          >
            &times;
          </button>
        )}
      </div>

      <div className="p-3">
        <button
          onClick={() => onDownload?.(item.mediaUrl, ext)}
          disabled={expired}
          className="block w-full text-center bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2 rounded-lg transition-colors cursor-pointer"
        >
          Download {ext.toUpperCase()}
        </button>
      </div>
    </div>
  );
}
