"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  Search, Play, Eye, Pencil, Trash2, ChevronLeft, ChevronRight, Star, Image as ImageIcon, Sparkles, ImageOff,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { api, type Category } from "@/lib/client/api";
import type { GameRow } from "@/types/game";
import { EditGameDialog } from "./EditGameDialog";
import { PlayDialog } from "./PlayDialog";
import { GameDetailsDialog } from "./GameDetailsDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface ListResp {
  rows: GameRow[];
  total: number;
  page: number;
  pageSize: number;
}

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="grid size-11 place-items-center rounded bg-secondary text-muted-foreground">
        <ImageOff className="size-4" />
      </div>
    );
  }
  return (
    <div className="relative size-11 overflow-hidden rounded bg-secondary">
      <Image src={src} alt={alt} fill className="object-cover" unoptimized onError={() => setErr(true)} sizes="44px" />
    </div>
  );
}

export function GamesClient() {
  const sp = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [bannerReady, setBannerReady] = useState(true);

  const [q, setQ] = useState(() => sp.get("q") ?? "");
  const [category, setCategory] = useState(() => sp.get("category") ?? "all");
  const [flag, setFlag] = useState(() => sp.get("flag") ?? "all");
  const [sort, setSort] = useState(() => sp.get("sort") ?? "newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [data, setData] = useState<ListResp>({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [editing, setEditing] = useState<GameRow | null>(null);
  const [playing, setPlaying] = useState<GameRow | null>(null);
  const [viewing, setViewing] = useState<GameRow | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ ids?: string[]; category?: string; label: string } | null>(null);

  useEffect(() => {
    api<{ categories: Category[] }>("/api/categories").then((d) => setCategories(d.categories)).catch(() => {});
    api<{ bannerColumnReady: boolean }>("/api/stats").then((d) => setBannerReady(d.bannerColumnReady)).catch(() => {});
  }, []);

  const fetchGames = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q, category, flag, sort, page: String(page), pageSize: String(pageSize),
      });
      const d = await api<ListResp>(`/api/games?${params}`);
      setData(d);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [q, category, flag, sort, page, pageSize]);

  /* debounce on q, immediate on others */
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(fetchGames, 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [fetchGames]);

  useEffect(() => { setPage(1); }, [q, category, flag, sort, pageSize]);
  useEffect(() => { setSelected(new Set()); }, [data.rows]);

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const allOnPageSelected = data.rows.length > 0 && data.rows.every((g) => selected.has(String(g.id)));

  function toggleAll() {
    if (allOnPageSelected) setSelected(new Set());
    else setSelected(new Set(data.rows.map((g) => String(g.id))));
  }
  function toggleOne(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function doDelete() {
    if (!confirmDel) return;
    const { deleted } = await api<{ deleted: number }>("/api/games/bulk-delete", {
      method: "POST",
      json: confirmDel.ids ? { ids: confirmDel.ids } : { category: confirmDel.category },
    });
    toast.success(`Deleted ${deleted} game${deleted === 1 ? "" : "s"}`);
    setSelected(new Set());
    fetchGames();
  }

  const catLabel = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.slug, c.label])),
    [categories],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Games</h1>
          <p className="text-sm text-muted-foreground">{data.total.toLocaleString()} total</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search title…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={flag} onValueChange={setFlag}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All games</SelectItem>
            <SelectItem value="featured">Featured</SelectItem>
            <SelectItem value="banner">Banner</SelectItem>
            <SelectItem value="new">New</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="rating">Top rated</SelectItem>
            <SelectItem value="az">A → Z</SelectItem>
            <SelectItem value="za">Z → A</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {(selected.size > 0 || category !== "all") && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
          {selected.size > 0 && (
            <>
              <span>{selected.size} selected</span>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmDel({ ids: [...selected], label: `${selected.size} selected game(s)` })}
              >
                <Trash2 /> Delete selected
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </>
          )}
          {category !== "all" && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto text-destructive"
              onClick={() => setConfirmDel({ category, label: `ALL games in "${catLabel[category] ?? category}"` })}
            >
              <Trash2 /> Delete all in {catLabel[category] ?? category}
            </Button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"><Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} /></TableHead>
              <TableHead className="w-14"></TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-32">Category</TableHead>
              <TableHead className="w-40">Flags</TableHead>
              <TableHead className="w-20 text-right">Quality</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground"><Spinner className="mx-auto" /></TableCell></TableRow>
            ) : data.rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">No games found</TableCell></TableRow>
            ) : (
              data.rows.map((g) => {
                const id = String(g.id);
                return (
                  <TableRow key={id} data-state={selected.has(id) ? "selected" : undefined}>
                    <TableCell><Checkbox checked={selected.has(id)} onCheckedChange={() => toggleOne(id)} /></TableCell>
                    <TableCell><Thumb src={g.thumbnail_image} alt={g.title} /></TableCell>
                    <TableCell>
                      <div className="font-medium leading-tight line-clamp-1">{g.title}</div>
                      <div className="text-xs text-muted-foreground">{g.provider} · {g.orientation}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{catLabel[g.category] ?? g.category}</Badge></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {g.is_featured && <Badge variant="warning"><Star className="size-3" /> Feat</Badge>}
                        {g.is_banner && <Badge><ImageIcon className="size-3" /> Banner</Badge>}
                        {g.is_new && <Badge variant="success"><Sparkles className="size-3" /> New</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{g.quality_score != null ? Number(g.quality_score).toFixed(2) : "—"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="size-8" title="Play" onClick={() => setPlaying(g)}><Play /></Button>
                        <Button size="icon" variant="ghost" className="size-8" title="View details" onClick={() => setViewing(g)}><Eye /></Button>
                        <Button size="icon" variant="ghost" className="size-8" title="Edit" onClick={() => setEditing(g)}><Pencil /></Button>
                        <Button size="icon" variant="ghost" className="size-8 text-destructive" title="Delete" onClick={() => setConfirmDel({ ids: [id], label: g.title })}><Trash2 /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Page {data.page} of {totalPages}</span>
          <Button size="icon" variant="outline" className="size-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft /></Button>
          <Button size="icon" variant="outline" className="size-8" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight /></Button>
        </div>
      </div>

      <EditGameDialog
        game={editing}
        categories={categories}
        bannerReady={bannerReady}
        onClose={() => setEditing(null)}
        onSaved={(updated) => setData((d) => ({ ...d, rows: d.rows.map((r) => (String(r.id) === String(updated.id) ? updated : r)) }))}
      />
      <PlayDialog game={playing} onClose={() => setPlaying(null)} />
      <GameDetailsDialog
        game={viewing}
        categoryLabel={viewing ? catLabel[viewing.category] : undefined}
        onClose={() => setViewing(null)}
      />
      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(v) => !v && setConfirmDel(null)}
        title="Delete games?"
        description={confirmDel ? `This permanently deletes ${confirmDel.label}. This cannot be undone.` : ""}
        confirmLabel="Delete"
        onConfirm={doDelete}
      />
    </div>
  );
}
