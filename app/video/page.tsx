"use client";

import { modelsByModality } from "@/lib/models";
import { GeneratorWorkspace } from "@/app/components/GeneratorWorkspace";

export default function VideoPage() {
  return (
    <GeneratorWorkspace
      modality="video"
      models={modelsByModality("video")}
      defaultModelId="seedance-2"
      storageKey="sag_video_gallery_v1"
      bulk={false}
    />
  );
}
