import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppStateProvider } from "@/components/app-state-provider";
import { BottomNav } from "@/components/bottom-nav";

export const metadata: Metadata = {
  title: "Pan Batoh",
  description: "Městská hra pro objevování města, úkoly a soutěž s kamarády.",
  applicationName: "Pan Batoh"
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
          <div className="app-shell">
            {children}
            <BottomNav />
          </div>
        </AppStateProvider>
      </body>
    </html>
  );
}
