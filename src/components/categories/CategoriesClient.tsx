"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Tags, ArrowRight, Trash2, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface FullCategory {
  slug: string;
  label: string;
  description?: string;
  featured?: boolean;
}

export function CategoriesClient() {
  const [cats, setCats] = useState<FullCategory[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<{ slug: string; label: string; count: number } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        api<{ categories: FullCategory[] }>("/api/categories"),
        api<{ perCategory: { slug: string; count: number }[] }>("/api/stats"),
      ]);
      setCats(c.categories);
      setCounts(Object.fromEntries(s.perCategory.map((x) => [x.slug, x.count])));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function deleteAll() {
    if (!confirm) return;
    const { deleted } = await api<{ deleted: number }>("/api/games/bulk-delete", { method: "POST", json: { category: confirm.slug } });
    toast.success(`Deleted ${deleted} games from ${confirm.label}`);
    load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Categories</h1>
        <p className="text-sm text-muted-foreground">The site&apos;s canonical categories. Manage games within each.</p>
      </div>

      <Card className="border-border/60">
        <CardContent className="flex items-start gap-2 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            Categories are defined in web0.2&apos;s config (the single source of truth) — this list mirrors it.
            Adding/removing categories &amp; submenus is a planned v2 feature (needs a categories DB table).
          </span>
        </CardContent>
      </Card>

      {loading ? (
        <div className="py-12 text-center"><Spinner className="mx-auto" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cats.map((c) => (
            <Card key={c.slug}>
              <CardContent className="space-y-3 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary"><Tags className="size-4" /></span>
                    <div>
                      <div className="font-medium">{c.label}</div>
                      <div className="text-xs text-muted-foreground">/{c.slug}</div>
                    </div>
                  </div>
                  {c.featured && <Badge>featured</Badge>}
                </div>
                {c.description && <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>}
                <div className="flex items-center justify-between">
                  <span className="text-sm tabular-nums text-muted-foreground">{(counts[c.slug] ?? 0).toLocaleString()} games</span>
                  <div className="flex gap-1">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/games?category=${c.slug}`}>Manage <ArrowRight className="size-3.5" /></Link>
                    </Button>
                    <Button size="icon" variant="ghost" className="size-8 text-destructive" title="Delete all games in this category"
                      onClick={() => setConfirm({ slug: c.slug, label: c.label, count: counts[c.slug] ?? 0 })} disabled={!counts[c.slug]}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={`Delete all games in ${confirm?.label}?`}
        description={confirm ? `This permanently deletes all ${confirm.count} games in "${confirm.label}". This cannot be undone.` : ""}
        confirmLabel="Delete all"
        onConfirm={deleteAll}
      />
    </div>
  );
}
