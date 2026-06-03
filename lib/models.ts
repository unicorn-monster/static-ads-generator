import type { ModelSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared option lists (mirrors current app/page.tsx values — do not change)
// ---------------------------------------------------------------------------

const IMG_ASPECT_RATIOS = ["auto", "1:1", "4:5", "9:16", "16:9"];
const GPT_ASPECT_RATIOS = ["auto", "1:1", "5:4", "9:16", "21:9", "16:9", "4:3", "3:2", "4:5", "3:4", "2:3"];
const IMG_RESOLUTIONS = ["1K", "2K", "4K"];
const IMG_FORMATS = ["png", "jpg"];

// Video price labels: per-second VND at 720p, rounded up (Kie $0.005/credit, USD/VND ≈26,300).
// Grok exact (3 cr/s @720p). Seedance estimated (~35.6 cr/s = measured 480p 19 cr/s × 1.875); refine if a 720p figure is confirmed.

// ---------------------------------------------------------------------------
// Registry — single source of truth (image + video). See CONTEXT.md.
// ---------------------------------------------------------------------------

export const MODELS: ModelSpec[] = [
  // --- Image (existing, behavior preserved) ----------------------------------
  {
    id: "gpt-image-2-image-to-image",
    label: "GPT Image-2 — 800đ", // $0.03 × 26,300đ (rounded up)
    modality: "image",
    feature: "Create Image",
    imageInput: "required",
    maxImages: 16,
    aspectRatios: GPT_ASPECT_RATIOS,
    // NOTE: Kie's gpt-image-2 image-to-image no longer accepts `resolution` — sending it -> 500.
    defaults: { aspectRatio: "1:1" },
    resolveModelId: () => "gpt-image-2-image-to-image",
    priceCredits: ({ count }) => 6 * count, // 1K only (resolution removed); 6 cr/img
    buildInput: ({ prompt, imageUrls, aspectRatio }) => ({
      prompt,
      input_urls: imageUrls,
      aspect_ratio: aspectRatio,
      nsfw_checker: false,
    }),
  },
  {
    id: "nano-banana-2",
    label: "Nano Banana 2 — 1,100đ", // $0.04 × 26,300đ (rounded up)
    modality: "image",
    feature: "Create Image",
    imageInput: "optional",
    maxImages: 14,
    aspectRatios: IMG_ASPECT_RATIOS,
    resolutions: IMG_RESOLUTIONS,
    formats: IMG_FORMATS,
    defaults: { aspectRatio: "1:1", resolution: "1K" },
    resolveModelId: () => "nano-banana-2",
    priceCredits: ({ resolution, count }) => (({ "1K": 8, "2K": 12, "4K": 18 } as Record<string, number>)[resolution] ?? 8) * count,
    buildInput: ({ prompt, imageUrls, aspectRatio, resolution, outputFormat }) => {
      const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: aspectRatio,
        resolution,
        output_format: outputFormat ?? "png",
      };
      if (imageUrls.length > 0) input.image_input = imageUrls;
      return input;
    },
  },
  {
    id: "nano-banana-pro",
    label: "Nano Banana Pro — 2,400đ", // $0.09 × 26,300đ (rounded up)
    modality: "image",
    feature: "Create Image",
    imageInput: "optional",
    maxImages: 8,
    aspectRatios: IMG_ASPECT_RATIOS,
    resolutions: IMG_RESOLUTIONS,
    formats: IMG_FORMATS,
    defaults: { aspectRatio: "1:1", resolution: "1K" },
    resolveModelId: () => "nano-banana-pro",
    priceCredits: ({ resolution, count }) => (({ "1K": 18, "2K": 18, "4K": 24 } as Record<string, number>)[resolution] ?? 18) * count,
    buildInput: ({ prompt, imageUrls, aspectRatio, resolution, outputFormat }) => {
      const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: aspectRatio,
        resolution,
        output_format: outputFormat ?? "png",
      };
      if (imageUrls.length > 0) input.image_input = imageUrls;
      return input;
    },
  },

  // --- Video (new) -----------------------------------------------------------
  {
    id: "seedance-2",
    label: "Seedance 2.0 — 5.400đ/s", // 720p: 41 cr/s × 131.5đ (no-video rate; button shows exact)
    modality: "video",
    feature: "Create Video",
    imageInput: "optional",
    maxImages: 1, // FIX #6: only first_frame_url is used
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"],
    resolutions: ["480p", "720p", "1080p"],
    duration: { min: 4, max: 15, step: 1, default: 5 },
    exposeNsfw: true,
    maxPromptChars: 20000, // verified from Seedance playground textarea maxLength
    notes: {
      aspect_ratio: "Video aspect ratio configuration.",
      duration: "Video duration in 4–15 seconds.",
      resolution: "480p for faster generation, 720p for balance, 1080p for high-quality video.",
      generate_audio: "Whether to generate audio for the video (higher cost).",
      nsfw_checker: "Defaults to off. If off, content filtering is disabled and results are returned directly by the model.",
    },
    defaults: { aspectRatio: "16:9", resolution: "720p" },
    extras: { audio: true },
    resolveModelId: () => "bytedance/seedance-2",
    // "no video" rate (Price × Output) — our i2v uses an image first-frame, not a video input.
    // Audio-on may run ~10-15% higher (unconfirmed); shown price is the base no-audio rate.
    priceCredits: ({ resolution, duration }) =>
      (({ "480p": 19, "720p": 41, "1080p": 102 } as Record<string, number>)[resolution] ?? 19) * (duration ?? 5),
    buildInput: ({ prompt, imageUrls, aspectRatio, resolution, duration, generateAudio, nsfwChecker }) => {
      const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: aspectRatio,
        resolution,
        duration: duration ?? 5,
        generate_audio: generateAudio ?? true,
        nsfw_checker: nsfwChecker ?? false,
      };
      if (imageUrls.length > 0) input.first_frame_url = imageUrls[0];
      return input;
    },
  },
  {
    id: "grok-imagine",
    label: "Grok Imagine — 400đ/s", // 720p: 3 cr/s × $0.005 × 26,300đ (rounded up)
    modality: "video",
    feature: "Create Video",
    imageInput: "optional",
    maxImages: 7,
    aspectRatios: ["2:3", "3:2", "1:1", "16:9", "9:16"],
    resolutions: ["480p", "720p"],
    duration: { min: 6, max: 30, step: 1, default: 6 },
    exposeNsfw: true,
    maxPromptChars: 5000, // Grok docs: prompt max 5000 chars
    notes: {
      mode: "When generating videos using external image inputs, Spicy mode is not supported and will automatically switch to Normal.",
      aspect_ratio: "The aspect ratio of the video. This parameter is invalid if it is a single image.",
      duration: "The duration of the generated video in seconds.",
      resolution: "Resolution of the generated video.",
      nsfw_checker: "Defaults to off. If off, content filtering is disabled and results are returned directly by the model.",
    },
    defaults: { aspectRatio: "1:1", resolution: "720p", mode: "normal" },
    extras: { modes: ["fun", "normal", "spicy"] },
    resolveModelId: (hasImage) =>
      hasImage ? "grok-imagine/image-to-video" : "grok-imagine/text-to-video",
    buildInput: ({ prompt, imageUrls, aspectRatio, resolution, duration, mode, nsfwChecker }) => {
      const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: aspectRatio,
        resolution,
        mode: mode ?? "normal",
        nsfw_checker: nsfwChecker ?? false,
      };
      if (imageUrls.length > 0) {
        input.image_urls = imageUrls;
        input.duration = String(duration ?? 6); // Grok i2v expects string
      } else {
        input.duration = duration ?? 6; // Grok t2v expects number
      }
      return input;
    },
    priceCredits: ({ resolution, duration }) =>
      (({ "480p": 1.6, "720p": 3 } as Record<string, number>)[resolution] ?? 3) * (duration ?? 6),
  },
];

export function getModel(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

export function modelsByModality(modality: ModelSpec["modality"]): ModelSpec[] {
  return MODELS.filter((m) => m.modality === modality);
}
