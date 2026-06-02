# Implementation Plan: Video Generation Tab + Multi-Route Refactor

## Overview

Greenfield rebuild quanh một **ModelSpec registry** config-driven. UI tách multi-route (`/image`, `/video`) dưới một mega-dropdown tự sinh từ registry. Image flow xây lại trên component dùng chung nhưng **bảo tồn 100% 9 behavior** cũ; `/video` mới thêm Seedance 2.0 + Grok Imagine (t2v + i2v, 1 clip/lần). Một provider Kie, không abstraction (ADR-0001).

Mỗi **Model** sở hữu logic riêng để (a) resolve ra **Kie model ID** và (b) build input body — vì các model lệch nhau gần hết tham số và cả tên field ảnh (`input_urls` vs `image_input` vs `first_frame_url` vs `image_urls`). Registry = data + 2 hàm nhỏ/model, không phải if/else rải rác.

## Target structure

```
lib/
  types.ts        # ModelSpec, Modality, Task, SessionItem
  models.ts       # MODELS: ModelSpec[]  (3 image + 2 video) — single source of truth
  kie.ts          # createKieTask, pollKieTask (thin Kie client, 429 retry, parse result)
  gallery.ts      # load/save localStorage + prune >24h
app/
  layout.tsx      # top nav + mega-dropdown (reads MODELS, grouped by modality)
  page.tsx        # redirect -> /image
  image/page.tsx  # image generator (parity)
  video/page.tsx  # video generator (single clip)
  components/      # MegaNav, PromptPanel, SettingsPanel, UploadDropzone,
                  # ResultGrid, ResultCard, Lightbox, ProcessingCard, ErrorCard
  hooks/
    useGeneration.ts  # bulk/single task creation + polling loop
    useGallery.ts     # Recent (session) + Gallery (persisted) state
  api/
    create-tasks/route.ts  # generalized: validate + build body from registry
    poll-task/route.ts     # per-modality timeout + parse image|video URL
    upload/route.ts        # UNCHANGED (Cloudinary, input images only)
    proxy-image/route.ts   # UNCHANGED (also serves video bytes for download)
```

---

## Phase 1: Foundation — registry + Kie client + generalized API

### 1a. `lib/types.ts` + `lib/models.ts`

`ModelSpec` khai báo capability để UI render control và API build body:

```ts
export type Modality = "image" | "video";
export type ImageInput = "none" | "optional" | "required";

export interface ModelSpec {
  id: string;                 // UI id, vd "seedance-2"
  label: string;              // "Seedance 2.0 — $X"  (giá đọc từ kie.ai/pricing)
  modality: Modality;
  feature: string;            // nhãn nhóm, vd "Create Video" (v1 dropdown 1 cột; để dành khi có cột Features thật)
  imageInput: ImageInput;
  maxImages: number;          // giữ tên cũ
  aspectRatios: string[];
  resolutions: string[];
  durations?: number[];       // video only
  extras?: { audio?: boolean; modes?: string[] };  // Seedance audio / Grok mode
  resolveModelId: (hasImage: boolean) => string;   // Model -> Kie model ID
  buildInput: (o: BuildOpts) => Record<string, unknown>;  // -> Kie input body
}
```

Ví dụ 2 entry minh hoạ sự lệch (image + video):

```ts
// GPT Image-2 (image) — bắt buộc ảnh, field input_urls, không output_format
{
  id: "gpt-image-2-image-to-image", label: "GPT Image-2 — $0.03",
  modality: "image", feature: "Create Image", imageInput: "required", maxImages: 16,
  aspectRatios: GPT_ASPECT_RATIOS, resolutions: ["1K","2K","4K"],
  resolveModelId: () => "gpt-image-2-image-to-image",
  buildInput: ({ prompt, imageUrls, aspectRatio, resolution }) =>
    ({ prompt, input_urls: imageUrls, aspect_ratio: aspectRatio, resolution, nsfw_checker: false }),
}
// Grok Imagine (video) — 2 Kie model ID, field image_urls, có mode
{
  id: "grok-imagine", label: "Grok Imagine — $X",
  modality: "video", feature: "Create Video", imageInput: "optional", maxImages: 7,
  aspectRatios: ["2:3","3:2","1:1","16:9","9:16"], resolutions: ["480p","720p"],
  durations: [6,10,15,30], extras: { modes: ["fun","normal","spicy"] },
  resolveModelId: (hasImage) => hasImage ? "grok-imagine/image-to-video" : "grok-imagine/text-to-video",
  buildInput: ({ prompt, imageUrls, aspectRatio, resolution, duration, mode }) => ({
    prompt, aspect_ratio: aspectRatio, resolution, duration, mode: mode ?? "normal",
    ...(imageUrls.length ? { image_urls: imageUrls } : {}),
  }),
}
```

Seedance entry tương tự: **`maxImages: 1`** (FIX #6 — chỉ dùng 1 ảnh first-frame), 1 `resolveModelId` cố định `"bytedance/seedance-2"`, `buildInput` set `first_frame_url = imageUrls[0]` khi có ảnh, `generate_audio` từ `extras.audio`, duration `4–15`, resolution `480p/720p/1080p`. Nano Banana 2/Pro: `buildInput` build `{ prompt, aspect_ratio, resolution, output_format, image_input? }` (tách `FORMATS`, `ASPECT_RATIOS` như cũ).

Copy nguyên các hằng số hiện có (`ASPECT_RATIOS`, `GPT_ASPECT_RATIOS`, `RESOLUTIONS`, `FORMATS` tại [page.tsx:48-51](../../app/page.tsx#L48-L51)) vào registry — **không đổi giá trị**.

### 1b. `lib/kie.ts`

Tách thin client từ [create-tasks/route.ts:18-70](../../app/api/create-tasks/route.ts#L18-L70): giữ nguyên 429-retry (3 lần, exp backoff), `KIE_BASE_URL`, parse `taskId`. Thêm `pollKieTask(taskId)` tách từ logic poll-task hiện tại, trả `{ state, mediaUrl }`.

> ⚠️ **FIX #2 (critical) — verify shape `recordInfo` cho video TRƯỚC khi tin parser cũ.** Parser hiện tại ([poll-task:39-49](../../app/api/poll-task/route.ts#L39)) chỉ lấy `resultJson.resultUrls` rồi fallback toàn field **tên ảnh** (`imageUrl`, `image_url`). Chưa xác nhận Seedance/Grok trả mp4 dưới `resultUrls`; nếu nằm field khác (`videoUrl`, `results[].url`...) → video "success" mà `mediaUrl = null`, không phát được. **Action Phase 1:** gen thử 1 clip Seedance, `console.log` raw `recordInfo`, chốt field thật rồi mới generalize `pollKieTask`.

### 1c. Generalized `app/api/create-tasks/route.ts`

Thay `ALLOWED_MODELS` hardcode + 2 nhánh `if model ===` bằng: lookup `MODELS.find(m => m.id === model)`; nếu không có → 400. Validation từ spec: `imageInput === "required"` mà rỗng → 400; `imageUrls.length > maxImages` → 400; **image** cho `prompts ≤ 20`, **video** ép `prompts.length === 1`. Body gửi Kie = `{ model: spec.resolveModelId(hasImage), input: spec.buildInput(opts) }`. Giữ `maxDuration = 60`.

### 1d. `app/api/poll-task/route.ts` + `proxy-image`

Dùng `pollKieTask`, trả `mediaUrl` (đổi tên từ `imageUrl`). `upload` **giữ nguyên** (Cloudinary, ảnh input).

> **FIX #8 — `proxy-image` stream cho video.** Hiện proxy nuốt cả file vào RAM (`await resp.arrayBuffer()`, [proxy-image:24](../../app/api/proxy-image/route.ts#L24), `maxDuration=30`) → mp4 ~20MB nằm hết trong memory function. Đổi sang `return new NextResponse(resp.body, ...)` (stream), pass-through `Content-Type` upstream. Rủi ro thấp nhưng sửa rẻ.

**Verify Phase 1:** `npx tsc --noEmit`; optional curl `create-tasks` cho 1 model image + 1 video.

---

## Phase 2: Shared UI shell + components

- `app/layout.tsx`: top nav (logo + Image/Video/...) + **mega-dropdown** render từ `MODELS`. **FIX #4 — v1 chỉ 1 cột Models** group theo `modality` (mỗi item = `label`, link `/image`|`/video`); KHÔNG dựng cột "Features" giả vì chưa có feature riêng (Upscale/Inpaint...). Cấu trúc 2 cột để dành khi có feature thật. Nav là client component (`<MegaNav/>`) import vào layout (server).
- `app/page.tsx`: `redirect("/image")`.
- `components/`: rút `ProcessingCard`/`ErrorCard`/`ImageCard` cũ ([page.tsx:75-182](../../app/page.tsx#L75-L182)) thành `ResultCard` (nhận `kind: "image" | "video"`), `Lightbox`, `PromptPanel`, `SettingsPanel` (render select từ `ModelSpec.aspectRatios/resolutions/durations/extras`), `UploadDropzone`, `ResultGrid`, `MegaNav`.
- `hooks/useGeneration.ts`: chuyển `bulkTasks` + `pollIntervalsRef` + vòng poll ([page.tsx:208-209, 298+](../../app/page.tsx#L208)) thành hook nhận `ModelSpec` + opts. **Hai fix bắt buộc khi port vòng poll:**
  - **FIX #1 (critical) — poll resilient.** Vòng poll cũ `clearInterval` + mark "Lost connection" ngay khi **1** fetch throw ([page.tsx:399-409](../../app/page.tsx#L399)). Job video ~5 phút = ~120 lần poll → 1 blip là chết oan. Đổi: đếm lỗi liên tiếp, chỉ fail sau **≥3 lần liên tiếp**; lỗi lẻ thì bỏ qua, poll tiếp.
  - **FIX #7 — snapshot settings lúc submit.** Loop cũ ghi `settings: { aspectRatio, resolution, format }` đọc **state hiện tại lúc poll resolve** ([page.tsx:378](../../app/page.tsx#L378)) → job dài + đổi dropdown = sai metadata. Capture per-task tại thời điểm submit, đóng gói vào task object.
- `hooks/useGallery.ts`: `sessionImages` + `galleryImages` + persist (`lib/gallery.ts`).

**Verify Phase 2:** typecheck; nav render đúng 2 modality từ registry.

---

## Phase 3: `/image` page (parity)

Dựng lại generator image bằng component Phase 2, đọc `MODELS.filter(m => m.modality === "image")`. **Bảo tồn 9 behavior** (xem requirements). `useGallery` dùng `GALLERY_KEY = "sag_gallery_v1"` (giữ data cũ). Bulk parser `/\n{2,}/` max 20. Download lẻ + ZIP (jszip) qua `proxy-image`.

> **FIX #3 — KHÔNG prune gallery image.** `SessionImage` đã có `timestamp` ([page.tsx:15](../../app/page.tsx#L15)) và gallery cũ lưu vĩnh viễn. Thêm prune-24h sẽ **xoá lịch sử đang có** ngay lần load → vi phạm "giữ 9 behavior". Giữ y nguyên: lưu mãi, chấp nhận thumbnail chết sau ~24h (URL Kie hết hạn).

**Verify Phase 3:** đối chiếu từng behavior với bản cũ — chọn từng model thấy đúng maxImages/aspect/format; GPT Image-2 chặn khi thiếu ảnh; bulk 3 prompt ra 3 ảnh; gallery cũ vẫn load.

---

## Phase 4: `/video` page (mới)

- `PromptPanel` mode single (không blank-line). `SettingsPanel` render: aspect, duration, resolution, + `extras` (Seedance: toggle `generate_audio`; Grok: select `mode`).
- `UploadDropzone` tái dùng cho i2v (1+ ảnh, host Cloudinary). Khi có ảnh → `useGeneration` truyền `hasImage` để `resolveModelId` chọn đúng ID.
- `ResultCard kind="video"`: `<video controls poster>` + nút download mp4 qua `proxy-image`.
- `useGallery` key `sag_video_gallery_v1`. **FIX #3 (video) — không xoá destructive:** giữ entry, render placeholder "expired" qua `<video onError>` khi URL Kie chết (~24h). Recent = session.

**Verify Phase 4:** Seedance t2v (16:9, 5s, audio off) → ra video; Seedance i2v (upload 1 ảnh) → dùng `first_frame_url`; Grok t2v (mode normal) → `text-to-video`; Grok i2v → `image-to-video` + `image_urls`; job dài poll tới khi `success`; download mp4 OK.

---

## Phase 5: Cleanup + verify toàn cục

- **Không** xoá `webapp/` + `tools/` (pre-existing dead code, ngoài scope — chỉ mention).
- Stop hook tự chạy typecheck + lint; sửa nếu fail.
- Manual e2e checklist (Phase 3 + 4) trên `npm run dev`.

---

## Verification (end-to-end)

1. `npm run dev` → `/` redirect `/image`.
2. **Image parity:** mỗi model gen đúng; bulk blank-line; gallery `sag_gallery_v1` load data cũ; download lẻ + ZIP.
3. **Video:** `/video` — Seedance + Grok, mỗi cái t2v + i2v; `<video>` play; download mp4; gallery `sag_video_gallery_v1` prune >24h.
4. **Mega-dropdown registry-driven:** thêm thử 1 entry image vào `MODELS` → xuất hiện trong dropdown **không sửa UI**. (Lưu ý: chỉ phần *dropdown* là data-driven; wire 1 model video mới vẫn cần viết `buildInput`+`resolveModelId` riêng — không phải "1 dòng data".)
5. `npx tsc --noEmit` clean.

## Notes / rủi ro (gồm 8 fix từ grill)

- **FIX #1 — poll resilient** (Phase 2): chịu ≥3 lỗi fetch liên tiếp mới fail. Đây là bug thật của image poll, lộ ra khi job video ~120 lần poll.
- **FIX #2 — verify `recordInfo` shape video** (Phase 1): log raw trước, đừng tin field tên-ảnh.
- **FIX #3 — không prune/xoá gallery image**; video dùng `onError` placeholder thay vì xoá.
- **FIX #4 — dropdown 1 cột** Models ở v1, không giả 2 cột.
- **FIX #6 — Seedance `maxImages: 1`**; Grok i2v `image_urls` max 7.
- **FIX #7 — snapshot settings lúc submit**, không đọc state lúc poll resolve.
- **FIX #8 — proxy-image stream** `resp.body` thay vì `arrayBuffer()`.
- **Đính chính (tôi từng nói sai):** mốc "URL hết hạn 20 phút" là của endpoint `download-url` **không dùng**. URL từ `recordInfo` (`resultUrls`) sống ~24h → hiển thị + download video OK trong ~24h; mốc ephemeral 24h là đúng.
- **Giá Seedance/Grok**: đọc `kie.ai/pricing` điền `label` lúc execute.
- **Grok duration kiểu lệch**: t2v `number`, i2v `string` trong docs Kie — `buildInput` của Grok cần ép kiểu cho i2v.
