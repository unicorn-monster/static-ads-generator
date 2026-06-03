"use client";

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
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <label className="block text-sm font-medium text-slate-200">Prompt</label>
        {isBulk && count > 1 && (
          <span className="text-xs font-medium text-blue-300 bg-blue-500/15 rounded-full px-2 py-0.5">
            {count} prompts
          </span>
        )}
        {value && (
          <button
            onClick={() => onChange("")}
            className="ml-auto text-xs font-medium text-red-400 hover:text-red-300 border border-red-500/40 hover:border-red-500 rounded px-2 py-0.5 transition-colors cursor-pointer"
          >
            × Clear
          </button>
        )}
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
            ? "Separate each prompt with a blank line. Max 20 at a time."
            : "One video per generation."}
        </span>
        {maxChars != null && (
          <span className={`tabular-nums ${atLimit ? "text-red-400 font-medium" : "text-slate-500"}`}>
            {value.length.toLocaleString("vi-VN")}/{maxChars.toLocaleString("vi-VN")}
          </span>
        )}
      </div>
    </div>
  );
}
