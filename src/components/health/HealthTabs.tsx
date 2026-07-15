"use client";
import { ImageOff, Globe } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HealthClient } from "./HealthClient";
import { LiveSiteClient } from "./LiveSiteClient";

/* Two halves of "is the site healthy?":
 *   Data     — are the rows in Supabase any good? (images, required fields)
 *   Live site — does the public site actually serve them? (sitemap, 404s)
 * A game can pass the first and still fail the second. */
export function HealthTabs() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Health</h1>
        <p className="text-sm text-muted-foreground">
          Data problems in the catalog, and drift between the database and the live site.
        </p>
      </div>

      <Tabs defaultValue="data">
        <TabsList>
          <TabsTrigger value="data">
            <ImageOff className="size-4" /> Needs Attention
          </TabsTrigger>
          <TabsTrigger value="live">
            <Globe className="size-4" /> Live Site
          </TabsTrigger>
        </TabsList>
        <TabsContent value="data">
          <HealthClient />
        </TabsContent>
        <TabsContent value="live">
          <LiveSiteClient />
        </TabsContent>
      </Tabs>
    </div>
  );
}
