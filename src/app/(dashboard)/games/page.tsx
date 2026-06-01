import { Suspense } from "react";
import { GamesClient } from "@/components/games/GamesClient";

export const dynamic = "force-dynamic";

export default function GamesPage() {
  return (
    <Suspense fallback={null}>
      <GamesClient />
    </Suspense>
  );
}
