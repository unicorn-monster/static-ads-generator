"use client";

import { useState, useRef, useEffect } from "react";
import JSZip from "jszip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionImage {
  id: string;
  prompt: string;
  image_url: string;
  settings: { aspect_ratio: string; resolution: string; format: string };
  timestamp: number;
}

interface BulkTask {
  taskId: string;
  prompt: string;
  stage: GenerationStage;
  errorMsg?: string;
}

type GenerationStage =
  | "idle"
  | "submitting"
  | "generating"
  | "downloading"
  | "done"
  | "error";

const STAGE_LABELS: Record<GenerationStage, string> = {
  idle: "",
  submitting: "Processing...",
  generating: "Processing...",
  downloading: "Processing...",
  done: "Done!",
  error: "Error",
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GALLERY_KEY = "sag_gallery_v1";

const ASPECT_RATIOS = ["auto", "1:1", "4:5", "9:16", "16:9"];
const RESOLUTIONS = ["1K", "2K", "4K"];
const FORMATS = ["png", "jpg"];

const MODELS = [
  { id: "nano-banana-2", label: "Nano Banana 2" },
  { id: "nano-banana-pro", label: "Nano Banana Pro" },
  { id: "gpt-image-2-image-to-image", label: "GPT Image-2 (img→img)" },
] as const;
type ModelId = typeof MODELS[number]["id"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBulkPrompts(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function ProcessingCard({ stage }: { stage?: GenerationStage }) {
  const label =
    stage && stage !== "idle" && stage !== "done" && stage !== "error"
      ? STAGE_LABELS[stage]
      : "Processing...";
  return (
    <div className="rounded overflow-hidden bg-white shadow-sm border-[1.5px] border-yellow-400">
      <div className="px-3 pt-3 pb-1">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-yellow-100 text-yellow-700">
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          {label}
        </span>
      </div>
      <div className="skeleton aspect-square w-full" />
      <div className="p-3">
        <div className="h-9 rounded-lg bg-gray-100" />
      </div>
    </div>
  );
}

function ErrorCard({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div className="rounded overflow-hidden bg-white shadow-sm border-[1.5px] border-red-300">
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-red-100 text-red-700">
          ✕ Failed
        </span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="h-5 w-5 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 text-xs flex items-center justify-center cursor-pointer"
          >
            &times;
          </button>
        )}
      </div>
      <div className="aspect-square w-full bg-red-50 flex items-center justify-center">
        <svg className="h-10 w-10 text-red-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <div className="p-3">
        <div className="h-9 rounded-lg bg-red-50" />
      </div>
    </div>
  );
}

function ImageCard({
  image,
  onDelete,
  onPreview,
  onDownload,
  isNew,
}: {
  image: SessionImage;
  onDelete?: (id: string) => void;
  onPreview?: (url: string, format: string) => void;
  onDownload?: (url: string, format: string) => void;
  isNew?: boolean;
}) {
  return (
    <div
      className={`group relative rounded overflow-hidden bg-white shadow-sm hover:shadow-md transition-all duration-200 border-[1.5px] border-green-400 ${
        isNew ? "animate-fade-in-up" : ""
      }`}
    >
      <div className="px-3 pt-3 pb-1">
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700">
          ✓ Completed
        </span>
      </div>
      <div className="relative aspect-square overflow-hidden">
        <img
          src={image.image_url}
          alt={image.prompt}
          onClick={() => onPreview?.(image.image_url, image.settings.format)}
          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03] cursor-zoom-in"
          loading="lazy"
        />
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(image.id);
            }}
            className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center text-sm hover:bg-red-600 cursor-pointer"
            title="Delete"
          >
            &times;
          </button>
        )}
      </div>
      <div className="p-3">
        <button
          onClick={() => onDownload?.(image.image_url, image.settings.format)}
          className="block w-full text-center bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2 rounded-lg transition-colors cursor-pointer"
        >
          Download {image.settings.format.toUpperCase()}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Home() {
  // Left panel state
  const [promptText, setPromptText] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState("1K");
  const [format, setFormat] = useState("png");
  const [model, setModel] = useState<ModelId>("nano-banana-2");
  const isGptImage2 = model === "gpt-image-2-image-to-image";
  const maxImages = model === "gpt-image-2-image-to-image" ? 16 : model === "nano-banana-pro" ? 8 : 14;

  // Image input state
  const [uploadedImages, setUploadedImages] = useState<
    { filename: string; url: string; file?: File }[]
  >([]);
  const missingImages = isGptImage2 && uploadedImages.length === 0;
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Generation state
  const [bulkTasks, setBulkTasks] = useState<BulkTask[]>([]);
  const pollIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Images
  const [sessionImages, setSessionImages] = useState<SessionImage[]>([]);
  const [galleryImages, setGalleryImages] = useState<SessionImage[]>([]);
  const [newestId, setNewestId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; format: string } | null>(null);

  // Tab
  const [tab, setTab] = useState<"recent" | "gallery">("recent");

  // Load gallery from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(GALLERY_KEY);
      if (stored) setGalleryImages(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      pollIntervalsRef.current.forEach((interval) => clearInterval(interval));
      pollIntervalsRef.current.clear();
    };
  }, []);

  // Close lightbox on Esc
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewImage(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Clear newest highlight after a delay
  useEffect(() => {
    if (!newestId) return;
    const t = setTimeout(() => setNewestId(null), 2000);
    return () => clearTimeout(t);
  }, [newestId]);

  // ---------------------------------------------------------------------------
  // Upload
  // ---------------------------------------------------------------------------

  const handleUploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const remaining = maxImages - uploadedImages.length;
    const toUpload = fileArray.slice(0, remaining);
    if (toUpload.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      toUpload.forEach((f) => formData.append("files", f));

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Upload failed");
      }
      const data: { filename: string; url: string }[] = await res.json();
      setUploadedImages((prev) => [
        ...prev,
        ...data.map((d, i) => ({ ...d, file: toUpload[i] })),
      ]);
    } catch (err) {
      console.error("Upload failed:", err instanceof Error ? err.message : err);
    } finally {
      setUploading(false);
    }
  };

  const removeUploadedImage = (filename: string) => {
    setUploadedImages((prev) => prev.filter((img) => img.filename !== filename));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleUploadFiles(e.dataTransfer.files);
  };

  // ---------------------------------------------------------------------------
  // Generate
  // ---------------------------------------------------------------------------

  const handleBulkGenerate = async () => {
    const prompts = parseBulkPrompts(promptText);
    if (prompts.length === 0) return;

    // Create placeholder IDs upfront so UI updates immediately
    const placeholderIds = prompts.map(() => crypto.randomUUID());
    const newTasks: BulkTask[] = placeholderIds.map((id, i) => ({
      taskId: id,
      prompt: prompts[i],
      stage: "submitting" as GenerationStage,
    }));
    setBulkTasks((prev) => [...prev, ...newTasks]);

    let tasks: { index: number; prompt: string; kieTaskId: string | null; error?: string }[] = [];
    try {
      const res = await fetch("/api/create-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompts,
          aspectRatio,
          resolution,
          outputFormat: format,
          imageUrls: uploadedImages.map((img) => img.url),
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail ?? "Failed to create tasks");
      }
      const data = await res.json();
      tasks = data.tasks;
    } catch (err) {
      // Mark all placeholders as error
      const msg = err instanceof Error ? err.message : "Failed";
      setBulkTasks((prev) =>
        prev.map((t) =>
          placeholderIds.includes(t.taskId)
            ? { ...t, stage: "error" as GenerationStage, errorMsg: msg }
            : t
        )
      );
      return;
    }

    // Start polling for each task
    tasks.forEach(({ index, prompt: taskPrompt, kieTaskId, error }) => {
      const placeholderId = placeholderIds[index];

      if (!kieTaskId || error) {
        setBulkTasks((prev) =>
          prev.map((t) =>
            t.taskId === placeholderId
              ? { ...t, stage: "error" as GenerationStage, errorMsg: error ?? "Failed to queue" }
              : t
          )
        );
        return;
      }

      setBulkTasks((prev) =>
        prev.map((t) =>
          t.taskId === placeholderId ? { ...t, stage: "generating" as GenerationStage } : t
        )
      );

      const interval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/poll-task?kieTaskId=${kieTaskId}`);
          const pollData = await pollRes.json();

          if (pollData.state === "success") {
            clearInterval(interval);
            pollIntervalsRef.current.delete(placeholderId);
            setBulkTasks((prev) => prev.filter((t) => t.taskId !== placeholderId));
            const newImage: SessionImage = {
              id: placeholderId,
              prompt: taskPrompt,
              image_url: pollData.imageUrl,
              settings: { aspect_ratio: aspectRatio, resolution, format },
              timestamp: Date.now(),
            };
            setSessionImages((prev) => [newImage, ...prev]);
            setGalleryImages((prev) => {
              const updated = [newImage, ...prev];
              try { localStorage.setItem(GALLERY_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
              return updated;
            });
            setNewestId(placeholderId);
          } else if (pollData.state === "failed") {
            clearInterval(interval);
            pollIntervalsRef.current.delete(placeholderId);
            setBulkTasks((prev) =>
              prev.map((t) =>
                t.taskId === placeholderId
                  ? { ...t, stage: "error" as GenerationStage, errorMsg: "Generation failed" }
                  : t
              )
            );
          }
        } catch {
          clearInterval(interval);
          pollIntervalsRef.current.delete(placeholderId);
          setBulkTasks((prev) =>
            prev.map((t) =>
              t.taskId === placeholderId
                ? { ...t, stage: "error" as GenerationStage, errorMsg: "Lost connection" }
                : t
            )
          );
        }
      }, 2500);

      pollIntervalsRef.current.set(placeholderId, interval);
    });
  };

  const dismissBulkTask = (taskId: string) => {
    const interval = pollIntervalsRef.current.get(taskId);
    if (interval) {
      clearInterval(interval);
      pollIntervalsRef.current.delete(taskId);
    }
    setBulkTasks((prev) => prev.filter((t) => t.taskId !== taskId));
  };

  // ---------------------------------------------------------------------------
  // Download
  // ---------------------------------------------------------------------------

  const downloadSingle = async (url: string, fmt: string) => {
    try {
      const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ad.${fmt}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank");
    }
  };

  const downloadAsZip = async (images: SessionImage[], zipName: string) => {
    const zip = new JSZip();
    await Promise.all(
      images.map(async (img, i) => {
        const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(img.image_url)}`);
        const blob = await res.blob();
        zip.file(`image-${String(i + 1).padStart(2, "0")}.${img.settings.format}`, blob);
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

  const deleteGalleryImage = (id: string) => {
    setGalleryImages((prev) => {
      const updated = prev.filter((img) => img.id !== id);
      try { localStorage.setItem(GALLERY_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  };

  const clearGallery = () => {
    setGalleryImages([]);
    try { localStorage.removeItem(GALLERY_KEY); } catch { /* ignore */ }
  };

  const parsedPrompts = parseBulkPrompts(promptText);
  const activeBulkCount = bulkTasks.filter((t) => t.stage !== "error").length;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ---- Left Panel ---- */}
      <aside className="w-[35%] min-w-[340px] max-w-[480px] border-r border-gray-200 bg-white flex flex-col">
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Logo / Title */}
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <span>🍋</span> Static Ads Generator
          </h1>

          {/* Prompts */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <label className="block text-sm font-medium text-gray-700">Prompt</label>
              {parsedPrompts.length > 1 && (
                <span className="text-xs font-medium text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">
                  {parsedPrompts.length} prompts
                </span>
              )}
              {promptText && (
                <button
                  onClick={() => setPromptText("")}
                  className="ml-auto text-xs font-medium text-red-400 hover:text-red-600 border border-red-300 hover:border-red-500 rounded px-2 py-0.5 transition-colors cursor-pointer"
                >
                  × Clear
                </button>
              )}
            </div>
            <textarea
              rows={6}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={"Describe the image you want to generate.\n\nFor multiple images, separate each prompt with a blank line."}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-300 resize-none transition"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Separate each prompt with a blank line. Max 20 at a time.
            </p>
          </div>

          {/* Image Input */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Image Input
                <span className="text-xs text-gray-400 font-normal ml-1">
                  {isGptImage2 ? `(required, 1–${maxImages})` : `(optional, up to ${maxImages})`}
                </span>
              </label>
              {uploadedImages.length > 0 && (
                <button
                  onClick={() => setUploadedImages([])}
                  className="ml-auto text-xs font-medium text-red-400 hover:text-red-600 border border-red-300 hover:border-red-500 rounded px-2 py-0.5 transition-colors cursor-pointer"
                >
                  × Clear
                </button>
              )}
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative rounded-lg border-2 border-dashed transition-colors cursor-pointer
                ${dragOver ? "border-black bg-gray-100" : "border-gray-200 bg-gray-50 hover:border-gray-300"}
                ${uploadedImages.length > 0 ? "p-3" : "p-6"}
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleUploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />

              {uploadedImages.length === 0 ? (
                <div className="flex flex-col items-center text-gray-400">
                  <svg className="h-8 w-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                  </svg>
                  <p className="text-xs">Click to upload or drag and drop</p>
                  <p className="text-[10px] mt-0.5 text-gray-300">
                    JPEG, PNG, WEBP &middot; Max 30MB &middot; Up to {maxImages} files
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {uploadedImages.map((img) => (
                    <div
                      key={img.filename}
                      className="relative group rounded-lg overflow-hidden aspect-square bg-gray-100"
                    >
                      <img src={img.url} alt="Reference" className="w-full h-full object-cover" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeUploadedImage(img.filename);
                        }}
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600 cursor-pointer"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  {uploadedImages.length < maxImages && (
                    <div className="flex items-center justify-center aspect-square rounded-lg border border-dashed border-gray-200 text-gray-300 hover:border-gray-400 hover:text-gray-400 transition-colors">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </div>
                  )}
                </div>
              )}

              {uploading && (
                <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-lg">
                  <svg className="animate-spin h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                </div>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Input images to transform or use as reference
            </p>
          </div>

          {/* Settings */}
          <div>
            <h2 className="text-sm font-medium text-gray-700 mb-2">Settings</h2>
            <div className="mb-2">
              <label className="block text-xs text-gray-500 mb-1">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as ModelId)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-300 transition cursor-pointer"
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
            {!isGptImage2 && <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Aspect Ratio</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-300 transition cursor-pointer"
                >
                  {ASPECT_RATIOS.map((ar) => <option key={ar} value={ar}>{ar}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Resolution</label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-300 transition cursor-pointer"
                >
                  {RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Format</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-300 transition cursor-pointer"
                >
                  {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>}
          </div>

          {/* Generate Button */}
          <button
            onClick={handleBulkGenerate}
            disabled={parsedPrompts.length === 0 || missingImages}
            className="w-full rounded-lg bg-black text-white text-base font-semibold py-4 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            {activeBulkCount > 0 && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {parsedPrompts.length <= 1 ? "Generate" : `Generate ${parsedPrompts.length} Images`}
          </button>

          {activeBulkCount > 0 && (
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
              {activeBulkCount} image{activeBulkCount !== 1 ? "s" : ""} generating...
            </p>
          )}
          {missingImages && (
            <p className="text-xs text-gray-500">
              Upload at least 1 image to generate with GPT Image-2.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 text-[10px] text-gray-400">
          {sessionImages.length} image{sessionImages.length !== 1 ? "s" : ""} this session
        </div>
      </aside>

      {/* ---- Right Panel ---- */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#fafafa]">
        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-5 pb-3">
          <button
            onClick={() => setTab("recent")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              tab === "recent" ? "bg-black text-white" : "bg-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100"
            }`}
          >
            Recent
          </button>
          <button
            onClick={() => setTab("gallery")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              tab === "gallery" ? "bg-black text-white" : "bg-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100"
            }`}
          >
            Gallery {galleryImages.length > 0 && <span className="ml-1 text-xs opacity-60">({galleryImages.length})</span>}
          </button>

          {tab === "recent" && sessionImages.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => { if (confirm("Clear all recent images?")) setSessionImages([]); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-400 transition-colors cursor-pointer shadow-sm"
              >
                × Clear All
              </button>
              <button
                onClick={() => downloadAsZip(sessionImages, "recent-ads.zip")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors cursor-pointer shadow-sm"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download All ({sessionImages.length})
              </button>
            </div>
          )}

          {tab === "gallery" && galleryImages.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => { if (confirm("Clear all gallery images?")) clearGallery(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-400 transition-colors cursor-pointer shadow-sm"
              >
                × Clear All
              </button>
              <button
                onClick={() => downloadAsZip(galleryImages, "gallery-ads.zip")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors cursor-pointer shadow-sm"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download All ({galleryImages.length})
              </button>
            </div>
          )}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {tab === "recent" && (
            <>
              {sessionImages.length === 0 && bulkTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none">
                  <p className="text-7xl font-black tracking-tighter text-gray-800 uppercase flex gap-6">
                    <span>RUN</span><span>MORE</span><span>ADS</span>
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-5 gap-4">
                  {bulkTasks.map((t) =>
                    t.stage === "error" ? (
                      <ErrorCard key={t.taskId} onDismiss={() => dismissBulkTask(t.taskId)} />
                    ) : (
                      <ProcessingCard key={t.taskId} stage={t.stage} />
                    )
                  )}
                  {sessionImages.map((img) => (
                    <ImageCard
                      key={img.id}
                      image={img}
                      isNew={img.id === newestId}
                      onPreview={(url, fmt) => setPreviewImage({ url, format: fmt })}
                      onDownload={downloadSingle}
                      onDelete={(id) => setSessionImages((prev) => prev.filter((i) => i.id !== id))}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "gallery" && (
            <>
              {galleryImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none">
                  <p className="text-sm">Gallery is empty</p>
                  <p className="text-xs mt-1">Generated images will appear here</p>
                </div>
              ) : (
                <div className="grid grid-cols-5 gap-4">
                  {galleryImages.map((img) => (
                    <ImageCard
                      key={img.id}
                      image={img}
                      onPreview={(url, fmt) => setPreviewImage({ url, format: fmt })}
                      onDownload={downloadSingle}
                      onDelete={deleteGalleryImage}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] w-full mx-6"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImage.url}
              alt="Preview"
              className="w-full h-full object-contain rounded-lg shadow-2xl max-h-[85vh]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
