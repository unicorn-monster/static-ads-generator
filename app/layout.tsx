import type { Metadata } from "next";
import "./globals.css";
import { MegaNav } from "@/app/components/MegaNav";

export const metadata: Metadata = {
  title: "Static Ads Generator",
  description: "All-in-one AI image & video generation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex flex-col h-screen">
          <MegaNav />
          <div className="flex-1 min-h-0">{children}</div>
        </div>
      </body>
    </html>
  );
}
