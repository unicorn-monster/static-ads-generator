# Implementation Plan: Swap GPT Image-2 to Image-to-Image variant

## Overview

Thay model ID `gpt-image-2-text-to-image` bằng `gpt-image-2-image-to-image` trong cả backend và frontend. Un-hide Image Input section cho GPT Image-2 (và biến nó thành bắt buộc với hint), thêm dynamic max images (14 cho nano, 16 cho GPT), disable Generate button khi thiếu ảnh, và backend validate.

---

## Phase 1: Backend — swap model ID, input schema, validation

Đổi endpoint API để nhận model mới và map `imageUrls` → `input_urls` thay vì `image_input`. Thêm server-side validation cho yêu cầu ảnh bắt buộc.

### Tasks

- [ ] Đổi type `KieModel` và `ALLOWED_MODELS` sang `gpt-image-2-image-to-image`
- [ ] Sửa input branching trong `createKieTask`: dùng `input_urls` + `nsfw_checker` cho GPT Image-2
- [ ] Thêm validation trong POST handler: GPT Image-2 phải có 1-16 ảnh, trả 400 nếu sai

### Technical Details

**File:** `app/api/create-tasks/route.ts`

**Type + const** (lines 7-9):
```ts
type KieModel = "nano-banana-2" | "gpt-image-2-image-to-image";
const ALLOWED_MODELS: KieModel[] = ["nano-banana-2", "gpt-image-2-image-to-image"];
```

**Input branching** (replace lines 24-36):
```ts
const input: Record<string, unknown> =
  model === "gpt-image-2-image-to-image"
    ? {
        prompt,
        input_urls: options.imageUrls,
        nsfw_checker: false,
      }
    : (() => {
        const i: Record<string, unknown> = {
          prompt,
          aspect_ratio: options.aspectRatio,
          resolution: options.resolution,
          output_format: options.outputFormat,
        };
        if (options.imageUrls.length > 0) i.image_input = options.imageUrls;
        return i;
      })();
```

**Validation** (thêm trong POST handler, sau khi check prompts array, trước `const options = ...`):
```ts
if (model === "gpt-image-2-image-to-image") {
  const urls = Array.isArray(imageUrls) ? imageUrls : [];
  if (urls.length === 0) {
    return NextResponse.json(
      { detail: "GPT Image-2 requires at least 1 input image" },
      { status: 400 }
    );
  }
  if (urls.length > 16) {
    return NextResponse.json(
      { detail: "GPT Image-2 supports maximum 16 input images" },
      { status: 400 }
    );
  }
}
```

---

## Phase 2: Frontend — swap model, un-hide upload, dynamic max, disable logic

Update UI để image upload luôn hiện (bắt buộc với GPT Image-2), apply dynamic limit, disable nút khi thiếu ảnh.

### Tasks

- [ ] Đổi MODELS entry: id `gpt-image-2-image-to-image`, label `GPT Image-2 (img→img)`
- [ ] Update `isGptImage2` comparison sang ID mới
- [ ] **Bỏ wrap** `{!isGptImage2 && ...}` quanh Image Input section (un-hide)
- [ ] Thêm `const maxImages = isGptImage2 ? 16 : 14;`
- [ ] Thay tất cả hard-coded `14` bằng `maxImages` (handleUploadFiles, placeholder cell check, helper text)
- [ ] Cập nhật label `Image Input` sub-text động (required/optional + max)
- [ ] Thêm `missingImages` derived + update disabled button logic
- [ ] Thêm hint text dưới Generate button khi `missingImages`

### Technical Details

**File:** `app/page.tsx`

**MODELS constant** (replace):
```ts
const MODELS = [
  { id: "nano-banana-2", label: "Nano Banana 2" },
  { id: "gpt-image-2-image-to-image", label: "GPT Image-2 (img→img)" },
] as const;
```

**State + derived** (thay `isGptImage2`):
```ts
const isGptImage2 = model === "gpt-image-2-image-to-image";
const maxImages = isGptImage2 ? 16 : 14;
const missingImages = isGptImage2 && uploadedImages.length === 0;
```

**Un-wrap Image Input section**: tìm `{!isGptImage2 && <div>` và matching `</div>}` quanh Image Input section, xóa 2 wrappers đó (hiện có ở khoảng line 520 và line 602).

**Dynamic max usage**:
- `handleUploadFiles`: `const remaining = maxImages - uploadedImages.length;`
- Placeholder "+" cell: `{uploadedImages.length < maxImages && ...}`
- Drop zone helper text: `Up to {maxImages} files`

**Label sub-text** (trong Image Input `<label>`):
```tsx
<span className="text-xs text-gray-400 font-normal ml-1">
  {isGptImage2 ? `(required, 1–${maxImages})` : `(optional, up to ${maxImages})`}
</span>
```

**Generate button** (update disabled):
```tsx
<button
  onClick={handleBulkGenerate}
  disabled={parsedPrompts.length === 0 || missingImages}
  ...
>
```

**Hint dưới nút** (thêm song song với `activeBulkCount` hint):
```tsx
{missingImages && (
  <p className="text-xs text-gray-500">
    Upload at least 1 image to generate with GPT Image-2.
  </p>
)}
```

---

## Phase 3: Verify

Smoke test cả 2 models, kiểm tra TypeScript, validate server-side.

### Tasks

- [ ] `npx tsc --noEmit` pass
- [ ] Manual regression nano-banana-2: 1 prompt, không ảnh → network body có `model: "nano-banana-2"`, generate thành công
- [ ] Manual GPT Image-2 happy path: upload 1 ảnh + prompt → body có `input_urls`, task tạo thành công và poll về ảnh
- [ ] Manual validation: chọn GPT Image-2 không upload → Generate disabled + hint hiện
- [ ] Manual upload limit: 16 ảnh → placeholder biến mất ở 17; switch về nano → biến mất ở 15

### Technical Details

**Dev server**: `npm run dev -- -p 3001` (port 3001 để không đụng project khác).

**Smoke test commands**:
```bash
npx tsc --noEmit
```

**Network inspection**: DevTools → Network → `POST /api/create-tasks` → Payload tab. Kiểm tra exact body shape khớp với schema model đang chọn.
