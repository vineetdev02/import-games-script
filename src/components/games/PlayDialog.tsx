"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

/* Minimal shape so this works for both stored games (GameRow) and
 * not-yet-imported games (NormalizedGame). */
export interface PlayableGame {
  title: string;
  play_url: string;
  orientation?: "landscape" | "portrait" | null;
}

export function PlayDialog({
  game,
  onClose,
}: {
  game: PlayableGame | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!game} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        {game && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-8">
                {game.title}
                <Button asChild variant="ghost" size="icon" className="size-7">
                  <a href={game.play_url} target="_blank" rel="noreferrer" title="Open in new tab">
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              </DialogTitle>
            </DialogHeader>
            <div
              className="w-full overflow-hidden rounded-lg border border-border bg-black"
              style={{ aspectRatio: game.orientation === "portrait" ? "9 / 16" : "16 / 9" }}
            >
              <iframe
                src={game.play_url}
                className="h-full w-full"
                allow="autoplay; fullscreen; gamepad; microphone"
                referrerPolicy="no-referrer"
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
