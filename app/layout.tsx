import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppStateProvider } from "@/components/app-state-provider";
import { AppFrame } from "@/components/app-frame";
import { getAppVersion } from "@/lib/app-version";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://batoh-v-puberte.vercel.app";

export const metadata: Metadata = {
  title: "Batoh v pubertě",
  description: "Městská hra s Trakim pro objevování města, úkoly a soutěž s kamarády.",
  applicationName: "Batoh v pubertě",
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/"
  },
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    type: "website",
    locale: "cs_CZ",
    url: "/",
    title: "Batoh v pubertě",
    description: "Městská hra s Trakim pro objevování města, úkoly a soutěž s kamarády.",
    siteName: "Batoh v pubertě",
    images: [
      {
        url: "/images/traki-og.png",
        width: 1200,
        height: 630,
        alt: "Traki - hlavní hrdina hry Batoh v pubertě"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Batoh v pubertě",
    description: "Městská hra s Trakim pro objevování města, úkoly a soutěž s kamarády.",
    images: ["/images/traki-og.png"]
  },
  icons: {
    icon: [
      { url: "/icons/traki-favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icons/traki-favicon-64.png", type: "image/png", sizes: "64x64" },
      { url: "/icons/traki-icon-512.png", type: "image/png", sizes: "512x512" }
    ],
    shortcut: "/icons/traki-favicon-32.png",
    apple: [{ url: "/icons/traki-apple-icon-180.png", type: "image/png", sizes: "180x180" }]
  }
};

export const viewport: Viewport = {
  themeColor: "#07111f",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const appVersion = getAppVersion();

  return (
    <html lang="cs">
      <body>
        <AppStateProvider>
          <AppFrame appVersion={appVersion}>{children}</AppFrame>
        </AppStateProvider>
      </body>
    </html>
  );
}
