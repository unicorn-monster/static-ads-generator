import { NextResponse } from "next/server";
import { getModel } from "@/lib/models";
import { createKieTask } from "@/lib/kie";

export const maxDuration = 60;

export async function POST(req: Request) {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ detail: "KIE_API_KEY not configured" }, { status: 500 });
  }

  const {
    model: modelId,
    prompts,
    aspectRatio,
    resolution,
    outputFormat,
    imageUrls,
    duration,
    mode,
    generateAudio,
    nsfwChecker,
  } = await req.json();

  const spec = getModel(modelId);
  if (!spec) {
    return NextResponse.json({ detail: "Invalid or missing model" }, { status: 400 });
  }

  if (!Array.isArray(prompts) || prompts.length === 0) {
    return NextResponse.json({ detail: "prompts must be a non-empty array" }, { status: 400 });
  }

  // Bulk: image up to 20, video single (cost/latency).
  const maxPrompts = spec.modality === "video" ? 1 : 20;
  if (prompts.length > maxPrompts) {
    return NextResponse.json(
      {
        detail:
          spec.modality === "video"
            ? "Video supports 1 prompt at a time"
            : "Maximum 20 prompts at a time",
      },
      { status: 400 }
    );
  }

  const urls: string[] = Array.isArray(imageUrls) ? imageUrls : [];
  if (spec.imageInput === "required" && urls.length === 0) {
    return NextResponse.json(
      { detail: `${spec.label} requires at least 1 input image` },
      { status: 400 }
    );
  }
  if (urls.length > spec.maxImages) {
    return NextResponse.json(
      { detail: `${spec.label} supports maximum ${spec.maxImages} input images` },
      { status: 400 }
    );
  }

  const hasImage = urls.length > 0;
  const kieModelId = spec.resolveModelId(hasImage);

  const tasks = await Promise.all(
    prompts.map(async (prompt: string, index: number) => {
      try {
        const input = spec.buildInput({
          prompt,
          imageUrls: urls,
          aspectRatio: aspectRatio ?? spec.defaults?.aspectRatio ?? spec.aspectRatios[0],
          resolution: resolution ?? spec.defaults?.resolution ?? spec.resolutions?.[0],
          outputFormat,
          duration,
          mode,
          generateAudio,
          nsfwChecker,
        });
        const kieTaskId = await createKieTask(apiKey, kieModelId, input);
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
