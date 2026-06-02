"use client";

import type { ModelSpec } from "@/lib/types";

export interface SettingsValues {
  aspectRatio: string;
  resolution: string;
  format?: string;
  duration?: number;
  mode?: string;
  generateAudio?: boolean;
  nsfwChecker?: boolean;
}

const selectCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-slate-600 transition cursor-pointer";

export function SettingsPanel({
  models,
  model,
  onModelChange,
  values,
  onChange,
}: {
  models: ModelSpec[];
  model: ModelSpec;
  onModelChange: (id: string) => void;
  values: SettingsValues;
  onChange: (patch: Partial<SettingsValues>) => void;
}) {
  return (
    <div>
      <h2 className="text-sm font-medium text-slate-200 mb-2">Settings</h2>

      {/* Model */}
      <div className="mb-2">
        <label className="block text-xs text-slate-400 mb-1">Model</label>
        <select value={model.id} onChange={(e) => onModelChange(e.target.value)} className={selectCls}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Aspect / Resolution / Format|Duration */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Aspect Ratio</label>
          <select
            value={values.aspectRatio}
            onChange={(e) => onChange({ aspectRatio: e.target.value })}
            className={selectCls}
          >
            {model.aspectRatios.map((ar) => (
              <option key={ar} value={ar}>
                {ar}
              </option>
            ))}
          </select>
        </div>
        {model.resolutions && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">Resolution</label>
            <select
              value={values.resolution}
              onChange={(e) => onChange({ resolution: e.target.value })}
              className={selectCls}
            >
              {model.resolutions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        )}

        {model.formats && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">Format</label>
            <select
              value={values.format ?? model.formats[0]}
              onChange={(e) => onChange({ format: e.target.value })}
              className={selectCls}
            >
              {model.formats.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        )}

        {model.extras?.modes && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">Mode</label>
            <select
              value={values.mode ?? model.extras.modes[0]}
              onChange={(e) => onChange({ mode: e.target.value })}
              className={selectCls}
            >
              {model.extras.modes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Audio toggle (Seedance) */}
      {model.extras?.audio && (
        <label className="flex items-center gap-2 mt-2 text-xs text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={values.generateAudio ?? true}
            onChange={(e) => onChange({ generateAudio: e.target.checked })}
            className="rounded border-slate-600"
          />
          Generate audio
        </label>
      )}
    </div>
  );
}
