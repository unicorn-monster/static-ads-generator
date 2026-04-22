# Implementation Plan: GPT Image-2 Model Selector

## Overview

Refactor `app/api/create-tasks/route.ts` để nhận `model` từ request body và branch logic xây dựng input object theo từng model. Cập nhật `app/page.tsx` thêm model selector dropdown và ẩn/hiện các controls theo model đang chọn.

---

## Phase 1: Backend — Dynamic model routing

Đổi API route từ hardcode `"nano-banana-2"` sang nhận `model` từ client, construct đúng input object cho từng model.

### Tasks

- [x] Thêm type `KieModel` union ở đầu `app/api/create-tasks/route.ts`
- [x] Refactor signature `createKieTask` nhận thêm `model: KieModel` và `options` object thay vì từng param riêng lẻ
- [x] Branch logic build `input` object theo model trong `createKieTask`
- [x] Cập nhật `POST` handler: destructure `model` từ request, validate, truyền vào `createKieTask`

### Technical Details

**File:** `app/api/create-tasks/route.ts`

**Type definition** (thêm ở đầu file, sau imports):
```ts
type KieModel = "nano-banana-2" | "gpt-image-2-text-to-image";

const ALLOWED_MODELS: KieModel[] = ["nano-banana-2", "gpt-image-2-text-to-image"];

interface NanoBananaOptions {
  aspectRatio: string;
  resolution: string;
  outputFormat: string;
  imageUrls: string[];
}
```

**Refactored `createKieTask` signature:**
```ts
async function createKieTask(
  apiKey: string,
  model: KieModel,
  prompt: string,
  options: NanoBananaOptions
): Promise<string>
```

**Input branching logic** (replace lines 15-23):
```ts
const input: Record<string, unknown> =
  model === "gpt-image-2-text-to-image"
    ? { prompt, nsfw_checker: false }
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

**`body` line** (line 32 hiện tại):
```ts
body: JSON.stringify({ model, input }),
```

**POST handler** — thêm `model` destructure và validation:
```ts
const { model, prompts, aspectRatio, resolution, outputFormat, imageUrls } = await req.json();

if (!model || !ALLOWED_MODELS.includes(model)) {
  return NextResponse.json({ detail: "Invalid or missing model" }, { status: 400 });
}
```

---

## Phase 2: Frontend — Model selector + conditional UI

Thêm state `model`, dropdown selector, và ẩn/hiện controls theo model.

### Tasks

- [x] Thêm constant `MODELS` array và type `ModelId` ở block constants của `app/page.tsx`
- [x] Thêm state `model` và derived `isGptImage2` vào `Home` component
- [x] Thêm `model` vào request body của `handleBulkGenerate`
- [x] Thêm Model selector dropdown ở đầu Settings section (trước grid 3 cột)
- [x] Wrap grid Aspect/Resolution/Format trong `{!isGptImage2 && (...)}`
- [x] Wrap toàn bộ Image Input section trong `{!isGptImage2 && (...)}`

### Technical Details

**File:** `app/page.tsx`

**Constants** (thêm gần `ASPECT_RATIOS`, `RESOLUTIONS`, `FORMATS`):
```ts
const MODELS = [
  { id: "nano-banana-2", label: "Nano Banana 2" },
  { id: "gpt-image-2-text-to-image", label: "GPT Image-2" },
] as const;
type ModelId = typeof MODELS[number]["id"];
```

**State** (thêm sau line 185 — sau `const [format, setFormat]`):
```ts
const [model, setModel] = useState<ModelId>("nano-banana-2");
const isGptImage2 = model === "gpt-image-2-text-to-image";
```

**handleBulkGenerate request body** (lines 304-310):
```ts
body: JSON.stringify({
  model,
  prompts,
  aspectRatio,
  resolution,
  outputFormat: format,
  imageUrls: uploadedImages.map((img) => img.url),
}),
```

**Model selector JSX** (thêm vào đầu Settings div, trước grid, line ~607):
```tsx
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
```

**Conditional grid** (wrap `<div className="grid grid-cols-3 gap-2">` ... `</div>`):
```tsx
{!isGptImage2 && (
  <div className="grid grid-cols-3 gap-2">
    {/* Aspect Ratio, Resolution, Format selects */}
  </div>
)}
```

**Conditional Image Input section**: tìm parent div của "Input images" label và wrap:
```tsx
{!isGptImage2 && (
  <div> {/* Image input section */} </div>
)}
```
