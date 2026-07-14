import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Mozek | Traki na stopě tajemství",
    template: "%s | Mozek"
  },
  icons: {
    icon: [{ url: "/icons/mozek-favicon.svg", type: "image/svg+xml" }],
    shortcut: "/icons/mozek-favicon.svg"
  },
  robots: {
    index: false,
    follow: false
  }
};

export default function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
