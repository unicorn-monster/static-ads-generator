"use client";

import { useRef, useState } from "react";
import type { UploadedImage } from "./UploadDropzone";

export type RefSlot = "video" | "audio";

const VideoIcon = (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h8.25a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H4.5A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
  </svg>
);

const AudioIcon = (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
  </svg>
);

function Slot({
  label,
  icon,
  accept,
  formats,
  maxMb,
  maxFiles,
  note,
  files,
  busy,
  onPick,
  onRemove,
}: {
  label: string;
  icon: React.ReactNode;
  accept: string;
  formats: string;
  maxMb: number;
  maxFiles: number;
  note: string;
  files: UploadedImage[];
  busy: boolean;
  onPick: (files: File[]) => void;
  onRemove: (filename: string) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const full = files.length >= maxFiles;

  return (
    <div>
      <label className="block text-sm font-semibold text-slate-100 mb-2 font-mono">{label}</label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!full && e.dataTransfer.files.length > 0) onPick(Array.from(e.dataTransfer.files));
        }}
        onClick={() => !full && ref.current?.click()}
        className={`relative rounded-lg border-2 border-dashed transition-colors
          ${dragOver ? "border-blue-500 bg-slate-800" : "border-slate-700 bg-slate-800 hover:border-slate-600"}
          ${full ? "" : "cursor-pointer"}
          ${files.length > 0 ? "p-3" : "p-6"}`}
      >
        <input
          ref={ref}
          type="file"
          accept={accept}
          multiple={maxFiles > 1}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) onPick(Array.from(e.target.files));
            e.target.value = "";
          }}
        />

        {files.length === 0 ? (
          <div className="flex flex-col items-center text-slate-500">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-700/60 mb-2">{icon}</span>
            <p className="text-xs">Click to upload or drag and drop</p>
            <p className="text-[10px] mt-0.5 text-slate-600 text-center">
              {formats} &middot; Max {maxMb}MB &middot; Up to {maxFiles} files
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {files.map((f) => (
              <div
                key={f.filename}
                className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1.5"
              >
                <span className="text-slate-500 shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
                <span className="truncate text-[11px] text-slate-300">{f.filename}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(f.filename);
                  }}
                  className="ml-auto shrink-0 text-slate-500 hover:text-red-400 cursor-pointer"
                >
                  &times;
                </button>
              </div>
            ))}
            {!full && (
              <p className="text-center text-[11px] text-slate-500 pt-0.5">
                + Thêm file ({files.length}/{maxFiles})
              </p>
            )}
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 bg-slate-900/70 flex items-center justify-center rounded-lg">
            <svg className="animate-spin h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        )}
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
          icon={VideoIcon}
          accept="video/mp4,video/quicktime,video/x-matroska"
          formats="MP4, QUICKTIME, X-MATROSKA"
          maxMb={50}
          maxFiles={maxVideos}
          note="A list of input video URLs. Tổng thời lượng của các video không được vượt quá 15 giây."
          files={videos}
          busy={busy === "video"}
          onPick={(f) => onPick("video", f)}
          onRemove={(n) => onRemove("video", n)}
        />
      )}

      {maxAudios > 0 && (
        <Slot
          label="reference_audio_urls"
          icon={AudioIcon}
          accept="audio/mpeg,audio/wav,audio/x-wav,audio/aac,audio/mp4,audio/ogg"
          formats="MPEG, WAV, X-WAV, AAC, MP4, OGG"
          maxMb={15}
          maxFiles={maxAudios}
          note="A list of input audio URLs. Tổng thời lượng của các audio không được vượt quá 15 giây."
          files={audios}
          busy={busy === "audio"}
          onPick={(f) => onPick("audio", f)}
          onRemove={(n) => onRemove("audio", n)}
        />
      )}
    </div>
  );
}
