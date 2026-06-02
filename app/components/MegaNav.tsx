"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Modality } from "@/lib/types";
import { modelsByModality } from "@/lib/models";

const NAV: { modality: Modality; label: string; href: string }[] = [
  { modality: "image", label: "Image", href: "/image" },
  { modality: "video", label: "Video", href: "/video" },
];

export function MegaNav() {
  const pathname = usePathname();

  return (
    <nav className="h-14 shrink-0 bg-slate-950 text-white flex items-center px-6 gap-1 z-40 relative">
      <Link href="/image" className="font-semibold tracking-tight flex items-center gap-2 mr-4">
        <span>🍋</span>
        <span className="text-sm">Static Ads Generator</span>
      </Link>

      {NAV.map(({ modality, label, href }) => {
        const active = pathname?.startsWith(href);
        const models = modelsByModality(modality);
        return (
          <div key={modality} className="group relative h-full flex items-center">
            <Link
              href={href}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                active ? "text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {label}
            </Link>

            {/* FIX #4: single Models column (no fake Features column until real features exist) */}
            <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity absolute top-full left-0 pt-1">
              <div className="w-64 rounded-lg border border-slate-800 bg-slate-950 shadow-2xl p-2">
                <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500">Models</p>
                {models.map((m) => (
                  <Link
                    key={m.id}
                    href={`${href}?model=${m.id}`}
                    className="block rounded-md px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                  >
                    {m.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
