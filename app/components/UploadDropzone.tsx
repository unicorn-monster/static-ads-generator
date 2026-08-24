"use client";

import { useRef, useState } from "react";
import type { ImageInput } from "@/lib/types";

export interface UploadedImage {
  filename: string;
  url: string;
}

export function UploadDropzone({
  images,
  maxImages,
  imageInput,
  uploading,
  onFiles,
  onRemove,
  onClear,
  labelFor,
  title,
  hint,
  disabled,
}: {
  images: UploadedImage[];
  maxImages: number;
  imageInput: ImageInput;
  uploading: boolean;
  onFiles: (files: FileList | File[]) => void;
  onRemove: (filename: string) => void;
  onClear: () => void;
  /** Optional per-slot badge, e.g. "@Image1" for Seedance reference images. */
  labelFor?: (index: number) => string | null;
  /** Section heading; defaults to the generic "Image Input". */
  title?: string;
  hint?: string;
  /** Frame images are in use — Kie rejects frames + reference images together. */
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className={disabled ? "opacity-40 pointer-events-none" : undefined}>
      <div className="flex items-center gap-2 mb-1.5">
        <label className={`block text-sm text-slate-200 ${title ? "font-semibold font-mono" : "font-medium"}`}>
          {title ?? "Image Input"}
          <span className="text-xs text-slate-500 font-normal font-sans ml-1">
            {imageInput === "required" ? `(required, 1–${maxImages})` : `(optional, up to ${maxImages})`}
          </span>
        </label>
        {images.length > 0 && (
          <button
            onClick={onClear}
            className="ml-auto text-xs font-medium text-red-400 hover:text-red-300 border border-red-500/40 hover:border-red-500 rounded px-2 py-0.5 transition-colors cursor-pointer"
          >
            × Clear
          </button>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`relative rounded-lg border-2 border-dashed transition-colors cursor-pointer
          ${dragOver ? "border-black bg-slate-800" : "border-slate-700 bg-slate-800 hover:border-slate-600"}
          ${images.length > 0 ? "p-3" : "p-6"}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) onFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {images.length === 0 ? (
          <div className="flex flex-col items-center text-slate-500">
            <svg className="h-8 w-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
            <p className="text-xs">Click to upload or drag and drop</p>
            <p className="text-[10px] mt-0.5 text-slate-600">
              JPEG, PNG, WEBP, JPG, GIF, BMP &middot; Max 30MB/ảnh &middot; Up to {maxImages} file
              {maxImages > 1 ? "s" : ""}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {images.map((img, i) => (
              <div key={img.filename} className="relative group rounded-lg overflow-hidden aspect-square bg-slate-800">
                <img src={img.url} alt="Reference" className="w-full h-full object-cover" />
                {labelFor?.(i) && (
                  <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-slate-200 text-center py-0.5 font-mono">
                    {labelFor(i)}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(img.filename);
                  }}
                  className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600 cursor-pointer"
                >
                  &times;
                </button>
              </div>
            ))}
            {images.length < maxImages && (
              <div className="flex items-center justify-center aspect-square rounded-lg border border-dashed border-slate-700 text-slate-600 hover:border-slate-500 hover:text-slate-500 transition-colors">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
            )}
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 bg-slate-900/70 flex items-center justify-center rounded-lg">
            <svg className="animate-spin h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        )}
      </div>
      <p className="text-[10px] text-slate-500 mt-1">{hint ?? "Input images to transform or use as reference"}</p>
    </div>
  );
}
