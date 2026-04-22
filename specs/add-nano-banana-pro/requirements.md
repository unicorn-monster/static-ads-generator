# Requirements: Add Nano Banana Pro Model

## What & Why

Kie AI vừa phát hành model mới `nano-banana-pro` (Google) — image-to-image với reference images optional, hỗ trợ tới 8 ảnh. Request schema gần như identical với `nano-banana-2` hiện có: cùng các field `prompt`, `image_input`, `aspect_ratio`, `resolution`, `output_format`. Feature này thêm option thứ 3 vào model dropdown mà không break flow hiện tại.

Vì schema trùng với `nano-banana-2`, backend không cần branch logic mới — existing fall-through path tại [app/api/create-tasks/route.ts:31-40](../../app/api/create-tasks/route.ts#L31-L40) đã build đúng request body. Thay đổi chủ yếu là: mở rộng union type, thêm UI option, và enforce per-model image cap (Pro = 8, khác với nano-banana-2 = 14).

## Acceptance Criteria

- [ ] Dropdown "Model" hiển thị 3 option: `Nano Banana 2`, `Nano Banana Pro`, `GPT Image-2 (img→img)`
- [ ] Chọn `Nano Banana Pro`: Aspect Ratio, Resolution, Format selects hiển thị (giống Nano Banana 2)
- [ ] Chọn `Nano Banana Pro`: Image Input section hiển thị với label `(optional, up to 8)`
- [ ] Upload input hint text đọc đúng `Up to 8 files` khi chọn Pro
- [ ] Client-side enforce max 8 ảnh (existing `remaining = maxImages - uploadedImages.length` logic đã xử lý)
- [ ] Backend gửi request body: `{ model: "nano-banana-pro", input: { prompt, aspect_ratio, resolution, output_format, image_input? } }`
- [ ] Backend reject request với `imageUrls.length > 8` bằng HTTP 400 + error message rõ ràng
- [ ] Backend validate `model` nằm trong `ALLOWED_MODELS` (Pro được thêm vào list)
- [ ] Aspect ratios giữ nguyên 5 option `auto, 1:1, 4:5, 9:16, 16:9` (không expand ra 11 option của API spec)
- [ ] Polling và gallery flow hoạt động bình thường với model mới
- [ ] Bulk generation (nhiều prompts) hoạt động với Nano Banana Pro
- [ ] `npx tsc --noEmit` pass — không TypeScript errors

## Dependencies

- `KIE_API_KEY` trong `.env` — dùng chung với 2 model hiện có, không cần key mới
- Poll endpoint `/api/poll-task` là model-agnostic, không cần thay đổi
- Upload route `/api/upload` là model-agnostic, không cần thay đổi
- Không cần thêm packages mới

## Related Features

- [gpt-image-2-model-selector](../gpt-image-2-model-selector/) — introduced model dropdown pattern đang reuse ở đây
- [gpt-image-2-img-to-img](../gpt-image-2-img-to-img/) — introduced per-model image cap pattern (16 cho GPT); feature này mở rộng pattern đó với cap = 8 cho Pro
