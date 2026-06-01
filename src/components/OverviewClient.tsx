"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Gamepad2, Star, ImageIcon, Sparkles, AlertTriangle, RefreshCw, Copy, Tags } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { api, type Category } from "@/lib/client/api";

interface Stats {
  total: number;
  featured: number;
  banner: number | null;
  isNew: number;
  uncategorized: number;
  perCategory: { slug: string; count: number }[];
  bannerColumnReady: boolean;
}

const MIGRATION_SQL = "alter table games add column if not exists is_banner boolean default false;";

function StatCard({ icon: Icon, label, value, href }: { icon: typeof Star; label: string; value: string | number; href?: string }) {
  const inner = (
    <Card className={href ? "transition-colors hover:border-primary/50" : ""}>
      <CardContent className="flex items-center gap-3 py-4">
        <span className="grid size-10 place-items-center rounded-lg bg-primary/15 text-primary"><Icon className="size-5" /></span>
        <div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function OverviewClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [cats, setCats] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        api<Stats>("/api/stats"),
        api<{ categories: Category[] }>("/api/categories"),
      ]);
      setStats(s);
      setCats(Object.fromEntries(c.categories.map((x) => [x.slug, x.label])));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Overview</h1>
          <p className="text-sm text-muted-foreground">actiongames.io catalog at a glance</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Spinner /> : <RefreshCw />} Refresh
        </Button>
      </div>

      {stats && !stats.bannerColumnReady && (
        <Card className="border-[color:var(--warning)]/40">
          <CardContent className="space-y-3 py-4">
            <div className="flex items-center gap-2 font-medium text-[color:var(--warning)]">
              <AlertTriangle className="size-4" /> Banner games need a one-time DB migration
            </div>
            <p className="text-sm text-muted-foreground">
              Run this in the Supabase SQL editor to enable the banner-games flag, then click Refresh:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md bg-secondary px-3 py-2 text-xs">{MIGRATION_SQL}</code>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(MIGRATION_SQL); toast.success("Copied"); }}>
                <Copy /> Copy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && !stats ? (
        <div className="py-12 text-center"><Spinner className="mx-auto" /></div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard icon={Gamepad2} label="Total games" value={stats.total.toLocaleString()} href="/games" />
            <StatCard icon={Star} label="Featured" value={stats.featured.toLocaleString()} href="/games?flag=featured" />
            <StatCard icon={ImageIcon} label="Banner games" value={stats.banner == null ? "—" : stats.banner.toLocaleString()} href={stats.banner == null ? undefined : "/games?flag=banner"} />
            <StatCard icon={Sparkles} label="New" value={stats.isNew.toLocaleString()} href="/games?flag=new" />
            <StatCard icon={AlertTriangle} label="Off-taxonomy" value={stats.uncategorized.toLocaleString()} />
          </div>

          <Card>
            <CardContent className="py-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Tags className="size-4" /> Games per category</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {stats.perCategory.map((c) => (
                  <Link key={c.slug} href={`/games?category=${c.slug}`}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm transition-colors hover:border-primary/50">
                    <span>{cats[c.slug] ?? c.slug}</span>
                    <span className="tabular-nums text-muted-foreground">{c.count}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
