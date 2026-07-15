"use client";
import { useState } from "react";
import {
  Globe,
  RefreshCw,
  ShieldCheck,
  ExternalLink,
  AlertTriangle,
  Radar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/client/api";

interface LiveIssue {
  label: string;
  severity: "error" | "warn";
  detail?: string;
}
interface ProbeResult {
  slug: string;
  url: string;
  status: number;
  ok: boolean;
  reason: "in-db" | "dead-in-sitemap";
}
interface LiveReport {
  siteUrl: string;
  checkedAt: string;
  deep: boolean;
  dbCount: number;
  live: { reachable: boolean; gameCount?: number; catalogSource?: string; error?: string };
  sitemap: {
    reachable: boolean;
    totalUrls: number;
    gameUrls: number;
    newestLastmod: string | null;
    ageDays: number | null;
    error?: string;
  };
  missingFromSitemap: string[];
  deadInSitemap: string[];
  broken: ProbeResult[];
  probedCount: number;
  blocked: boolean;
  issues: LiveIssue[];
}

function Stat({ label, value, hint, bad }: { label: string; value: string; hint?: string; bad?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={bad ? "text-lg font-semibold text-destructive" : "text-lg font-semibold"}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/* Long slug lists are diagnostic, not actionable one-by-one — show enough to
 * recognize the pattern, keep the rest behind the count. */
function SlugList({ slugs, site, limit = 12 }: { slugs: string[]; site: string; limit?: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {slugs.slice(0, limit).map((s) => (
        <a
          key={s}
          href={`${site}/games/${s}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded border border-border bg-secondary/50 px-2 py-0.5 font-mono text-xs hover:text-foreground"
        >
          {s} <ExternalLink className="size-3 opacity-50" />
        </a>
      ))}
      {slugs.length > limit && (
        <span className="px-1 py-0.5 text-xs text-muted-foreground">+{slugs.length - limit} more</span>
      )}
    </div>
  );
}

export function LiveSiteClient() {
  const [checking, setChecking] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [deep, setDeep] = useState(false);
  const [report, setReport] = useState<LiveReport | null>(null);

  async function check() {
    setChecking(true);
    try {
      const d = await api<LiveReport>("/api/health/live", { method: "POST", json: { deep } });
      setReport(d);
      const errors = d.issues.filter((i) => i.severity === "error").length;
      if (errors) toast.error(`${errors} live issue${errors > 1 ? "s" : ""} found`);
      else toast.success("Live site matches the database");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function revalidate() {
    setRevalidating(true);
    try {
      await api("/api/health/revalidate", { method: "POST", json: {} });
      toast.success("Cache busted — the site rebuilds on the next request");
      /* The rebuild is triggered by the next visit, so an immediate re-check
       * would still read the old cache. */
      await new Promise((r) => setTimeout(r, 3000));
      await check();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRevalidating(false);
    }
  }

  const busy = checking || revalidating;
  const clean = report && report.issues.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Live site check</h2>
          <p className="text-sm text-muted-foreground">
            Compares the database against what actiongames.io actually serves — games missing from
            the sitemap, deleted games still listed (these become Google 404s), and pages not
            returning 200.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="deep" checked={deep} onCheckedChange={setDeep} disabled={busy} />
            <Label htmlFor="deep" className="text-sm text-muted-foreground">
              Probe every game
            </Label>
          </div>
          <Button onClick={check} disabled={busy}>
            {checking ? <Spinner /> : <Radar />} Run live check
          </Button>
        </div>
      </div>

      {deep && (
        <p className="text-xs text-muted-foreground">
          Deep mode sends one request per game — a minute or two, and enough traffic that the site
          may rate-limit it. Use it to investigate, not on a routine basis.
        </p>
      )}

      {report && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Games in database" value={String(report.dbCount)} />
            <Stat
              label="Games live"
              value={report.live.reachable ? String(report.live.gameCount ?? "—") : "unreachable"}
              hint={report.live.catalogSource ? `source: ${report.live.catalogSource}` : report.live.error}
              bad={!report.live.reachable || report.live.gameCount !== report.dbCount}
            />
            <Stat
              label="Games in sitemap"
              value={report.sitemap.reachable ? String(report.sitemap.gameUrls) : "unreachable"}
              hint={report.sitemap.reachable ? `${report.sitemap.totalUrls} URLs total` : report.sitemap.error}
              bad={report.sitemap.gameUrls !== report.dbCount}
            />
            <Stat
              label="Sitemap freshness"
              value={report.sitemap.ageDays != null ? `${report.sitemap.ageDays}d old` : "—"}
              hint={report.sitemap.newestLastmod ? `newest: ${report.sitemap.newestLastmod.slice(0, 10)}` : undefined}
              bad={(report.sitemap.ageDays ?? 0) > 7}
            />
          </div>

          {clean && (
            <Card>
              <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
                <ShieldCheck className="size-5 text-[color:var(--success)]" />
                Live site is in sync — every game is in the sitemap and {report.probedCount} probed URLs
                returned 200. No 404s for Google to find.
              </CardContent>
            </Card>
          )}

          {report.issues.length > 0 && (
            <div className="space-y-2 rounded-xl border border-border bg-card p-3">
              {report.issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <AlertTriangle
                    className={
                      issue.severity === "error"
                        ? "mt-0.5 size-4 shrink-0 text-destructive"
                        : "mt-0.5 size-4 shrink-0 text-[color:var(--warning)]"
                    }
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{issue.label}</span>
                      <Badge variant={issue.severity === "error" ? "destructive" : "warning"}>
                        {issue.severity}
                      </Badge>
                    </div>
                    {issue.detail && <p className="text-xs text-muted-foreground">{issue.detail}</p>}
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
                <Button size="sm" onClick={revalidate} disabled={busy}>
                  {revalidating ? <Spinner /> : <RefreshCw />} Revalidate live site
                </Button>
                <span className="text-xs text-muted-foreground">
                  Busts the site&apos;s cache + sitemap. Fixes everything except genuinely deleted games.
                </span>
              </div>
            </div>
          )}

          {report.deadInSitemap.length > 0 && (
            <Card>
              <CardContent className="space-y-2 py-4">
                <div className="text-sm font-medium">
                  Deleted games still in the sitemap
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Google crawls these and gets a 404 — revalidate to remove them.
                  </span>
                </div>
                <SlugList slugs={report.deadInSitemap} site={report.siteUrl} />
              </CardContent>
            </Card>
          )}

          {report.missingFromSitemap.length > 0 && (
            <Card>
              <CardContent className="space-y-2 py-4">
                <div className="text-sm font-medium">
                  In the database, missing from the sitemap
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Google can&apos;t discover these until the sitemap refreshes.
                  </span>
                </div>
                <SlugList slugs={report.missingFromSitemap} site={report.siteUrl} />
              </CardContent>
            </Card>
          )}

          {report.broken.length > 0 && (
            <Card>
              <CardContent className="space-y-2 py-4">
                <div className="text-sm font-medium">
                  Live URLs not returning 200
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Probed {report.probedCount} URL{report.probedCount === 1 ? "" : "s"}
                    {report.deep ? " (every game)" : " (dead sitemap entries + a sample)"}.
                  </span>
                </div>
                <div className="space-y-1">
                  {report.broken.slice(0, 20).map((b) => (
                    <div key={b.slug} className="flex items-center gap-2 text-xs">
                      <Badge variant="destructive">{b.status === 0 ? "failed" : b.status}</Badge>
                      <a
                        href={b.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono hover:underline"
                      >
                        /games/{b.slug}
                      </a>
                      <span className="text-muted-foreground">
                        {b.reason === "dead-in-sitemap" ? "listed in sitemap, deleted from DB" : "in DB"}
                      </span>
                    </div>
                  ))}
                  {report.broken.length > 20 && (
                    <div className="text-xs text-muted-foreground">
                      +{report.broken.length - 20} more
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="size-3" />
            {report.siteUrl} · checked {new Date(report.checkedAt).toLocaleTimeString()}
          </p>
        </>
      )}
    </div>
  );
}
