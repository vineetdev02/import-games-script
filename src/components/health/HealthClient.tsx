"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { ScanSearch, Trash2, Pencil, ImageOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { api, type Category } from "@/lib/client/api";
import type { GameRow, ImageHealth } from "@/types/game";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EditGameDialog } from "@/components/games/EditGameDialog";

interface Problem {
  id: string;
  title: string;
  slug: string;
  category: string;
  thumbnail_image: string | null;
  banner_image: string | null;
  is_banner: boolean;
  thumbnail: ImageHealth | "missing" | "broken" | "ok";
  banner: ImageHealth | "missing" | "broken" | "ok";
  reasons: string[];
}

function statusBadge(s: string, label: string) {
  if (s === "ok") return null;
  return <Badge variant={s === "broken" ? "destructive" : "warning"}>{label}: {s}</Badge>;
}

export function HealthClient() {
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<number | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ ids: string[]; label: string } | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [bannerReady, setBannerReady] = useState(true);
  const [editing, setEditing] = useState<GameRow | null>(null);

  useEffect(() => {
    api<{ categories: Category[] }>("/api/categories").then((d) => setCategories(d.categories)).catch(() => {});
    api<{ bannerColumnReady: boolean }>("/api/stats").then((d) => setBannerReady(d.bannerColumnReady)).catch(() => {});
  }, []);

  async function scan() {
    setScanning(true);
    setSelected(new Set());
    try {
      const d = await api<{ scanned: number; problems: Problem[] }>("/api/health/scan", { method: "POST", json: {} });
      setScanned(d.scanned);
      setProblems(d.problems);
      toast.success(`Scanned ${d.scanned} — ${d.problems.length} with image issues`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  async function remove(ids: string[]) {
    const { deleted } = await api<{ deleted: number }>("/api/games/bulk-delete", { method: "POST", json: { ids } });
    toast.success(`Removed ${deleted}`);
    setProblems((p) => p.filter((x) => !ids.includes(x.id)));
    setSelected(new Set());
  }

  async function openEdit(id: string) {
    try {
      const { game } = await api<{ game: GameRow }>(`/api/games/${id}`);
      setEditing(game);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const allSelected = problems.length > 0 && problems.every((p) => selected.has(p.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Needs Attention</h1>
          <p className="text-sm text-muted-foreground">Games with a missing or broken (404) thumbnail or banner image.</p>
        </div>
        <Button onClick={scan} disabled={scanning}>{scanning ? <Spinner /> : <ScanSearch />} Scan images</Button>
      </div>

      {scanned !== null && problems.length === 0 && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
            <ShieldCheck className="size-5 text-[color:var(--success)]" />
            All {scanned} games have working images. Nothing to fix.
          </CardContent>
        </Card>
      )}

      {problems.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
            <span>{problems.length} games with issues</span>
            {selected.size > 0 && (
              <>
                <Button size="sm" variant="destructive" onClick={() => setConfirm({ ids: [...selected], label: `${selected.size} selected` })}><Trash2 /> Remove selected</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              </>
            )}
            <Button size="sm" variant="outline" className="ml-auto text-destructive" onClick={() => setConfirm({ ids: problems.map((p) => p.id), label: `ALL ${problems.length} broken games` })}>
              <Trash2 /> Remove all broken
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(problems.map((p) => p.id)))} /></TableHead>
                  <TableHead className="w-14"></TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-28">Category</TableHead>
                  <TableHead>Issues</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {problems.map((p) => (
                  <TableRow key={p.id} data-state={selected.has(p.id) ? "selected" : undefined}>
                    <TableCell><Checkbox checked={selected.has(p.id)} onCheckedChange={() => setSelected((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} /></TableCell>
                    <TableCell>
                      {p.thumbnail === "ok" && p.thumbnail_image ? (
                        <div className="relative size-11 overflow-hidden rounded bg-secondary">
                          <Image src={p.thumbnail_image} alt="" fill className="object-cover" unoptimized sizes="44px" />
                        </div>
                      ) : (
                        <div className="grid size-11 place-items-center rounded bg-destructive/15 text-destructive"><ImageOff className="size-4" /></div>
                      )}
                    </TableCell>
                    <TableCell><div className="font-medium leading-tight line-clamp-1">{p.title}</div><div className="text-xs text-muted-foreground">{p.is_banner ? "banner game" : ""}</div></TableCell>
                    <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
                    <TableCell><div className="flex flex-wrap gap-1">{statusBadge(p.thumbnail, "thumb")}{statusBadge(p.banner, "banner")}</div></TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="size-8" title="Fix / edit" onClick={() => openEdit(p.id)}><Pencil /></Button>
                        <Button size="icon" variant="ghost" className="size-8 text-destructive" title="Remove" onClick={() => setConfirm({ ids: [p.id], label: p.title })}><Trash2 /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Remove games?"
        description={confirm ? `Permanently delete ${confirm.label}. This cannot be undone.` : ""}
        confirmLabel="Remove"
        onConfirm={() => { if (confirm) return remove(confirm.ids); }}
      />
      <EditGameDialog
        game={editing}
        categories={categories}
        bannerReady={bannerReady}
        onClose={() => setEditing(null)}
        onSaved={(g) => { setProblems((p) => p.filter((x) => x.id !== String(g.id))); toast.success("Updated — rescan to re-check"); }}
      />
    </div>
  );
}
