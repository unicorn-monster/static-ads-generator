"use client";

import { useRef } from "react";
import type { UploadedImage } from "./UploadDropzone";

export type RefSlot = "video" | "audio";

function Chip({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 max-w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300">
      <span className="truncate">{name}</span>
      <button onClick={onRemove} className="text-slate-500 hover:text-red-400 cursor-pointer">
        &times;
      </button>
    </span>
  );
}

function Slot({
  label,
  note,
  accept,
  multiple,
  full,
  busy,
  files,
  onPick,
  onRemove,
}: {
  label: string;
  note: string;
  accept: string;
  multiple: boolean;
  full: boolean;
  busy: boolean;
  files: UploadedImage[];
  onPick: (files: File[]) => void;
  onRemove: (filename: string) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-100 mb-2 font-mono">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        {files.map((f) => (
          <Chip key={f.filename} name={f.filename} onRemove={() => onRemove(f.filename)} />
        ))}
        {!full && (
          <button
            onClick={() => ref.current?.click()}
            disabled={busy}
            className="rounded-md border border-dashed border-slate-700 px-2.5 py-1 text-[11px] text-slate-400 hover:border-slate-500 hover:text-slate-300 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {busy ? "Đang tải…" : "+ Chọn file"}
          </button>
        )}
        <input
          ref={ref}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) onPick(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </div>
      <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">{note}</p>
    </div>
  );
}

export function RefMediaPanel({
  videos,
  audios,
  maxVideos,
  maxAudios,
  busy,
  onPick,
  onRemove,
}: {
  videos: UploadedImage[];
  audios: UploadedImage[];
  maxVideos: number;
  maxAudios: number;
  busy: RefSlot | null;
  onPick: (slot: RefSlot, files: File[]) => void;
  onRemove: (slot: RefSlot, filename: string) => void;
}) {
  return (
    <div className="space-y-5">
      {maxVideos > 0 && (
        <Slot
          label="reference_video_urls"
          note={`A list of input video URLs. Tối đa ${maxVideos} file · MP4/QUICKTIME/X-MATROSKA · ≤50MB mỗi file · tổng thời lượng ≤15s.`}
          accept="video/mp4,video/quicktime,video/x-matroska"
          multiple
          full={videos.length >= maxVideos}
          busy={busy === "video"}
          files={videos}
          onPick={(f) => onPick("video", f)}
          onRemove={(n) => onRemove("video", n)}
        />
      )}

      {maxAudios > 0 && (
        <Slot
          label="reference_audio_urls"
          note={`A list of input audio URLs. Tối đa ${maxAudios} file · MPEG/WAV/X-WAV/AAC/MP4/OGG · ≤15MB mỗi file · tổng thời lượng ≤15s.`}
          accept="audio/mpeg,audio/wav,audio/x-wav,audio/aac,audio/mp4,audio/ogg"
          multiple
          full={audios.length >= maxAudios}
          busy={busy === "audio"}
          files={audios}
          onPick={(f) => onPick("audio", f)}
          onRemove={(n) => onRemove("audio", n)}
        />
      )}
    </div>
  );
}
