# Static Ads Generator — Context

A single-page tool that turns text prompts (and optional reference images) into ad creatives by calling AI models through one upstream API. It is evolving from image-only into an all-in-one generator (image + video, later audio) with a Higgsfield-style multi-route UI.

## Language

**Model**:
A generation engine the user selects in the UI (e.g. "Seedance 2.0", "Nano Banana Pro"). One Model belongs to exactly one **Modality**. A Model is _not_ the same as a **Kie model ID** — one Model may map to several Kie model IDs.
_Avoid_: engine, backend, AI

**ModelSpec**:
The config object describing a **Model**'s capabilities — its allowed aspect ratios, resolutions, durations, image-input rule, extra params, and how it resolves to a **Kie model ID** + request body. The registry (`lib/models.ts`) is a list of ModelSpecs; the UI renders controls from them.
_Avoid_: config, schema, definition (use "ModelSpec")

**Modality**:
The kind of output a **Model** produces: `image` or `video` (later `audio`). Drives which route the Model lives on (`/image`, `/video`) and which controls appear.
_Avoid_: type, category, kind

**Provider**:
The upstream API that actually runs models. There is **exactly one, forever: Kie AI**. This is a deliberate constraint, not a placeholder — see ADR-0001. We do not abstract over providers.
_Avoid_: vendor, backend, service, fal/replicate (we use none of these)

**Kie model ID**:
The exact string passed in Kie's `createTask` `model` field (e.g. `bytedance/seedance-2`, `grok-imagine/text-to-video`). Resolved from a **Model** plus whether a reference image is present. Not 1:1 with Model: Seedance = one ID across modes; Grok = a different ID per mode.
_Avoid_: model name, slug

**Mode** (Model-specific):
A generation flavor offered by some Models, distinct from **Modality**. Example: Grok's `fun` / `normal` / `spicy`. Lives inside a ModelSpec's extra params; most Models have none.
_Avoid_: style, setting (reserve "Mode" for this Model-local param)

**Generation**:
One `createTask` request producing one output. Image Generations can be issued in **Bulk**; a video Generation is always single.
_Avoid_: job, run, request

**Bulk** (image only):
Multiple prompts submitted in one action, separated by a blank line (max 20). Each prompt becomes one **Generation**. Video has no Bulk — one clip per action (cost/latency).
_Avoid_: batch, multi

**Recent** vs **Gallery**:
**Recent** = outputs from the current browser session (in memory). **Gallery** = history persisted in `localStorage`. Because Kie output URLs die in ~24h, Gallery entries self-expire (auto-pruned); the durable deliverable is the downloaded file.
_Avoid_: history, library (use "Recent" / "Gallery" precisely)

**Reference image / first frame**:
A user-uploaded image hosted on Cloudinary so Kie can fetch it, used as input for image-to-image or image-to-video. Cloudinary only ever holds these _inputs_ — never outputs.
_Avoid_: source image, seed image

**Product**:
The thing an ad creative promotes (e.g. "hatnet"). Entered by the user at sync time and slug-ified (lowercase, no diacritics/spaces) to form the Drive folder name. The grouping key for delivering outputs to Drive. Not a **Model** and not a **Modality**.
_Avoid_: brand, campaign, item

**Drive batch**:
The set of outputs pushed to Google Drive in **one Sync action**, landing in a folder named `{product}-{YYYY-MM-DD}-{NNN}` under the fixed "Dino IMG" parent. `NNN` auto-increments per Product per day. A Drive batch is **not** a **Bulk**: Bulk is how images are _generated_ (one submit, many prompts); a Drive batch is how selected outputs are _delivered_ (one upload, any selection). Several Bulks can feed one Drive batch, or one Bulk can be split across many.
_Avoid_: batch (unqualified — always say "Drive batch"), bulk

**Drive sync (delivery)**:
Uploading selected outputs into a **Drive batch** folder. Drive is a downstream **delivery target**, never a **Provider** (which is upstream + Kie-only). A separate external tool reads these folders to push creatives into Meta ads.
_Avoid_: provider, export, backup

## Flagged ambiguities

- **"Model" vs "Kie model ID"** — always distinguish. The UI/registry speaks in **Models**; the Kie client resolves a Model (+ has-image) to a **Kie model ID**. Grok = 1 Model → 2 IDs (`text-to-video`, `image-to-video`); Seedance = 1 Model → 1 ID with a `first_frame_url`.
- **"Mode" vs "Modality"** — Modality is image/video (output kind); Mode is a Model-local flavor (Grok fun/normal/spicy). Never interchange.
- **"Provider"** — singular and fixed (Kie). If anyone proposes a "provider layer", that is out of scope by decision (ADR-0001), not an oversight.

## Example dialogue

> **Dev:** "Should Grok be one entry or two in the registry?"
> **Domain:** "One **Model** — the user picks 'Grok Imagine' once. Whether it becomes the text-to-video or image-to-video **Kie model ID** is resolved at submit time from whether they uploaded a **reference image**."
> **Dev:** "And Seedance does the same?"
> **Domain:** "Same Model-level idea, different mapping. Seedance stays one **Kie model ID** and we just add `first_frame_url`. That divergence is exactly why each **ModelSpec** owns its own resolve logic instead of a shared if/else."
> **Dev:** "Where does Grok's spicy/normal toggle go — is that a Modality?"
> **Domain:** "No. Modality is video. That toggle is a **Mode**, a Grok-local param. It only shows up because Grok's ModelSpec declares it."
