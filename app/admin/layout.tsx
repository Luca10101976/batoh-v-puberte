import type { Metadata } from "next";
import { MozekHeader } from "@/components/admin/mozek-header";

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

// R53: Mozek má stálou hlavičku (Hry / Města). Obsah stránek zůstává jak byl.
export default function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <MozekHeader />
      <div className="px-4 pt-5">{children}</div>
    </>
  );
}
