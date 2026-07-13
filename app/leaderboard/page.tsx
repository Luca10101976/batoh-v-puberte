import type { Metadata } from "next";
import { LeaderboardScreen } from "@/components/leaderboard-screen";

export const metadata: Metadata = {
  title: "Žebříček | Traki na stopě",
  description: "Sleduj pořadí objevitelů a porovnej své body s kamarády.",
  alternates: {
    canonical: "/leaderboard"
  }
};

export default function LeaderboardPage() {
  return <LeaderboardScreen />;
}
