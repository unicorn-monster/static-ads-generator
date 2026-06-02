"use client";

import { modelsByModality } from "@/lib/models";
import { GeneratorWorkspace } from "@/app/components/GeneratorWorkspace";

export default function ImagePage() {
  return (
    <GeneratorWorkspace
      modality="image"
      models={modelsByModality("image")}
      defaultModelId="gpt-image-2-image-to-image"
      storageKey="sag_gallery_v1"
      bulk
    />
  );
}
