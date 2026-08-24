// Run: node --experimental-strip-types lib/models.test.ts
// Guards the Seedance 2.0 request body against the kie.ai schema (the one thing a
// wrong value costs real credits to discover).
import assert from "node:assert/strict";
import { getModel } from "./models.ts";
import { CREDIT_VND, creditsToVnd } from "./pricing.ts";

const seedance = getModel("seedance-2")!;

// Reference-image mode: @Image1… are the reference images.
const refMode = seedance.buildInput({
  prompt: "@Image1 walks in",
  imageUrls: ["https://x/ref1.png", "https://x/ref2.png"],
  videoUrls: ["https://x/a.mp4"],
  audioUrls: ["https://x/a.mp3"],
  aspectRatio: "9:16",
  resolution: "4K", // pill label — the request must carry Kie's lowercase enum value
  duration: 8,
  generateAudio: true,
  webSearch: true,
  nsfwChecker: false,
});

assert.deepEqual(refMode, {
  prompt: "@Image1 walks in",
  aspect_ratio: "9:16",
  resolution: "4k",
  duration: 8,
  generate_audio: true,
  web_search: true,
  nsfw_checker: false,
  reference_image_urls: ["https://x/ref1.png", "https://x/ref2.png"],
  reference_video_urls: ["https://x/a.mp4"],
  reference_audio_urls: ["https://x/a.mp3"],
});

// Frame mode wins if both somehow arrive: Kie rejects the combination with
// 422 "The reference image and the first and last frames are mutually exclusive".
const frameMode = seedance.buildInput({
  prompt: "a cat",
  imageUrls: ["https://x/ref1.png"],
  firstFrameUrl: "https://x/first.png",
  lastFrameUrl: "https://x/last.png",
  aspectRatio: "16:9",
  resolution: "480p",
  duration: 4,
});
assert.equal(frameMode.first_frame_url, "https://x/first.png");
assert.equal(frameMode.last_frame_url, "https://x/last.png");
assert.ok(!("reference_image_urls" in frameMode), "frames and reference images must never ship together");

// Text-to-video: no image keys at all (Kie rejects empty-string urls).
const t2v = seedance.buildInput({
  prompt: "a cat",
  imageUrls: [],
  aspectRatio: "16:9",
  resolution: "720p",
  duration: 5,
});
assert.deepEqual(Object.keys(t2v).sort(), [
  "aspect_ratio",
  "duration",
  "generate_audio",
  "nsfw_checker",
  "prompt",
  "resolution",
  "web_search",
]);

// Every offered value must be one the kie.ai schema accepts.
const ASPECTS = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"];
const RESOLUTIONS = ["480p", "720p", "1080p", "4k"];
for (const id of ["seedance-2", "seedance-2-fast"]) {
  const m = getModel(id)!;
  assert.deepEqual(m.aspectRatios, ASPECTS, `${id} aspect ratios`);
  for (const r of m.resolutions!) {
    assert.ok(RESOLUTIONS.includes(r.toLowerCase()), `${id}: bad resolution ${r}`);
  }
  // Price must be defined for every resolution the UI offers.
  for (const r of m.resolutions!) assert.ok(m.priceCredits!({ resolution: r, duration: 5, count: 1 })! > 0);
}

// A reference video switches Kie to Price × (Input + Output) — we can't estimate that.
assert.equal(seedance.priceCredits!({ resolution: "720p", duration: 5, count: 1, hasRefVideo: true }), null);
assert.equal(seedance.priceCredits!({ resolution: "720p", duration: 5, count: 1 }), 205);

// Settings render in the Kie playground's order.
assert.deepEqual(seedance.fieldOrder, [
  "generate_audio",
  "resolution",
  "aspect_ratio",
  "duration",
  "web_search",
  "nsfw_checker",
]);

// --- Grok Imagine 1.5 ------------------------------------------------------
const grok = getModel("grok-imagine")!;
assert.equal(grok.maxImages, 1, "Kie: image-to-video supports only one image");
assert.deepEqual(grok.aspectRatios, ["2:3", "3:2", "1:1", "16:9", "9:16"]);
assert.deepEqual(grok.resolutions, ["480p", "720p", "1080p"]);
assert.deepEqual(grok.extras?.modes, ["fun", "normal", "spicy"]);
assert.equal(grok.resolveModelId(true), "grok-imagine/image-to-video");
assert.equal(grok.resolveModelId(false), "grok-imagine/text-to-video");

// i2v sends duration as a string, t2v as a number — see the note in buildInput.
const grokI2v = grok.buildInput({ prompt: "@image1 pan", imageUrls: ["https://x/a.png"], aspectRatio: "1:1", resolution: "720p", duration: 8 });
assert.equal(grokI2v.duration, "8");
assert.deepEqual(grokI2v.image_urls, ["https://x/a.png"]);
const grokT2v = grok.buildInput({ prompt: "a cat", imageUrls: [], aspectRatio: "1:1", resolution: "720p", duration: 8 });
assert.equal(grokT2v.duration, 8);
assert.ok(!("image_urls" in grokT2v));

// --- Pricing -------------------------------------------------------------
// Credit rates as published on each model's kie.ai page (2026-08). If Kie moves a
// price, this is what fails — the Generate button quotes real money off these numbers.
const RATES: Record<string, Record<string, number>> = {
  "seedance-2": { "480p": 19, "720p": 41, "1080p": 102, "4K": 208 }, // per second, no-video rate
  "seedance-2-fast": { "480p": 11.7, "720p": 24.8 },
  "grok-imagine": { "480p": 2.4, "720p": 4.5, "1080p": 8 },
  "gpt-image-2-text-to-image": { "1K": 6, "2K": 10, "4K": 16 }, // per image
  "gpt-image-2-image-to-image": { "1K": 6, "2K": 10, "4K": 16 },
  "nano-banana-2": { "1K": 8, "2K": 12, "4K": 18 },
  "nano-banana-pro": { "1K": 18, "2K": 18, "4K": 24 },
};

for (const [id, rates] of Object.entries(RATES)) {
  const m = getModel(id)!;
  for (const [resolution, perUnit] of Object.entries(rates)) {
    // Aspect ratio matters for gpt-image-2 only, where it clamps resolution; 16:9 never clamps.
    const got = m.priceCredits!({ resolution, aspectRatio: "16:9", duration: 1, count: 1 });
    assert.equal(got, perUnit, `${id} @ ${resolution}`);
  }
}

// Video scales with duration, images scale with how many prompts are queued.
assert.equal(getModel("seedance-2")!.priceCredits!({ resolution: "1080p", duration: 12, count: 1 }), 102 * 12);
assert.equal(getModel("grok-imagine")!.priceCredits!({ resolution: "480p", duration: 30, count: 1 }), 2.4 * 30);
assert.equal(getModel("nano-banana-2")!.priceCredits!({ resolution: "4K", count: 20 }), 18 * 20);

// gpt-image-2 clamps resolution by aspect ratio, and the price must follow the clamp:
// aspect "auto" -> 1K only, aspect "1:1" -> 2K max.
const gpt = getModel("gpt-image-2-text-to-image")!;
assert.equal(gpt.priceCredits!({ resolution: "4K", aspectRatio: "auto", count: 1 }), 6, "auto clamps to 1K");
assert.equal(gpt.priceCredits!({ resolution: "4K", aspectRatio: "1:1", count: 1 }), 10, "1:1 clamps to 2K");

// VND conversion: 1 credit = $0.005 × 26,300 = 131.5đ, rounded up to the nearest 100.
assert.equal(CREDIT_VND, 131.5);
assert.equal(creditsToVnd(41 * 5), 27_000); // Seedance 720p × 5s
assert.equal(creditsToVnd(24.8 * 5), 16_400); // Seedance Fast 720p × 5s
assert.equal(creditsToVnd(6), 800); // one 1K image

console.log("ok");
