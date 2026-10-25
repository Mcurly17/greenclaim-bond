import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ConfigNotice } from "@/components/ConfigNotice";
import { asset } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: "GreenClaim Bond", template: "%s · GreenClaim Bond" },
  description: "Bonded pledges against generic environmental claims, judged by GenLayer validators on immutable web snapshots.",
  // Metadata URLs are not prefixed with basePath by Next.js.
  manifest: asset("/site.webmanifest"),
  icons: {
    icon: [
      { url: asset("/favicon.svg"), type: "image/svg+xml" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#9B6AF6", // GenLayer brand purple
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ConfigNotice />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
