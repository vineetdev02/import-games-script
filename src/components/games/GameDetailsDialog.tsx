"use client";
import Image from "next/image";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Star, ImageIcon, Sparkles, ImageOff } from "lucide-react";

/* Read-only detail view. Accepts the common fields shared by stored games
 * (GameRow) and not-yet-imported games (NormalizedGame). */
export interface GameDetails {
  title: string;
  description?: string | null;
  instructions?: string | null;
  category: string;
  tags?: string | null;
  provider: string;
  provider_game_id?: string | null;
  orientation?: "landscape" | "portrait" | null;
  quality_score?: number | null;
  width?: number | null;
  height?: number | null;
  thumbnail_image?: string | null;
  banner_image?: string | null;
  play_url: string;
  is_featured?: boolean | null;
  is_new?: boolean | null;
  is_banner?: boolean | null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function Media({ src, label, ratio }: { src: string | null | undefined; label: string; ratio: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      {src ? (
        <div className="relative overflow-hidden rounded-lg border border-border bg-secondary" style={{ aspectRatio: ratio }}>
          <Image src={src} alt={label} fill className="object-cover" unoptimized />
        </div>
      ) : (
        <div className="grid place-items-center rounded-lg border border-dashed border-border bg-secondary/40 text-muted-foreground" style={{ aspectRatio: ratio }}>
          <ImageOff className="size-5" />
        </div>
      )}
    </div>
  );
}

export function GameDetailsDialog({
  game,
  categoryLabel,
  onClose,
}: {
  game: GameDetails | null;
  categoryLabel?: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!game} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        {game && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
                {game.title}
                <div className="flex gap-1">
                  {game.is_featured && <Badge variant="warning"><Star className="size-3" /> Featured</Badge>}
                  {game.is_banner && <Badge><ImageIcon className="size-3" /> Banner</Badge>}
                  {game.is_new && <Badge variant="success"><Sparkles className="size-3" /> New</Badge>}
                </div>
              </DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Media src={game.thumbnail_image} label="Thumbnail" ratio="1 / 1" />
              <Media src={game.banner_image} label="Banner" ratio="16 / 9" />
            </div>

            <div className="divide-y divide-border rounded-lg border border-border bg-secondary/30 px-3">
              <Row label="Category"><Badge variant="outline">{categoryLabel ?? game.category}</Badge></Row>
              <Row label="Provider">{game.provider}{game.provider_game_id ? ` · ${game.provider_game_id}` : ""}</Row>
              <Row label="Tags">{game.tags || "—"}</Row>
              <Row label="Dimensions">{game.width ?? "?"} × {game.height ?? "?"} · {game.orientation ?? "—"}</Row>
              <Row label="Quality">{game.quality_score != null ? Number(game.quality_score).toFixed(2) : "—"}</Row>
              <Row label="Description">{game.description || "—"}</Row>
              <Row label="Instructions">{game.instructions || "—"}</Row>
              <Row label="Play URL">
                <a href={game.play_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  <span className="truncate">{game.play_url}</span>
                  <ExternalLink className="size-3.5 shrink-0" />
                </a>
              </Row>
            </div>

            <div className="flex justify-end">
              <Button asChild variant="outline">
                <a href={game.play_url} target="_blank" rel="noreferrer"><ExternalLink /> Open game</a>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
