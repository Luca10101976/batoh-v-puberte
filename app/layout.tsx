import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppStateProvider } from "@/components/app-state-provider";
import { AppFrame } from "@/components/app-frame";
import { getAppVersion } from "@/lib/app-version";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://batoh-v-puberte.vercel.app";

export const metadata: Metadata = {
  title: "Batoh v pubertě",
  description: "Městská hra pro objevování města, úkoly a soutěž s kamarády.",
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
    description: "Městská hra pro objevování města, úkoly a soutěž s kamarády.",
    siteName: "Batoh v pubertě",
    images: [
      {
        url: "/images/panbatoh-og.jpg",
        width: 683,
        height: 683,
        alt: "Batoh v pubertě - logo"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Batoh v pubertě",
    description: "Městská hra pro objevování města, úkoly a soutěž s kamarády.",
    images: ["/images/panbatoh-og.jpg"]
  },
  icons: {
    icon: [{ url: "/icon", type: "image/png", sizes: "512x512" }],
    shortcut: "/icon",
    apple: [{ url: "/apple-icon", type: "image/png", sizes: "180x180" }]
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
