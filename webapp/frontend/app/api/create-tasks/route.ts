import { NextResponse } from "next/server";

export const maxDuration = 60;

const KIE_BASE_URL = "https://api.kie.ai/api/v1/jobs";

async function createKieTask(
  apiKey: string,
  prompt: string,
  aspectRatio: string,
  resolution: string,
  outputFormat: string,
  imageUrls: string[]
): Promise<string> {
  const input: Record<string, unknown> = {
    prompt,
    aspectRatio,
    resolution,
    outputFormat,
  };
  if (imageUrls.length > 0) {
    input.imageInput = imageUrls;
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    const resp = await fetch(`${KIE_BASE_URL}/createTask`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "nano-banana-2", input }),
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

  const { prompts, aspectRatio, resolution, outputFormat, imageUrls } = await req.json();

  if (!Array.isArray(prompts) || prompts.length === 0) {
    return NextResponse.json({ detail: "prompts must be a non-empty array" }, { status: 400 });
  }
  if (prompts.length > 20) {
    return NextResponse.json({ detail: "Maximum 20 prompts at a time" }, { status: 400 });
  }

  const tasks = await Promise.all(
    prompts.map(async (prompt: string, index: number) => {
      try {
        const kieTaskId = await createKieTask(
          apiKey,
          prompt,
          aspectRatio ?? "1:1",
          resolution ?? "1K",
          outputFormat ?? "png",
          imageUrls ?? []
        );
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
