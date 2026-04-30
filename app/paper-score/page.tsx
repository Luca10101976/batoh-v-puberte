import type { Metadata } from "next";
import { PaperScoreScreen } from "@/components/paper-score-screen";
import { getPublishedLocationIds } from "@/lib/gameplay-server";

export const metadata: Metadata = {
  title: "Papírová varianta | Batoh v pubertě",
  description: "Stáhni si tiskovou verzi mise a po návratu zadej stejné odpovědi do aplikace.",
  alternates: {
    canonical: "/paper-score"
  },
  robots: {
    index: false,
    follow: false
  }
};

export default async function PaperScorePage() {
  const availableLocationIds = await getPublishedLocationIds();

  return <PaperScoreScreen availableLocationIds={availableLocationIds} />;
}
