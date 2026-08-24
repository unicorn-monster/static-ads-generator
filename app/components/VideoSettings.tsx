"use client";

import type { ModelSpec } from "@/lib/types";
import type { SettingsValues } from "./SettingsPanel";

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-100 mb-2 font-mono">{label}</label>
      {children}
      {note && <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">{note}</p>}
    </div>
  );
}

function Pills({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const sel = o === value;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
              sel
                ? "border-blue-500 ring-1 ring-blue-500 text-blue-400 bg-blue-500/10"
                : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
        checked ? "bg-blue-600" : "bg-slate-700"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-slate-900 shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// Fallback order — also exactly Grok's image-to-video form order on kie.ai.
// (Grok's text-to-video form swaps mode and aspect_ratio; not worth branching for.)
const DEFAULT_ORDER = ["mode", "aspect_ratio", "duration", "resolution", "generate_audio", "nsfw_checker"];

export function VideoSettings({
  model,
  values,
  onChange,
}: {
  model: ModelSpec;
  values: SettingsValues;
  onChange: (patch: Partial<SettingsValues>) => void;
}) {
  const dur = model.duration ?? { min: 1, max: 10, step: 1, default: 1 };
  const durValue = values.duration ?? dur.default;

  // Each control keyed by its Kie field name; the model's fieldOrder decides what renders where.
  const fields: Record<string, React.ReactNode> = {
    mode: model.extras?.modes && (
      <Field label="mode" note={model.notes?.mode}>
        <Pills options={model.extras.modes} value={values.mode ?? model.extras.modes[0]} onChange={(v) => onChange({ mode: v })} />
      </Field>
    ),
    aspect_ratio: (
      <Field label="aspect_ratio" note={model.notes?.aspect_ratio}>
        <Pills options={model.aspectRatios} value={values.aspectRatio} onChange={(v) => onChange({ aspectRatio: v })} />
      </Field>
    ),
    duration: (
      <Field label="duration" note={model.notes?.duration}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={dur.min}
            max={dur.max}
            step={dur.step}
            value={durValue}
            onChange={(e) => onChange({ duration: Number(e.target.value) })}
            className="flex-1 accent-blue-500 cursor-pointer"
          />
          <span className="w-14 text-center text-sm tabular-nums rounded-md border border-slate-700 bg-slate-800 py-1.5">
            {durValue}s
          </span>
        </div>
      </Field>
    ),
    resolution: model.resolutions && (
      <Field label="resolution" note={model.notes?.resolution}>
        <Pills options={model.resolutions} value={values.resolution} onChange={(v) => onChange({ resolution: v })} />
      </Field>
    ),
    generate_audio: model.extras?.audio && (
      <Field label="generate_audio" note={model.notes?.generate_audio}>
        <Toggle checked={values.generateAudio ?? true} onChange={(v) => onChange({ generateAudio: v })} />
      </Field>
    ),
    web_search: model.extras?.webSearch && (
      <Field label="web_search" note={model.notes?.web_search}>
        <Toggle checked={values.webSearch ?? false} onChange={(v) => onChange({ webSearch: v })} />
      </Field>
    ),
    nsfw_checker: model.exposeNsfw && (
      <Field label="nsfw_checker" note={model.notes?.nsfw_checker}>
        <Toggle checked={values.nsfwChecker ?? false} onChange={(v) => onChange({ nsfwChecker: v })} />
      </Field>
    ),
  };

  return (
    <div className="space-y-5">
      {(model.fieldOrder ?? DEFAULT_ORDER)
        .filter((name) => fields[name])
        .map((name) => (
          <div key={name}>{fields[name]}</div>
        ))}
    </div>
  );
}
