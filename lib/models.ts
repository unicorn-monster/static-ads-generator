import type { ModelSpec } from "./types";

// Per-request guard for /api/create-tasks. The client now creates tasks one at a
// time through the generation pool, so this mainly protects the endpoint itself.
export const MAX_BULK_PROMPTS = 20;

// Generation pool: how many tasks run at once. Kie.ai allows 100+ concurrent
// RUNNING tasks; the real limit is 20 new creations / 10s, so a burst of 20 at
// the start sits right at that line and is paced by completions afterward.
export const GEN_CONCURRENCY = 20;

// Soft cap on prompts per generate (CSV upload or typed) — a credit safety net.
export const MAX_TOTAL_PROMPTS = 100;

// ---------------------------------------------------------------------------
// Shared option lists (mirrors current app/page.tsx values — do not change)
// ---------------------------------------------------------------------------

const IMG_ASPECT_RATIOS = ["auto", "1:1", "4:5", "9:16", "16:9"];
const GPT_ASPECT_RATIOS = ["auto", "1:1", "5:4", "9:16", "21:9", "16:9", "4:3", "3:2", "4:5", "3:4", "2:3"];
const IMG_RESOLUTIONS = ["1K", "2K", "4K"];
const IMG_FORMATS = ["png", "jpg"];

// Kie gpt-image-2 constraint: aspect "auto"/unspecified -> 1K only; aspect "1:1" -> max 2K (no 4K).
// Clamp the requested resolution to a valid one so the task never fails to create (500).
function gptResolution(resolution: string, aspectRatio: string): string {
  if (aspectRatio === "auto" || !aspectRatio) return "1K";
  if (aspectRatio === "1:1" && resolution === "4K") return "2K";
  return resolution;
}

// Price labels quote the 720p per-second rate for video, the 1K rate for images.
// Credit rates below are read off each model's kie.ai page (2026-08); 1 credit = $0.005,
// USD/VND ≈ 26,300 → 131.5đ per credit (see lib/pricing.ts). lib/models.test.ts pins them.
// Note: the Seedance Fast rate is a limited-time discount (listed as ending 2026-09-07).

// ---------------------------------------------------------------------------
// Seedance 2.0 (bytedance/seedance-2 + /seedance-2-fast) — schema verified on
// kie.ai 2026-08: first_frame_url, last_frame_url, prompt, reference_image_urls
// (≤9, addressed as @Image1… in the prompt), reference_video_urls (≤3, ≤15s
// total), reference_audio_urls (≤3), generate_audio, resolution, aspect_ratio,
// duration (4–15), web_search, nsfw_checker.
// ---------------------------------------------------------------------------

const SEEDANCE_ASPECTS = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"];

const SEEDANCE_NOTES = {
  prompt: "The text prompt or description for the video.",
  reference_image_urls: "A list of input image URLs.",
  aspect_ratio: "The aspect ratio of the generated video.",
  duration: "Video duration in seconds.",
  resolution: "The output video resolution.",
  generate_audio: "Whether to generate AI audio synchronized with the video.",
  web_search: "Use online search.",
  nsfw_checker: "A configurable parameter. Kie's playground defaults it on; this tool defaults it off.",
};

// Same order as the Kie playground form (screenshot 2026-08).
const SEEDANCE_FIELD_ORDER = ["generate_audio", "resolution", "aspect_ratio", "duration", "web_search", "nsfw_checker"];

/** Seedance 2.0 and its Fast variant differ only in model id, price table and resolutions. */
function seedanceSpec(o: {
  id: string;
  label: string;
  kieModel: string;
  resolutions: string[];
  creditsPerSecond: Record<string, number>;
}): ModelSpec {
  return {
    id: o.id,
    label: o.label,
    modality: "video",
    feature: "Create Video",
    imageInput: "optional",
    maxImages: 9, // reference_image_urls; the two frame slots are separate
    aspectRatios: SEEDANCE_ASPECTS,
    resolutions: o.resolutions,
    duration: { min: 4, max: 15, step: 1, default: 5 },
    exposeNsfw: true,
    maxPromptChars: 20000, // verified from Seedance playground textarea maxLength
    notes: SEEDANCE_NOTES,
    defaults: { aspectRatio: "16:9", resolution: "720p" },
    extras: { audio: true, frames: true, refVideos: 3, refAudios: 3, webSearch: true },
    fieldOrder: SEEDANCE_FIELD_ORDER,
    resolveModelId: () => o.kieModel,
    // "No video" rate (Price × Output). With a reference video Kie switches to
    // Price × (Input + Output), which we can't compute without the clip length.
    // ponytail: hide the estimate in that case; add real math if Kie exposes input duration.
    priceCredits: ({ resolution, duration, hasRefVideo }) =>
      hasRefVideo ? null : (o.creditsPerSecond[resolution] ?? o.creditsPerSecond["720p"]) * (duration ?? 5),
    buildInput: ({
      prompt,
      imageUrls,
      firstFrameUrl,
      lastFrameUrl,
      videoUrls,
      audioUrls,
      aspectRatio,
      resolution,
      duration,
      generateAudio,
      nsfwChecker,
      webSearch,
    }) => {
      const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: aspectRatio,
        // Kie's enum is lowercase ("4k"); the pills show "4K" like the playground does.
        resolution: resolution.toLowerCase(),
        duration: duration ?? 5,
        generate_audio: generateAudio ?? true,
        web_search: webSearch ?? false,
        nsfw_checker: nsfwChecker ?? false,
      };
      // Kie 422: "The reference image and the first and last frames are mutually exclusive,
      // and only one scene can be selected". The UI blocks it too; frames win if both arrive.
      if (firstFrameUrl || lastFrameUrl) {
        if (firstFrameUrl) input.first_frame_url = firstFrameUrl;
        if (lastFrameUrl) input.last_frame_url = lastFrameUrl;
      } else if (imageUrls.length > 0) {
        input.reference_image_urls = imageUrls;
      }
      if (videoUrls?.length) input.reference_video_urls = videoUrls;
      if (audioUrls?.length) input.reference_audio_urls = audioUrls;
      return input;
    },
  };
}

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
    resolutions: IMG_RESOLUTIONS,
    // Kie constraints (docs): aspect "auto"/unspecified -> only 1K; aspect "1:1" -> no 4K.
    // Sending an incompatible resolution+aspect_ratio combo makes the task fail to create (500).
    defaults: { aspectRatio: "1:1", resolution: "1K" },
    resolveModelId: () => "gpt-image-2-image-to-image",
    // Same table as the text-to-image variant — kie.ai quotes one price for both
    // ("6 credits for 1K, 10 for 2K, 16 for 4K"). Aspect ratio matters only because it
    // clamps the resolution (auto -> 1K, 1:1 -> max 2K), so price it off the clamped value.
    priceCredits: ({ resolution, aspectRatio, count }) =>
      (({ "1K": 6, "2K": 10, "4K": 16 } as Record<string, number>)[gptResolution(resolution, aspectRatio ?? "1:1")] ?? 6) * count,
    buildInput: ({ prompt, imageUrls, aspectRatio, resolution }) => ({
      prompt,
      input_urls: imageUrls,
      aspect_ratio: aspectRatio,
      resolution: gptResolution(resolution, aspectRatio),
      nsfw_checker: false,
    }),
  },
  {
    id: "gpt-image-2-text-to-image",
    label: "GPT Image-2 (Text) — 800đ", // 1K base: $0.03 × 26,300đ (rounded up)
    modality: "image",
    feature: "Create Image",
    imageInput: "none", // text-to-image only — no reference image
    maxImages: 0,
    aspectRatios: GPT_ASPECT_RATIOS,
    resolutions: IMG_RESOLUTIONS,
    maxPromptChars: 20000, // Kie schema: prompt max 20,000 chars
    // Same Kie constraints as the i2i variant: aspect "auto" -> only 1K; aspect "1:1" -> no 4K.
    defaults: { aspectRatio: "1:1", resolution: "1K" },
    resolveModelId: () => "gpt-image-2-text-to-image",
    // Confirmed from playground Run button: 1K = 6 cr ($0.03), 2K = 10 ($0.05), 4K = 16 ($0.08).
    priceCredits: ({ resolution, aspectRatio, count }) =>
      (({ "1K": 6, "2K": 10, "4K": 16 } as Record<string, number>)[gptResolution(resolution, aspectRatio ?? "1:1")] ?? 6) * count,
    buildInput: ({ prompt, aspectRatio, resolution }) => ({
      prompt,
      aspect_ratio: aspectRatio,
      resolution: gptResolution(resolution, aspectRatio),
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
  seedanceSpec({
    id: "seedance-2",
    label: "Seedance 2.0 — 5.400đ/s", // 720p: 41 cr/s × 131.5đ (no-video rate; button shows exact)
    kieModel: "bytedance/seedance-2",
    resolutions: ["480p", "720p", "1080p", "4K"],
    creditsPerSecond: { "480p": 19, "720p": 41, "1080p": 102, "4K": 208 },
  }),
  seedanceSpec({
    id: "seedance-2-fast",
    label: "Seedance 2.0 Fast — 3.300đ/s", // 720p: 24.8 cr/s × 131.5đ (no-video rate)
    kieModel: "bytedance/seedance-2-fast",
    resolutions: ["480p", "720p"],
    creditsPerSecond: { "480p": 11.7, "720p": 24.8 },
  }),
  {
    id: "grok-imagine",
    label: "Grok Imagine — 600đ/s", // 720p: 4.5 cr/s × 131.5đ (Grok Imagine 1.5 rate)
    modality: "video",
    feature: "Create Video",
    imageInput: "optional",
    maxImages: 1, // Kie: "only one image is supported" for image-to-video
    aspectRatios: ["2:3", "3:2", "1:1", "16:9", "9:16"],
    resolutions: ["480p", "720p", "1080p"],
    duration: { min: 6, max: 30, step: 1, default: 6 },
    exposeNsfw: true,
    maxPromptChars: 5000, // verified from the Grok playground textarea maxLength
    notes: {
      image_urls:
        "Provide one external image URL as a reference for video generation (only one image is supported). In your prompt, reference it by typing @image1 followed by a space.",
      prompt: "The text prompt describing the desired video motion.",
      mode: "When generating videos using external image inputs, Spicy mode is not supported and will automatically switch to Normal.",
      aspect_ratio: "The aspect ratio of the video. This parameter is invalid if it is a single image.",
      duration: "The duration of the generated video in seconds.",
      resolution: "Resolution of the generated video.",
      nsfw_checker: "A configurable parameter. Kie's playground defaults it on; this tool defaults it off.",
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
        // Kie's schema says number, but i2v was found to need a string — leave the
        // working call alone; only change this with a real generation to test against.
        input.duration = String(duration ?? 6);
      } else {
        input.duration = duration ?? 6;
      }
      return input;
    },
    // Grok Imagine 1.5 rates, same for text-to-video and image-to-video.
    priceCredits: ({ resolution, duration }) =>
      (({ "480p": 2.4, "720p": 4.5, "1080p": 8 } as Record<string, number>)[resolution] ?? 4.5) * (duration ?? 6),
  },
];

export function getModel(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

export function modelsByModality(modality: ModelSpec["modality"]): ModelSpec[] {
  return MODELS.filter((m) => m.modality === modality);
}
