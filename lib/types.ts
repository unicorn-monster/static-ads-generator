// Core domain types. See CONTEXT.md for glossary, ADR-0001 for single-provider decision.

export type Modality = "image" | "video";

/** Whether a Model accepts reference-image input. */
export type ImageInput = "none" | "optional" | "required";

/** Everything a model might need to build its Kie request body. Each ModelSpec.buildInput picks what it uses. */
export interface BuildOpts {
  prompt: string;
  imageUrls: string[];
  aspectRatio: string;
  resolution: string;
  outputFormat?: string; // image: png/jpg
  duration?: number; // video: seconds
  mode?: string; // grok: fun/normal/spicy
  generateAudio?: boolean; // seedance
  nsfwChecker?: boolean; // video: content filtering toggle
}

/**
 * Capability descriptor for one UI-selectable Model. The registry (lib/models.ts) is a list of these;
 * the UI renders controls from the data fields, the API resolves a Kie model ID + request body from the functions.
 */
export interface ModelSpec {
  id: string; // UI id, e.g. "seedance-2"
  label: string; // dropdown label incl. price
  modality: Modality;
  feature: string; // group label, e.g. "Create Video" (v1 dropdown single-column)
  imageInput: ImageInput;
  maxImages: number;
  aspectRatios: string[];
  resolutions?: string[];
  formats?: string[]; // image png/jpg; absent => no format control (e.g. gpt-image-2)
  duration?: { min: number; max: number; step: number; default: number }; // video: slider range
  exposeNsfw?: boolean; // video: show nsfw_checker toggle
  maxPromptChars?: number; // hard cap on prompt length (per Kie schema)
  notes?: Record<string, string>; // per-field helper text (Kie-style), keyed by field name
  defaults?: { aspectRatio?: string; resolution?: string; mode?: string };
  extras?: { audio?: boolean; modes?: string[] };
  /** Map a Model (+ whether a reference image is present) to the upstream Kie model ID. */
  resolveModelId: (hasImage: boolean) => string;
  /** Build the Kie `input` body for this model. */
  buildInput: (o: BuildOpts) => Record<string, unknown>;
  /** Estimate total Kie credits for the given settings, or null if pricing is uncertain. */
  priceCredits?: (o: PriceOpts) => number | null;
}

/** Inputs for dynamic price estimation. */
export interface PriceOpts {
  resolution: string;
  duration?: number; // video seconds
  count: number; // number of outputs (images); video is always 1
  generateAudio?: boolean;
}

/** A generated output (image or video) shown in Recent/Gallery. */
export interface SessionItem {
  id: string;
  kind: Modality;
  prompt: string;
  mediaUrl: string;
  settings: Record<string, string | number | boolean>;
  timestamp: number;
}
