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
    <nav className="h-14 shrink-0 bg-slate-950 text-white flex items-center px-6 gap-1 z-40 relative border-b border-slate-800 shadow-sm shadow-black/40">
      <Link href="/image" className="flex items-center mr-3" title="Home">
        <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-blue-600 text-white shadow-sm shadow-blue-600/30">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.2l1.8 6.5c.18.66.7 1.18 1.36 1.36L21.8 12l-6.64 1.94c-.66.18-1.18.7-1.36 1.36L12 21.8l-1.94-6.5c-.18-.66-.7-1.18-1.36-1.36L2.2 12l6.5-1.94c.66-.18 1.18-.7 1.36-1.36z" />
            <path d="M19 3.5l.5 1.8 1.8.5-1.8.5-.5 1.8-.5-1.8-1.8-.5 1.8-.5z" opacity="0.85" />
          </svg>
        </span>
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
