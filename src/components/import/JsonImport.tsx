"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { Upload, CheckCircle2, AlertTriangle, FileJson, Sparkles, ImageOff, ClipboardPaste, Link2, Play, Eye, Pencil, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { api, type Category } from "@/lib/client/api";
import type { NormalizedGame } from "@/types/game";
import { PlayDialog } from "@/components/games/PlayDialog";
import { GameDetailsDialog } from "@/components/games/GameDetailsDialog";
import { ImportEditDialog } from "./ImportEditDialog";

interface ProcessResp {
  provider: string;
  detected: boolean;
  counts: { total: number; duplicatesInFile: number; duplicatesInDb: number; fresh: number };
  fresh: NormalizedGame[];
  duplicatesInDb: { title: string; provider: string }[];
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
      <div className={`text-lg font-semibold tabular-nums ${tone === "good" ? "text-[color:var(--success)]" : tone === "warn" ? "text-[color:var(--warning)]" : ""}`}>{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
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

export function JsonImport({ categories, bannerReady }: { categories: Category[]; bannerReady: boolean }) {
  const [provider, setProvider] = useState("auto");
  const [forceAll, setForceAll] = useState(false);
  const [overrideCategory, setOverrideCategory] = useState("action");
  const [fileName, setFileName] = useState("");
  const rawRef = useRef<unknown>(null);

  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ProcessResp | null>(null);
  const [fresh, setFresh] = useState<NormalizedGame[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [committing, setCommitting] = useState(false);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [loadingPaste, setLoadingPaste] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [playing, setPlaying] = useState<NormalizedGame | null>(null);
  const [viewing, setViewing] = useState<NormalizedGame | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  const catLabel = Object.fromEntries(categories.map((c) => [c.slug, c.label]));

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setResult(null);
    if (!file) return;
    setFileName(file.name);
    try {
      rawRef.current = JSON.parse(await file.text());
    } catch (err) {
      toast.error(`Invalid JSON: ${(err as Error).message}`);
      rawRef.current = null;
    }
  }

  /* Accept either a pasted JSON blob or a feed URL (e.g. GamePix / GameMonetize).
   * URLs are fetched server-side to dodge browser CORS. */
  async function loadPasted() {
    const text = pasteValue.trim();
    if (!text) return toast.error("Paste JSON or a feed URL first");
    setLoadingPaste(true);
    try {
      if (/^https?:\/\//i.test(text)) {
        const { raw } = await api<{ raw: unknown }>("/api/import/fetch-url", { method: "POST", json: { url: text } });
        rawRef.current = raw;
        setFileName(`${new URL(text).hostname} feed`);
        toast.success("Feed loaded");
      } else {
        rawRef.current = JSON.parse(text);
        setFileName("Pasted JSON");
        toast.success("JSON parsed");
      }
      setResult(null);
      setPasteOpen(false);
      setPasteValue("");
    } catch (err) {
      toast.error(`Couldn't load: ${(err as Error).message}`);
    } finally {
      setLoadingPaste(false);
    }
  }

  async function process() {
    if (rawRef.current == null) return toast.error("Choose a JSON file first");
    setProcessing(true);
    setResult(null);
    try {
      const d = await api<ProcessResp>("/api/import/process", {
        method: "POST",
        json: { provider, raw: rawRef.current, overrideCategory, forceAll },
      });
      setResult(d);
      setFresh(d.fresh);
      setSelected(new Set(d.fresh.map((_, i) => i)));
      setPage(1);
      toast.success(`${d.counts.fresh} fresh games ready`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProcessing(false);
    }
  }

  function toggleBanner(i: number, v: boolean) {
    setFresh((rows) => rows.map((g, idx) => (idx === i ? { ...g, is_banner: v } : g)));
  }

  /* Clear the currently loaded JSON / staged list — does NOT touch the
   * database. Lets you discard this file and load a different one. */
  function clearStaging() {
    setResult(null);
    setFresh([]);
    setSelected(new Set());
    setFileName("");
    rawRef.current = null;
    setPage(1);
    toast.success("Cleared — load another file");
  }

  async function commit() {
    if (!result) return;
    const games = fresh.filter((_, i) => selected.has(i));
    if (!games.length) return toast.error("Nothing selected");
    setCommitting(true);
    try {
      const r = await api<{ inserted: number; failed: number; errors: string[] }>("/api/import/commit", {
        method: "POST",
        json: { games },
      });
      if (r.failed) {
        const reason = r.errors?.[0] ? ` — ${r.errors[0]}` : "";
        toast.warning(`Imported ${r.inserted}, ${r.failed} failed${reason}`, { duration: 12000 });
      } else {
        toast.success(`Imported ${r.inserted} games`);
      }
      /* Only reset the form when something actually landed. */
      if (r.inserted > 0) {
        setResult(null);
        setFresh([]);
        setFileName("");
        rawRef.current = null;
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCommitting(false);
    }
  }

  const allSelected = fresh.length > 0 && selected.size === fresh.length;

  /* Pagination over the fresh list. We keep the absolute index alongside each
   * row so selection / banner / edit keep targeting the right game. */
  const totalPages = Math.max(1, Math.ceil(fresh.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = fresh
    .map((g, i) => ({ g, i }))
    .slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Provider</label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect from file</SelectItem>
                  <SelectItem value="gamemonitize">GameMonetize</SelectItem>
                  <SelectItem value="gamepix">GamePix</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">JSON source</label>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" asChild>
                  <label className="cursor-pointer">
                    <FileJson /> Choose file
                    <input type="file" accept=".json,application/json" className="hidden" onChange={onFile} />
                  </label>
                </Button>
                <Button variant="outline" onClick={() => setPasteOpen(true)}>
                  <ClipboardPaste /> Paste JSON / URL
                </Button>
                {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={forceAll} onCheckedChange={(v) => setForceAll(!!v)} />
              Force one category for every game in this file (override auto-detect)
            </label>
            {forceAll && (
              <div className="mt-3 max-w-xs">
                <Select value={overrideCategory} onValueChange={setOverrideCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {!forceAll && (
              <p className="mt-2 text-xs text-muted-foreground">
                Genres are auto-mapped from each game&apos;s category + tags. Unmapped → <strong>action</strong>.
                Duplicates (same game from any provider) are detected and skipped.
              </p>
            )}
          </div>

          <Button onClick={process} disabled={processing || !fileName}>
            {processing ? <Spinner /> : <Upload />} Process &amp; check duplicates
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="In file" value={result.counts.total} />
              <Stat label="Dupes in file" value={result.counts.duplicatesInFile} tone="warn" />
              <Stat label="Already in DB" value={result.counts.duplicatesInDb} tone="warn" />
              <Stat label="Fresh to import" value={result.counts.fresh} tone="good" />
            </div>
            <p className="text-xs text-muted-foreground">
              Detected provider: <Badge variant="outline">{result.provider}</Badge>{" "}
              {result.detected ? "(auto)" : "(manual)"}
            </p>

            {result.duplicatesInDb.length > 0 && (
              <details className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
                <summary className="cursor-pointer font-medium text-[color:var(--warning)]">
                  {result.duplicatesInDb.length} already in your catalog — auto-skipped (not re-imported)
                </summary>
                <ul className="mt-2 max-h-40 space-y-0.5 overflow-auto text-xs text-muted-foreground">
                  {result.duplicatesInDb.map((d, i) => (
                    <li key={i}>· {d.title} <span className="opacity-60">({d.provider})</span></li>
                  ))}
                </ul>
              </details>
            )}

            {fresh.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
                <AlertTriangle className="size-4" /> No fresh games — everything in this file is already in the database.
              </div>
            ) : (
              <>
                <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card/95 px-1 py-1 backdrop-blur supports-[backdrop-filter]:bg-card/80">
                  <span className="text-sm text-muted-foreground">{selected.size} of {fresh.length} selected · review before importing</span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(fresh.map((_, i) => i)))}>Select all</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>None</Button>
                    <Button size="sm" variant="outline" onClick={clearStaging} title="Discard this loaded file (does not touch the database)">
                      <X /> Clear all
                    </Button>
                    <Button size="sm" onClick={commit} disabled={committing || selected.size === 0}>
                      {committing ? <Spinner /> : <CheckCircle2 />} Import {selected.size} game{selected.size === 1 ? "" : "s"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(fresh.map((_, i) => i)))}
                          />
                        </TableHead>
                        <TableHead className="w-14"></TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead className="w-32">Category</TableHead>
                        <TableHead className="w-20">Flags</TableHead>
                        <TableHead className="w-24 text-center">Banner</TableHead>
                        <TableHead className="w-32 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map(({ g, i }) => (
                        <TableRow key={i} data-state={selected.has(i) ? "selected" : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={selected.has(i)}
                              onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(i); else n.delete(i); return n; })}
                            />
                          </TableCell>
                          <TableCell><Thumb src={g.thumbnail_image} alt={g.title} /></TableCell>
                          <TableCell>
                            <div className="font-medium leading-tight line-clamp-1">{g.title}</div>
                            <div className="text-xs text-muted-foreground">{g.provider} · {g.orientation}</div>
                          </TableCell>
                          <TableCell><Badge variant="outline">{catLabel[g.category] ?? g.category}</Badge></TableCell>
                          <TableCell>
                            {g.is_new && <Badge variant="success"><Sparkles className="size-3" /> New</Badge>}
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={g.is_banner}
                              onCheckedChange={(v) => toggleBanner(i, v)}
                              disabled={!bannerReady}
                              title={bannerReady ? "Mark as banner game" : "Run the is_banner migration first"}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="size-8" title="Play" onClick={() => setPlaying(g)}><Play /></Button>
                              <Button size="icon" variant="ghost" className="size-8" title="View details" onClick={() => setViewing(g)}><Eye /></Button>
                              <Button size="icon" variant="ghost" className="size-8" title="Edit" onClick={() => setEditing(i)}><Pencil /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>Rows per page</span>
                    <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                      <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Page {safePage} of {totalPages}</span>
                    <Button size="icon" variant="outline" className="size-8" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft /></Button>
                    <Button size="icon" variant="outline" className="size-8" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><ChevronRight /></Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paste JSON or feed URL</DialogTitle>
            <DialogDescription>
              Paste a provider feed URL (e.g. your GamePix RSS-feed JSON URL) and we&apos;ll fetch it,
              or paste the raw JSON directly.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={8}
            className="font-mono text-xs"
            placeholder={"https://feeds.gamepix.com/v2/json?sid=…\n\n— or —\n\n{ \"items\": [ … ] }"}
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
          />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link2 className="size-3.5" /> URLs are fetched on the server, so CORS won&apos;t block them.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPasteOpen(false)}>Cancel</Button>
            <Button onClick={loadPasted} disabled={loadingPaste || !pasteValue.trim()}>
              {loadingPaste ? <Spinner /> : <ClipboardPaste />} Load
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PlayDialog game={playing} onClose={() => setPlaying(null)} />
      <GameDetailsDialog
        game={viewing}
        categoryLabel={viewing ? catLabel[viewing.category] : undefined}
        onClose={() => setViewing(null)}
      />
      <ImportEditDialog
        game={editing != null ? fresh[editing] : null}
        categories={categories}
        bannerReady={bannerReady}
        onClose={() => setEditing(null)}
        onSave={(updated) => setFresh((rows) => rows.map((g, idx) => (idx === editing ? updated : g)))}
      />
    </div>
  );
}
