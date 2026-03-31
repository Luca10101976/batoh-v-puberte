import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppStateProvider } from "@/components/app-state-provider";
import { AppFrame } from "@/components/app-frame";

export const metadata: Metadata = {
  title: "Batoh v pubertě",
  description: "Městská hra pro objevování města, úkoly a soutěž s kamarády.",
  applicationName: "Batoh v pubertě",
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon.svg"
  }
};

export const viewport: Viewport = {
  themeColor: "#07111f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs">
      <body>
        <AppStateProvider>
          <AppFrame>{children}</AppFrame>
        </AppStateProvider>
      </body>
    </html>
  );
}
