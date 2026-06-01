"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Category } from "@/lib/client/api";
import type { NormalizedGame } from "@/types/game";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/* Edits a not-yet-imported game in memory. No API call — the parent swaps the
 * row in its `fresh` list when you save, so changes are applied at commit. */
export function ImportEditDialog({
  game,
  categories,
  bannerReady,
  onClose,
  onSave,
}: {
  game: NormalizedGame | null;
  categories: Category[];
  bannerReady: boolean;
  onClose: () => void;
  onSave: (updated: NormalizedGame) => void;
}) {
  const [form, setForm] = useState<NormalizedGame | null>(game);

  useEffect(() => { setForm(game); }, [game]);

  function set<K extends keyof NormalizedGame>(key: K, value: NormalizedGame[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function save() {
    if (form) onSave(form);
    onClose();
  }

  return (
    <Dialog open={!!game} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        {form && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8">Edit before import</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Title"><Input value={form.title} onChange={(e) => set("title", e.target.value)} /></Field>
              <Field label="Slug"><Input value={form.slug} onChange={(e) => set("slug", e.target.value)} /></Field>

              <Field label="Category">
                <Select value={form.category} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Tags (comma-separated)"><Input value={form.tags} onChange={(e) => set("tags", e.target.value)} /></Field>

              <Field label="Description" full><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
              <Field label="Instructions" full><Textarea value={form.instructions ?? ""} onChange={(e) => set("instructions", e.target.value)} /></Field>

              <Field label="Play URL" full><Input value={form.play_url} onChange={(e) => set("play_url", e.target.value)} /></Field>

              <Field label="Thumbnail URL"><Input value={form.thumbnail_image} onChange={(e) => set("thumbnail_image", e.target.value)} /></Field>
              <Field label="Banner image URL"><Input value={form.banner_image ?? ""} onChange={(e) => set("banner_image", e.target.value || null)} /></Field>

              {(form.thumbnail_image || form.banner_image) && (
                <div className="flex gap-3 sm:col-span-2">
                  {form.thumbnail_image && (
                    <div className="relative h-20 w-20 overflow-hidden rounded border border-border bg-secondary">
                      <Image src={form.thumbnail_image} alt="thumb" fill className="object-cover" unoptimized />
                    </div>
                  )}
                  {form.banner_image && (
                    <div className="relative h-20 w-40 overflow-hidden rounded border border-border bg-secondary">
                      <Image src={form.banner_image} alt="banner" fill className="object-cover" unoptimized />
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                <Field label="Width"><Input type="number" value={form.width} onChange={(e) => set("width", Number(e.target.value))} /></Field>
                <Field label="Height"><Input type="number" value={form.height} onChange={(e) => set("height", Number(e.target.value))} /></Field>
                <Field label="Orientation">
                  <Select value={form.orientation} onValueChange={(v) => set("orientation", v as NormalizedGame["orientation"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="landscape">Landscape</SelectItem>
                      <SelectItem value="portrait">Portrait</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="Quality score (0–1)">
                <Input type="number" step="0.01" value={form.quality_score ?? ""} onChange={(e) => set("quality_score", e.target.value === "" ? null : Number(e.target.value))} />
              </Field>

              <div className="flex flex-wrap gap-6 rounded-lg border border-border bg-secondary/40 p-3 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_featured} onCheckedChange={(v) => set("is_featured", v)} /> Featured</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_new} onCheckedChange={(v) => set("is_new", v)} /> New</label>
                <label className="flex items-center gap-2 text-sm" title={bannerReady ? "" : "Run the is_banner migration first"}>
                  <Switch checked={form.is_banner} onCheckedChange={(v) => set("is_banner", v)} disabled={!bannerReady} /> Banner game
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={save}>Apply changes</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
