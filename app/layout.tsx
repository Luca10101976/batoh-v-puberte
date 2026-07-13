import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppStateProvider } from "@/components/app-state-provider";
import { AppFrame } from "@/components/app-frame";
import { getAppVersion } from "@/lib/app-version";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://batoh-v-puberte.vercel.app";

export const metadata: Metadata = {
  title: "Traki na stopě",
  description: "Městská hra pro objevování města, úkoly a soutěž s kamarády.",
  applicationName: "Traki na stopě",
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
    title: "Traki na stopě",
    description: "Městská hra pro objevování města, úkoly a soutěž s kamarády.",
    siteName: "Traki na stopě",
    images: [
      {
        url: "/images/og-traki.jpg",
        width: 1200,
        height: 630,
        alt: "Traki na stopě - logo"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Traki na stopě",
    description: "Městská hra pro objevování města, úkoly a soutěž s kamarády.",
    images: ["/images/og-traki.jpg"]
  },
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "512x512" }],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }]
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
