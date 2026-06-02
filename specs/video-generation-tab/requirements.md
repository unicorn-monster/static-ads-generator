# Requirements: Video Generation Tab + Multi-Route Refactor

## What & Why

Tool hiện chỉ gen image trong một `page.tsx` 844 dòng monolithic. Mục tiêu dài hạn: biến nó thành nơi **all-in-one** gen media (image + video, sau này audio) qua **Kie AI**, UI lấy cảm hứng Higgsfield (top nav + mega-dropdown, mỗi feature một route). Bước này: **đập xây lại từ đầu** (greenfield) trên một **ModelSpec registry** config-driven, tách multi-route (`/image`, `/video`), và thêm trang `/video` với 2 model đầu tiên.

Quyết định nền: **một provider duy nhất là Kie, không build provider abstraction** (xem [ADR-0001](../../docs/adr/0001-single-provider-kie.md)). Trục biến thiên là **Model + Modality**, nên cái cần trừu tượng hoá là registry + per-model input shaper, không phải provider. Thuật ngữ chốt trong [CONTEXT.md](../../CONTEXT.md).

## Scope v1

- **Image** (`/image`): giữ nguyên 3 model + **toàn bộ 9 behavior** hiện có (không regression).
- **Video** (`/video`, mới): **Seedance 2.0** (`bytedance/seedance-2`) + **Grok Imagine** (`grok-imagine/text-to-video` + `grok-imagine/image-to-video`). Mỗi model làm cả text-to-video và image-to-video. **1 clip/lần** (không bulk).
- Veo / Kling / Sora và **Grok image-to-image** = ngoài scope, thêm sau qua registry.

## Acceptance Criteria

### Kiến trúc
- [ ] Có `lib/models.ts` chứa registry `MODELS: ModelSpec[]` (3 image + 2 video), mỗi entry khai báo `modality`, `imageInput`, `maxImages`, allowed `aspectRatios`/`resolutions`/`durations`, params riêng, và cách resolve ra Kie model ID + input body
- [ ] Tên cũ giữ nguyên: `MODELS`, `maxImages`, `GALLERY_KEY = "sag_gallery_v1"`. `KieModel` union-string → `ModelSpec` object
- [ ] **Không** có `IProvider` / provider factory

### Nav + routing
- [ ] Top nav + mega-dropdown **tự sinh từ registry**: v1 hiển thị **1 cột Models group theo modality** — KHÔNG giả lập cấu trúc 2 cột "Features | Models" của Higgsfield khi chưa có feature riêng (Upscale/Inpaint/Face Swap); không entry "coming soon" rỗng
- [ ] Routes: `/image`, `/video` hoạt động; `/` redirect `/image`
- [ ] Layout/nav dùng chung qua `app/layout.tsx`

### Image (parity — không regression)
- [ ] 3 model: Nano Banana 2 / Pro / GPT Image-2 với đúng `maxImages` 14 / 8 / 16, aspect ratios riêng, resolutions `1K/2K/4K`, format `png/jpg` (trừ GPT Image-2), GPT Image-2 **bắt buộc** ≥1 ảnh
- [ ] Bulk prompt tách **blank-line** (`/\n{2,}/`), max 20
- [ ] Upload Cloudinary, poll, gallery localStorage, download lẻ + ZIP, lightbox, tab Recent/Gallery — tất cả hoạt động như cũ

### Video (mới)
- [ ] Ô prompt **chỉ nhận 1 prompt** (bỏ blank-line parser ở `/video`)
- [ ] Seedance 2.0: aspect `1:1,4:3,3:4,16:9,9:16,21:9,adaptive`; duration `4–15s`; resolution `480p/720p/1080p`; toggle `generate_audio`; i2v qua `first_frame_url` — **`maxImages = 1`** (chỉ dùng 1 ảnh first-frame; không để user upload ảnh thừa bị âm thầm bỏ qua)
- [ ] Grok Imagine: aspect `2:3,3:2,1:1,16:9,9:16`; duration `6–30s`; resolution `480p/720p`; param `mode` (fun/normal/spicy); t2v → `text-to-video`, có ảnh → `image-to-video` (`image_urls`)
- [ ] Có ảnh upload → tự resolve đúng Kie model ID + field ảnh đúng từng model
- [ ] Kết quả render `<video>` + nút download mp4 (qua proxy)
- [ ] Video Gallery localStorage key mới `sag_video_gallery_v1`. URL Kie chết ~24h → entry cũ hiện placeholder "expired" qua `<video onError>` (**không xoá destructive**)
- [ ] **Image Gallery `sag_gallery_v1` giữ NGUYÊN — KHÔNG prune, KHÔNG đụng data cũ** (`SessionImage` đã có `timestamp`; prune sẽ xoá lịch sử đang có → vi phạm "giữ 9 behavior")
- [ ] Poll **resilient cho job dài (~5 phút)**: chịu được ≥K lần fetch lỗi liên tiếp mới fail — KHÔNG chết ở 1 network blip (bug `catch` của image poll hiện tại). Không cap số lần poll
- [ ] **Verify shape `recordInfo` cho video** trước khi tin parser cũ: gen thử 1 clip Seedance, log raw response, xác định field thật chứa mp4 URL
- [ ] Gallery entry ghi settings **lúc submit** (snapshot per-task), không đọc state lúc poll resolve — tránh sai metadata khi đổi dropdown giữa job dài

### Verify
- [ ] `npx tsc --noEmit` pass (Stop hook tự chạy typecheck + lint)
- [ ] Manual e2e: gen được Seedance t2v + i2v và Grok t2v + i2v; image flow không vỡ

## Dependencies

- `KIE_API_KEY`, `CLOUDINARY_*` trong `.env.local` — dùng lại, không cần key mới
- Không cần package mới (vẫn next/react/tailwind/cloudinary/jszip)
- **Giá Seedance / Grok**: đọc `kie.ai/pricing` lúc execute để điền label (hiện để placeholder)
- Dead code `webapp/` + `tools/` (Python FastAPI cũ): **không xoá** (pre-existing dead code, ngoài scope)

## Related Features

- [add-nano-banana-pro](../add-nano-banana-pro/), [gpt-image-2-img-to-img](../gpt-image-2-img-to-img/) — pattern model dropdown + per-model image cap mà registry này tổng quát hoá
