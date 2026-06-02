"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelSpec, SessionItem } from "@/lib/types";

export interface GenTask {
  taskId: string; // placeholder id (UI key)
  prompt: string;
  stage: "generating" | "error";
  errorMsg?: string;
}

export interface GenParams {
  model: ModelSpec;
  prompts: string[];
  imageUrls: string[];
  aspectRatio: string;
  resolution: string;
  outputFormat?: string;
  duration?: number;
  mode?: string;
  generateAudio?: boolean;
  nsfwChecker?: boolean;
}

const POLL_INTERVAL_MS = 2500;
const MAX_CONSECUTIVE_FAILS = 3; // FIX #1: tolerate transient errors over long (video) jobs

/**
 * Task creation + polling. Reuses /api/create-tasks + /api/poll-task.
 * - FIX #1: a single failed poll does NOT kill the job; only >= 3 consecutive failures do.
 * - FIX #7: settings are snapshotted at submit time, not read live at poll-resolve.
 */
export function useGeneration(onComplete: (item: SessionItem) => void) {
  const [tasks, setTasks] = useState<GenTask[]>([]);
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const failsRef = useRef<Map<string, number>>(new Map());
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(
    () => () => {
      intervalsRef.current.forEach((iv) => clearInterval(iv));
      intervalsRef.current.clear();
    },
    []
  );

  const stopTask = useCallback((placeholderId: string) => {
    const iv = intervalsRef.current.get(placeholderId);
    if (iv) clearInterval(iv);
    intervalsRef.current.delete(placeholderId);
    failsRef.current.delete(placeholderId);
  }, []);

  const dismiss = useCallback(
    (placeholderId: string) => {
      stopTask(placeholderId);
      setTasks((prev) => prev.filter((t) => t.taskId !== placeholderId));
    },
    [stopTask]
  );

  const generate = useCallback(async (p: GenParams) => {
    const { model } = p;

    // FIX #7: freeze the settings that describe THIS batch right now.
    const settingsSnapshot: SessionItem["settings"] = {
      aspect_ratio: p.aspectRatio,
      resolution: p.resolution,
      ...(model.formats ? { format: p.outputFormat ?? "png" } : {}),
      ...(model.modality === "video"
        ? { duration: p.duration ?? 0, ...(p.mode ? { mode: p.mode } : {}), ...(model.extras?.audio ? { audio: !!p.generateAudio } : {}) }
        : {}),
    };
    const fileExt = model.modality === "video" ? "mp4" : p.outputFormat ?? "png";

    const placeholderIds = p.prompts.map(() => crypto.randomUUID());
    setTasks((prev) => [
      ...placeholderIds.map((id, i) => ({ taskId: id, prompt: p.prompts[i], stage: "generating" as const })),
      ...prev,
    ]);

    let created: { index: number; prompt: string; kieTaskId: string | null; error?: string }[];
    try {
      const res = await fetch("/api/create-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model.id,
          prompts: p.prompts,
          aspectRatio: p.aspectRatio,
          resolution: p.resolution,
          outputFormat: p.outputFormat,
          imageUrls: p.imageUrls,
          duration: p.duration,
          mode: p.mode,
          generateAudio: p.generateAudio,
          nsfwChecker: p.nsfwChecker,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Failed to create tasks");
      created = data.tasks;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to queue";
      setTasks((prev) =>
        prev.map((t) =>
          placeholderIds.includes(t.taskId) ? { ...t, stage: "error" as const, errorMsg: msg } : t
        )
      );
      return;
    }

    created.forEach(({ index, prompt, kieTaskId, error }) => {
      const placeholderId = placeholderIds[index];
      if (!kieTaskId || error) {
        setTasks((prev) =>
          prev.map((t) =>
            t.taskId === placeholderId ? { ...t, stage: "error" as const, errorMsg: error ?? "Failed to queue" } : t
          )
        );
        return;
      }

      failsRef.current.set(placeholderId, 0);
      const interval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/poll-task?kieTaskId=${kieTaskId}`);
          const pollData = await pollRes.json();
          failsRef.current.set(placeholderId, 0); // got a response → reset fail counter

          if (pollData.state === "success") {
            stopTask(placeholderId);
            setTasks((prev) => prev.filter((t) => t.taskId !== placeholderId));
            onCompleteRef.current({
              id: placeholderId,
              kind: model.modality,
              prompt,
              mediaUrl: pollData.mediaUrl ?? pollData.imageUrl,
              settings: { ...settingsSnapshot, ext: fileExt },
              timestamp: Date.now(),
            });
          } else if (pollData.state === "failed") {
            stopTask(placeholderId);
            setTasks((prev) =>
              prev.map((t) =>
                t.taskId === placeholderId ? { ...t, stage: "error" as const, errorMsg: "Generation failed" } : t
              )
            );
          }
          // pending → keep polling
        } catch {
          // FIX #1: tolerate transient network errors; only give up after N in a row.
          const n = (failsRef.current.get(placeholderId) ?? 0) + 1;
          failsRef.current.set(placeholderId, n);
          if (n >= MAX_CONSECUTIVE_FAILS) {
            stopTask(placeholderId);
            setTasks((prev) =>
              prev.map((t) =>
                t.taskId === placeholderId ? { ...t, stage: "error" as const, errorMsg: "Lost connection" } : t
              )
            );
          }
        }
      }, POLL_INTERVAL_MS);

      intervalsRef.current.set(placeholderId, interval);
    });
  }, [stopTask]);

  return { tasks, generate, dismiss };
}
