import { NextResponse } from "next/server";

export const maxDuration = 60;

const KIE_BASE_URL = "https://api.kie.ai/api/v1/jobs";

type KieModel = "nano-banana-2" | "nano-banana-pro" | "gpt-image-2-image-to-image";

const ALLOWED_MODELS: KieModel[] = ["nano-banana-2", "nano-banana-pro", "gpt-image-2-image-to-image"];

interface NanoBananaOptions {
  aspectRatio: string;
  resolution: string;
  outputFormat: string;
  imageUrls: string[];
}

async function createKieTask(
  apiKey: string,
  model: KieModel,
  prompt: string,
  options: NanoBananaOptions
): Promise<string> {
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

  for (let attempt = 1; attempt <= 3; attempt++) {
    const resp = await fetch(`${KIE_BASE_URL}/createTask`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input }),
    });

    if (resp.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      continue;
    }

    if (!resp.ok) {
      throw new Error(`Kie API error ${resp.status}: ${await resp.text()}`);
    }

    const data = await resp.json();
    const taskId = data.taskId ?? data.data?.taskId;
    if (!taskId) throw new Error("No taskId in Kie API response");
    return taskId as string;
  }

  throw new Error("Failed to create task after retries");
}

export async function POST(req: Request) {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ detail: "KIE_API_KEY not configured" }, { status: 500 });
  }

  const { model, prompts, aspectRatio, resolution, outputFormat, imageUrls } = await req.json();

  if (!model || !ALLOWED_MODELS.includes(model)) {
    return NextResponse.json({ detail: "Invalid or missing model" }, { status: 400 });
  }

  if (!Array.isArray(prompts) || prompts.length === 0) {
    return NextResponse.json({ detail: "prompts must be a non-empty array" }, { status: 400 });
  }
  if (prompts.length > 20) {
    return NextResponse.json({ detail: "Maximum 20 prompts at a time" }, { status: 400 });
  }

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

  if (model === "nano-banana-pro") {
    const urls = Array.isArray(imageUrls) ? imageUrls : [];
    if (urls.length > 8) {
      return NextResponse.json(
        { detail: "Nano Banana Pro supports maximum 8 input images" },
        { status: 400 }
      );
    }
  }

  const options: NanoBananaOptions = {
    aspectRatio: aspectRatio ?? "1:1",
    resolution: resolution ?? "1K",
    outputFormat: outputFormat ?? "png",
    imageUrls: imageUrls ?? [],
  };

  const tasks = await Promise.all(
    prompts.map(async (prompt: string, index: number) => {
      try {
        const kieTaskId = await createKieTask(apiKey, model, prompt, options);
        return { index, prompt, kieTaskId };
      } catch (err) {
        return {
          index,
          prompt,
          kieTaskId: null,
          error: err instanceof Error ? err.message : "Failed to create task",
        };
      }
    })
  );

  return NextResponse.json({ tasks });
}
