import type { Metadata } from "next";
import { ProfileScreen } from "@/components/profile-screen";

export const metadata: Metadata = {
  title: "Profil | Traki na stopě tajemství",
  description: "Profil hráče: Traki klíč, tvoje hry a kamarádi.",
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
