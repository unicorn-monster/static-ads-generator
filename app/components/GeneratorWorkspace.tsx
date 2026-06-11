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
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [tab, setTab] = useState<"recent" | "gallery">("recent");
  const [preview, setPreview] = useState<{ url: string; kind: Modality } | null>(null);
  const [newestId, setNewestId] = useState<string | null>(null);

  // Drive sync: selection + modal state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syncOpen, setSyncOpen] = useState(false);
  const [product, setProduct] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<
    {
      folders: { folderName: string; webViewLink: string | null }[];
      count: number;
      failed: { name: string; reason: string }[];
    } | null
  >(null);

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

  // Remember last product name across sessions.
  useEffect(() => {
    try {
      const p = localStorage.getItem("sag_last_product");
      if (p) setProduct(p);
    } catch {}
  }, []);

  // Selection is per-list; reset when switching Recent/Gallery.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
    setUploadError(null);
    // Upload each file in its own request: Vercel serverless caps a request body at 4.5MB,
    // so batching every file into one POST fails once their combined size crosses that limit.
    const settled = await Promise.allSettled(
      toUpload.map(async (f) => {
        const fd = new FormData();
        fd.append("files", f);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const detail = (await res.json().catch(() => ({}))).detail;
          throw new Error(detail ?? (res.status === 413 ? "File quá lớn (>4MB)" : `Upload failed (${res.status})`));
        }
        const [uploaded] = (await res.json()) as UploadedImage[];
        return uploaded;
      })
    );
    const uploaded = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (uploaded.length > 0) setImages((prev) => [...prev, ...uploaded]);
    const firstError = settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (firstError) {
      const reason = firstError.reason instanceof Error ? firstError.reason.message : "Upload failed";
      setUploadError(`${settled.length - uploaded.length}/${toUpload.length} ảnh lỗi: ${reason}`);
    }
    setUploading(false);
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
    aspectRatio: settings.aspectRatio,
    duration: settings.duration,
    count: Math.max(prompts.length, 1),
    generateAudio: settings.generateAudio,
  });
  const priceVnd = priceCredits != null ? creditsToVnd(priceCredits) : null;

  const list = tab === "recent" ? gallery.session : gallery.gallery;

  const selectedItems = list.filter((i) => selectedIds.has(i.id));
  const allSelected = list.length > 0 && selectedItems.length === list.length;
  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(list.map((i) => i.id)));

  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const productSlug = product.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
  const folderPreview = `${productSlug || "product"}-${today}-001`;

  // A Drive folder holds at most 50 images (downstream Meta tool limit). Over that → auto-split.
  const MAX_PER_FOLDER = 50;
  const splitNeeded = selectedItems.length > MAX_PER_FOLDER;
  const folderCount = Math.max(1, Math.ceil(selectedItems.length / MAX_PER_FOLDER));
  const chunkSizes = Array.from({ length: folderCount }, (_, i) =>
    Math.min(MAX_PER_FOLDER, selectedItems.length - i * MAX_PER_FOLDER)
  );

  const doSync = async () => {
    setSyncing(true);
    setSyncError(null);
    const items = selectedItems.map((it, i) => {
      const ext = String(it.settings.ext ?? (it.kind === "video" ? "mp4" : "png"));
      return { url: it.mediaUrl, name: `${it.kind}-${String(i + 1).padStart(2, "0")}.${ext}` };
    });
    setSyncProgress({ done: 0, total: items.length });
    try {
      // Split into chunks of MAX_PER_FOLDER — each chunk becomes one Drive folder.
      const chunks: (typeof items)[] = [];
      for (let i = 0; i < items.length; i += MAX_PER_FOLDER) chunks.push(items.slice(i, i + MAX_PER_FOLDER));

      // Step 1: create folders sequentially so batch numbers (-001, -002…) don't race.
      const folders: { folderId: string; folderName: string; webViewLink: string | null }[] = [];
      for (let c = 0; c < chunks.length; c++) {
        const startRes = await fetch("/api/sync-drive/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product, date: today }),
        });
        const startData = await startRes.json();
        if (!startRes.ok) throw new Error(startData.detail ?? "Could not create folder");
        folders.push({
          folderId: startData.folderId,
          folderName: startData.folderName,
          webViewLink: startData.webViewLink,
        });
      }

      // Step 2: upload every image (across all folders) with a concurrency pool; progress over the total.
      const jobs = chunks.flatMap((chunk, c) => chunk.map((it) => ({ ...it, folderId: folders[c].folderId })));
      let done = 0;
      const failed: { name: string; reason: string }[] = [];
      let idx = 0;
      const worker = async () => {
        while (idx < jobs.length) {
          const job = jobs[idx++];
          try {
            const r = await fetch("/api/sync-drive/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ folderId: job.folderId, url: job.url, name: job.name }),
            });
            if (!r.ok) {
              const d = await r.json().catch(() => ({}));
              throw new Error(d.detail ?? `failed ${r.status}`);
            }
          } catch (e) {
            failed.push({ name: job.name, reason: e instanceof Error ? e.message : "unknown" });
          } finally {
            done++;
            setSyncProgress({ done, total: jobs.length });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));

      try {
        localStorage.setItem("sag_last_product", product);
      } catch {}
      setSyncResult({
        folders: folders.map((f) => ({ folderName: f.folderName, webViewLink: f.webViewLink })),
        count: jobs.length - failed.length,
        failed,
      });
      setSyncOpen(false);
      setSelectedIds(new Set());
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  };

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
              onClear={() => {
                setImages([]);
                setUploadError(null);
              }}
            />
          )}
          {uploadError && <p className="text-xs text-red-400 -mt-1">{uploadError}</p>}

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
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition-colors cursor-pointer shadow-sm"
              >
                {allSelected ? "Deselect All" : "Select All"}
              </button>
              <button
                onClick={() => {
                  setSyncResult(null);
                  setSyncError(null);
                  setSyncOpen(true);
                }}
                disabled={selectedItems.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600/15 border border-blue-500/50 text-blue-200 hover:bg-blue-600/25 transition-colors cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 13l3-3m0 0l3 3m-3-3v9" />
                </svg>
                Sync to Drive ({selectedItems.length})
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
                    selected={selectedIds.has(item.id)}
                    onToggleSelect={toggleSelect}
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
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={toggleSelect}
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

      {syncOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm"
          onClick={() => !syncing && setSyncOpen(false)}
        >
          <div
            className="w-[420px] max-w-[92vw] rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-100">
              <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 13l3-3m0 0l3 3m-3-3v9" />
              </svg>
              Sync to Google Drive
            </h3>

            <label className="block text-xs text-slate-400 mb-1.5">Product name</label>
            <input
              autoFocus
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && product.trim() && !syncing) doSync();
              }}
              placeholder="e.g. hatnet"
              className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-sm outline-none focus:border-blue-500 mb-3.5"
            />

            {splitNeeded ? (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-[13px]">
                <div className="text-amber-400 font-semibold mb-2">
                  ⚠ You selected {selectedItems.length} images — over {MAX_PER_FOLDER}/folder → will create {folderCount} folders
                </div>
                <div className="flex flex-col gap-1.5">
                  {chunkSizes.map((n, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5"
                    >
                      <span className="font-mono font-bold text-green-400 text-xs">
                        📁 {productSlug || "product"}-{today}-{String(i + 1).padStart(3, "0")}
                      </span>
                      <span className="text-slate-400 text-xs">{n} images</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-3 text-[13px]">
                <div className="text-slate-400">
                  📁 Dino IMG / <span className="font-mono font-bold text-green-400">{folderPreview}</span>
                </div>
                <div className="text-slate-400 text-xs mt-1.5">
                  Will create a new folder &amp; upload <b className="text-slate-200">{selectedItems.length}</b> images here{" "}
                  <span className="opacity-60">(batch number auto-increments)</span>
                </div>
              </div>
            )}

            {syncError && <p className="text-xs text-red-400 mt-3">{syncError}</p>}

            {syncing && syncProgress && (
              <div className="mt-4">
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-200"
                    style={{ width: `${syncProgress.total ? (syncProgress.done / syncProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  Uploading {syncProgress.done}/{syncProgress.total}...
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2.5 mt-5">
              <button
                onClick={() => setSyncOpen(false)}
                disabled={syncing}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={doSync}
                disabled={syncing || !product.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {syncing
                  ? syncProgress
                    ? `Uploading ${syncProgress.done}/${syncProgress.total}...`
                    : "Uploading..."
                  : "Upload to Drive →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {syncResult && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-4 rounded-xl border border-green-500 bg-slate-800 px-5 py-3.5 shadow-2xl">
          <span className="text-green-400 font-semibold text-sm">
            ✓ Uploaded {syncResult.count} images
            {syncResult.failed.length > 0 ? ` (${syncResult.failed.length} failed)` : ""}
            {syncResult.folders.length > 1
              ? ` to ${syncResult.folders.length} folders`
              : ` → ${syncResult.folders[0]?.folderName ?? ""}`}
          </span>
          <div className="flex items-center gap-3">
            {syncResult.folders.map(
              (f, i) =>
                f.webViewLink && (
                  <a
                    key={i}
                    href={f.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 font-semibold text-sm hover:underline whitespace-nowrap"
                  >
                    {syncResult.folders.length > 1 ? `Folder ${i + 1} ↗` : "Open folder ↗"}
                  </a>
                )
            )}
          </div>
          <button onClick={() => setSyncResult(null)} className="text-slate-400 hover:text-slate-200 cursor-pointer">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
