"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { api, type Category } from "@/lib/client/api";

const EMPTY = {
  title: "", play_url: "", provider: "manual", provider_game_id: "",
  category: "action", tags: "", description: "", instructions: "",
  thumbnail_image: "", banner_image: "", width: "800", height: "600",
  orientation: "landscape", quality_score: "",
  is_featured: false, is_new: true, is_banner: false,
};

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function ManualAddForm({ categories, bannerReady }: { categories: Category[]; bannerReady: boolean }) {
  const [f, setF] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF((s) => ({ ...s, [k]: v })); }

  async function submit() {
    if (!f.title.trim()) return toast.error("Title is required");
    if (!f.play_url.trim()) return toast.error("Play URL is required");
    setSaving(true);
    try {
      await api("/api/games", { method: "POST", json: { ...f } });
      toast.success(`Added "${f.title}"`);
      setF({ ...EMPTY });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Title *"><Input value={f.title} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Play URL *"><Input value={f.play_url} onChange={(e) => set("play_url", e.target.value)} /></Field>
          <Field label="Provider"><Input value={f.provider} onChange={(e) => set("provider", e.target.value)} /></Field>
          <Field label="Provider game ID"><Input value={f.provider_game_id} onChange={(e) => set("provider_game_id", e.target.value)} placeholder="auto if blank" /></Field>
          <Field label="Category">
            <Select value={f.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Tags (comma-separated)"><Input value={f.tags} onChange={(e) => set("tags", e.target.value)} /></Field>
          <Field label="Description" full><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
          <Field label="Instructions" full><Textarea value={f.instructions} onChange={(e) => set("instructions", e.target.value)} /></Field>
          <Field label="Thumbnail URL"><Input value={f.thumbnail_image} onChange={(e) => set("thumbnail_image", e.target.value)} /></Field>
          <Field label="Banner image URL"><Input value={f.banner_image} onChange={(e) => set("banner_image", e.target.value)} /></Field>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <Field label="Width"><Input type="number" value={f.width} onChange={(e) => set("width", e.target.value)} /></Field>
            <Field label="Height"><Input type="number" value={f.height} onChange={(e) => set("height", e.target.value)} /></Field>
            <Field label="Orientation">
              <Select value={f.orientation} onValueChange={(v) => set("orientation", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="landscape">Landscape</SelectItem>
                  <SelectItem value="portrait">Portrait</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Quality score (0–1)"><Input type="number" step="0.01" value={f.quality_score} onChange={(e) => set("quality_score", e.target.value)} /></Field>
          <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-secondary/40 p-3 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.is_featured} onCheckedChange={(v) => set("is_featured", v)} /> Featured</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.is_new} onCheckedChange={(v) => set("is_new", v)} /> New</label>
            <label className="flex items-center gap-2 text-sm" title={bannerReady ? "" : "Run the is_banner migration first"}>
              <Switch checked={f.is_banner} onCheckedChange={(v) => set("is_banner", v)} disabled={!bannerReady} /> Banner game
            </label>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={submit} disabled={saving}>{saving && <Spinner />} Add game</Button>
        </div>
      </CardContent>
    </Card>
  );
}
