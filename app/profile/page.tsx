import type { Metadata } from "next";
import { ProfileScreen } from "@/components/profile-screen";

export const metadata: Metadata = {
  title: "Profil | Traki na stopě",
  description: "Správa profilu hráče, party a bezpečnostních nastavení.",
  alternates: {
    canonical: "/profile"
  },
  robots: {
    index: false,
    follow: false
  }
};

export default function ProfilePage() {
  return <ProfileScreen />;
}
