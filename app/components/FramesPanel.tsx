"use client";

import { useRef } from "react";
import type { UploadedImage } from "./UploadDropzone";

export type FrameSlot = "first" | "last";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/bmp";

function Slot({
  label,
  image,
  busy,
  onPick,
  onRemove,
}: {
  label: string;
  image: UploadedImage | null;
  busy: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <div className="flex-1 min-w-0">
      <p className="rounded-md border border-slate-700 bg-slate-800 py-1 text-center text-[11px] font-mono text-slate-300 mb-1.5">
        {label}
      </p>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files[0]) onPick(e.dataTransfer.files[0]);
        }}
        onClick={() => !image && ref.current?.click()}
        className={`relative aspect-video rounded-lg border-2 border-dashed border-slate-700 bg-slate-800/50 flex items-center justify-center overflow-hidden transition-colors ${
          image ? "" : "hover:border-slate-600 cursor-pointer"
        }`}
      >
        {image ? (
          <>
            <img src={image.url} alt={label} className="h-full w-full object-cover" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center hover:bg-red-600 cursor-pointer"
            >
              &times;
            </button>
          </>
        ) : (
          <svg className="h-6 w-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V4.5m0 0L8.25 8.25M12 4.5l3.75 3.75M4.5 16.5v1.875A1.625 1.625 0 006.125 20h11.75A1.625 1.625 0 0019.5 18.375V16.5" />
          </svg>
        )}
        {busy && (
          <div className="absolute inset-0 bg-slate-900/70 flex items-center justify-center">
            <svg className="animate-spin h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        )}
        <input
          ref={ref}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) onPick(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

/** Kie's "Frames" block: first_frame_url + last_frame_url side by side. */
export function FramesPanel({
  firstFrame,
  lastFrame,
  busy,
  disabled,
  onPick,
  onRemove,
}: {
  firstFrame: UploadedImage | null;
  lastFrame: UploadedImage | null;
  busy: FrameSlot | null;
  /** Reference images are in use — Kie rejects frames + reference images together. */
  disabled?: boolean;
  onPick: (slot: FrameSlot, file: File) => void;
  onRemove: (slot: FrameSlot) => void;
}) {
  return (
    <div className={disabled ? "opacity-40 pointer-events-none" : undefined}>
      <h3 className="text-sm font-medium text-slate-200 mb-2">Frames</h3>
      <div className="flex gap-2">
        <Slot
          label="first_frame_url"
          image={firstFrame}
          busy={busy === "first"}
          onPick={(f) => onPick("first", f)}
          onRemove={() => onRemove("first")}
        />
        <Slot
          label="last_frame_url"
          image={lastFrame}
          busy={busy === "last"}
          onPick={(f) => onPick("last", f)}
          onRemove={() => onRemove("last")}
        />
      </div>
      <p className="text-[10px] text-slate-500 mt-1.5">
        Click to upload or drag and drop images · JPEG/JPG/PNG/WebP/GIF/BMP, Max 30MB
      </p>
    </div>
  );
}
