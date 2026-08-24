"use client";

import { useRef, useState } from "react";
import { parsePromptsFromCsv } from "@/lib/csv";
import { MAX_TOTAL_PROMPTS } from "@/lib/models";

export function PromptPanel({
  value,
  onChange,
  mode,
  count = 0,
  maxChars,
}: {
  value: string;
  onChange: (v: string) => void;
  mode: "bulk" | "single";
  count?: number;
  maxChars?: number;
}) {
  const isBulk = mode === "bulk";
  const atLimit = maxChars != null && value.length >= maxChars;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const handleCsv = async (file: File) => {
    const all = parsePromptsFromCsv(await file.text());
    if (all.length === 0) {
      setWarn("Không tìm thấy prompt nào trong file.");
      return;
    }
    onChange(all.slice(0, MAX_TOTAL_PROMPTS).join("\n\n")); // replace; downstream counter recomputes
    setWarn(
      all.length > MAX_TOTAL_PROMPTS
        ? `File có ${all.length} prompt — chỉ nạp ${MAX_TOTAL_PROMPTS} đầu (tối đa ${MAX_TOTAL_PROMPTS}/lần).`
        : null
    );
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <label className="block text-sm font-medium text-slate-200">Prompt</label>
        {isBulk && count > 1 && (
          <span className="text-xs font-medium text-blue-300 bg-blue-500/15 rounded-full px-2 py-0.5">
            {count} prompts
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {isBulk && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleCsv(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Upload CSV — cột đầu mỗi dòng là 1 prompt (tối đa 100)"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-200 hover:text-white border border-slate-600 hover:border-slate-500 hover:bg-slate-800 rounded-md px-3.5 py-1.5 transition-colors cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload CSV
              </button>
            </>
          )}
          {value && (
            <button
              onClick={() => {
                onChange("");
                setWarn(null);
              }}
              className="text-xs font-medium text-red-400 hover:text-red-300 border border-red-500/40 hover:border-red-500 rounded px-2 py-0.5 transition-colors cursor-pointer"
            >
              × Clear
            </button>
          )}
        </div>
      </div>
      <textarea
        rows={6}
        value={value}
        maxLength={maxChars}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          isBulk
            ? "Describe the image you want to generate.\n\nFor multiple images, separate each prompt with a blank line."
            : "Describe the video you want to generate."
        }
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-slate-600 resize-none transition"
      />
      <div className="flex items-center justify-between mt-1 text-[10px]">
        <span className="text-slate-500">
          {isBulk
            ? "Separate each prompt with a blank line. Max 100 at a time."
            : "One video per generation."}
        </span>
        {maxChars != null && (
          <span className={`tabular-nums ${atLimit ? "text-red-400 font-medium" : "text-slate-500"}`}>
            {value.length.toLocaleString("vi-VN")}/{maxChars.toLocaleString("vi-VN")}
          </span>
        )}
      </div>
      {warn && <p className="mt-1 text-[10px] text-amber-400">{warn}</p>}
    </div>
  );
}
