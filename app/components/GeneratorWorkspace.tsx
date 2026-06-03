"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { getModel } from "@/lib/models";
import { creditsToVnd, formatVnd } from "@/lib/pricing";
import type { Modality, ModelSpec, SessionItem } from "@/lib/types";
import { useGallery } from "@/app/hooks/useGallery";
import { useGeneration } from "@/app/hooks/useGeneration";
import { PromptPanel } from "./PromptPanel";
import { UploadDropzone, type UploadedImage } from "./UploadDropzone";
import { SettingsPanel, type SettingsValues } from "./SettingsPanel";
import { VideoSettings } from "./VideoSettings";
import { ResultCard } from "./ResultCard";
import { ProcessingCard } from "./ProcessingCard";
import { ErrorCard } from "./ErrorCard";
import { Lightbox } from "./Lightbox";

function parseBulkPrompts(text: string): string[] {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0);
}

function defaultSettings(m: ModelSpec): SettingsValues {
  return {
    aspectRatio: m.defaults?.aspectRatio ?? m.aspectRatios[0],
    resolution: m.defaults?.resolution ?? m.resolutions?.[0] ?? "",
    format: m.formats ? m.formats[0] : undefined,
    duration: m.duration ? m.duration.default : undefined,
    mode: m.extras?.modes ? m.defaults?.mode ?? m.extras.modes[0] : undefined,
    generateAudio: m.extras?.audio ? true : undefined,
    nsfwChecker: m.exposeNsfw ? false : undefined,
  };
}

export function GeneratorWorkspace({
  modality,
  models,
  defaultModelId,
  storageKey,
  bulk,
}: {
  modality: Modality;
  models: ModelSpec[];
  defaultModelId: string;
  storageKey: string;
  bulk: boolean;
}) {
  const noun = modality === "video" ? "Video" : "Image";

  const [modelId, setModelId] = useState(defaultModelId);
  const model = getModel(modelId)!;

  const [promptText, setPromptText] = useState("");
  const [settings, setSettings] = useState<SettingsValues>(() => defaultSettings(getModel(defaultModelId)!));
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);

  const [tab, setTab] = useState<"recent" | "gallery">("recent");
  const [preview, setPreview] = useState<{ url: string; kind: Modality } | null>(null);
  const [newestId, setNewestId] = useState<string | null>(null);

  const gallery = useGallery(storageKey);
  const { tasks, generate, dismiss } = useGeneration(
    useCallback(
      (item: SessionItem) => {
        gallery.add(item);
        setNewestId(item.id);
      },
      [gallery]
    )
  );

  // Preselect model from ?model= (set by MegaNav). Client-only.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("model");
    const m = id ? getModel(id) : undefined;
    if (m && m.modality === modality) {
      setModelId(m.id);
      setSettings(defaultSettings(m));
    }
  }, [modality]);

  useEffect(() => {
    if (!newestId) return;
    const t = setTimeout(() => setNewestId(null), 2000);
    return () => clearTimeout(t);
  }, [newestId]);

  const onModelChange = (id: string) => {
    const next = getModel(id);
    if (!next) return;
    setModelId(id);
    setSettings((s) => {
      const fresh = defaultSettings(next);
      return {
        ...fresh,
        aspectRatio: next.aspectRatios.includes(s.aspectRatio) ? s.aspectRatio : fresh.aspectRatio,
        resolution: next.resolutions?.includes(s.resolution) ? s.resolution : fresh.resolution,
      };
    });
    setImages((imgs) => imgs.slice(0, next.maxImages));
  };

  const handleFiles = async (files: FileList | File[]) => {
    const remaining = model.maxImages - images.length;
    const toUpload = Array.from(files).slice(0, remaining);
    if (toUpload.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      toUpload.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Upload failed");
      const data: UploadedImage[] = await res.json();
      setImages((prev) => [...prev, ...data]);
    } catch (e) {
      console.error("Upload failed:", e instanceof Error ? e.message : e);
    } finally {
      setUploading(false);
    }
  };

  const prompts = useMemo(
    () => (bulk ? parseBulkPrompts(promptText) : promptText.trim() ? [promptText.trim()] : []),
    [promptText, bulk]
  );
  const missingImages = model.imageInput === "required" && images.length === 0;
  const activeCount = tasks.filter((t) => t.stage !== "error").length;

  const handleGenerate = () => {
    if (prompts.length === 0 || missingImages) return;
    generate({
      model,
      prompts,
      imageUrls: images.map((i) => i.url),
      aspectRatio: settings.aspectRatio,
      resolution: settings.resolution,
      outputFormat: settings.format,
      duration: settings.duration,
      mode: settings.mode,
      generateAudio: settings.generateAudio,
      nsfwChecker: settings.nsfwChecker,
    });
  };

  const downloadSingle = async (url: string, ext: string) => {
    try {
      const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ad.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank");
    }
  };

  const downloadAllZip = async (items: SessionItem[], zipName: string) => {
    const zip = new JSZip();
    await Promise.all(
      items.map(async (item, i) => {
        const ext = String(item.settings.ext ?? (item.kind === "video" ? "mp4" : "png"));
        const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(item.mediaUrl)}`);
        zip.file(`${item.kind}-${String(i + 1).padStart(2, "0")}.${ext}`, await res.blob());
      })
    );
    const content = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  const genLabel = bulk
    ? prompts.length <= 1
      ? "Generate"
      : `Generate ${prompts.length} ${noun}s`
    : `Generate ${noun}`;

  // Dynamic price: credits from current settings × output count → VND. null = pricing uncertain (Seedance).
  const priceCredits = model.priceCredits?.({
    resolution: settings.resolution,
    duration: settings.duration,
    count: Math.max(prompts.length, 1),
    generateAudio: settings.generateAudio,
  });
  const priceVnd = priceCredits != null ? creditsToVnd(priceCredits) : null;

  const list = tab === "recent" ? gallery.session : gallery.gallery;

  return (
    <div className="flex h-full overflow-hidden">
      <aside className="w-[35%] min-w-[340px] max-w-[480px] border-r border-slate-700 bg-slate-900 flex flex-col">
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <PromptPanel
            value={promptText}
            onChange={setPromptText}
            mode={bulk ? "bulk" : "single"}
            count={prompts.length}
            maxChars={model.maxPromptChars}
          />

          {model.imageInput !== "none" && (
            <UploadDropzone
              images={images}
              maxImages={model.maxImages}
              imageInput={model.imageInput}
              uploading={uploading}
              onFiles={handleFiles}
              onRemove={(filename) => setImages((prev) => prev.filter((i) => i.filename !== filename))}
              onClear={() => setImages([])}
            />
          )}

          {modality === "video" ? (
            <VideoSettings
              models={models}
              model={model}
              onModelChange={onModelChange}
              values={settings}
              onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            />
          ) : (
            <SettingsPanel
              models={models}
              model={model}
              onModelChange={onModelChange}
              values={settings}
              onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            />
          )}

          <button
            onClick={handleGenerate}
            disabled={prompts.length === 0 || missingImages}
            className="w-full rounded-lg bg-blue-600 text-white text-base font-semibold py-4 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            {activeCount > 0 && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            <span>{genLabel}</span>
            {priceVnd != null && <span className="font-normal opacity-80">· {formatVnd(priceVnd)}đ</span>}
          </button>

          {activeCount > 0 && (
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
              {activeCount} {noun.toLowerCase()}{activeCount !== 1 ? "s" : ""} generating...
            </p>
          )}
          {missingImages && (
            <p className="text-xs text-slate-400">Upload at least 1 image to generate with {model.label.split(" — ")[0]}.</p>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-800 text-[10px] text-slate-500">
          {gallery.session.length} {noun.toLowerCase()}{gallery.session.length !== 1 ? "s" : ""} this session
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        <div className="flex items-center gap-1 px-6 pt-5 pb-3">
          <button
            onClick={() => setTab("recent")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              tab === "recent" ? "bg-blue-600 text-white" : "bg-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            }`}
          >
            Recent
          </button>
          <button
            onClick={() => setTab("gallery")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              tab === "gallery" ? "bg-blue-600 text-white" : "bg-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            }`}
          >
            Gallery {gallery.gallery.length > 0 && <span className="ml-1 text-xs opacity-60">({gallery.gallery.length})</span>}
          </button>

          {list.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => {
                  if (tab === "recent") {
                    if (confirm(`Clear all recent ${noun.toLowerCase()}s?`)) gallery.clearSession();
                  } else if (confirm(`Clear all gallery ${noun.toLowerCase()}s?`)) gallery.clearGallery();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-900 border border-red-500/40 text-red-500 hover:bg-red-500/10 hover:border-red-400 transition-colors cursor-pointer shadow-sm"
              >
                × Clear All
              </button>
              <button
                onClick={() => downloadAllZip(list, `${tab}-${modality}.zip`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition-colors cursor-pointer shadow-sm"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download All ({list.length})
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {tab === "recent" ? (
            gallery.session.length === 0 && tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 select-none">
                <p className="text-7xl font-black tracking-tighter text-slate-800 uppercase flex gap-6">
                  <span>RUN</span><span>MORE</span><span>ADS</span>
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-4">
                {tasks.map((t) =>
                  t.stage === "error" ? (
                    <ErrorCard key={t.taskId} onDismiss={() => dismiss(t.taskId)} />
                  ) : (
                    <ProcessingCard key={t.taskId} label={modality === "video" ? "Rendering..." : "Processing..."} />
                  )
                )}
                {gallery.session.map((item) => (
                  <ResultCard
                    key={item.id}
                    item={item}
                    isNew={item.id === newestId}
                    onPreview={(it) => setPreview({ url: it.mediaUrl, kind: it.kind })}
                    onDownload={downloadSingle}
                    onDelete={gallery.removeSession}
                  />
                ))}
              </div>
            )
          ) : gallery.gallery.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 select-none">
              <p className="text-sm">Gallery is empty</p>
              <p className="text-xs mt-1">Generated {noun.toLowerCase()}s will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-4">
              {gallery.gallery.map((item) => (
                <ResultCard
                  key={item.id}
                  item={item}
                  onPreview={(it) => setPreview({ url: it.mediaUrl, kind: it.kind })}
                  onDownload={downloadSingle}
                  onDelete={gallery.removeGallery}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <Lightbox preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
