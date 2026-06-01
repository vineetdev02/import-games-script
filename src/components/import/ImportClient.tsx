"use client";
import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { JsonImport } from "./JsonImport";
import { ManualAddForm } from "./ManualAddForm";
import { api, type Category } from "@/lib/client/api";

export function ImportClient() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [bannerReady, setBannerReady] = useState(true);

  useEffect(() => {
    api<{ categories: Category[] }>("/api/categories").then((d) => setCategories(d.categories)).catch(() => {});
    api<{ bannerColumnReady: boolean }>("/api/stats").then((d) => setBannerReady(d.bannerColumnReady)).catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Add Games</h1>
        <p className="text-sm text-muted-foreground">Bulk-import provider JSON or add a single game by hand.</p>
      </div>

      <Tabs defaultValue="json">
        <TabsList>
          <TabsTrigger value="json">JSON Import</TabsTrigger>
          <TabsTrigger value="manual">Manual Add</TabsTrigger>
        </TabsList>
        <TabsContent value="json"><JsonImport categories={categories} bannerReady={bannerReady} /></TabsContent>
        <TabsContent value="manual"><ManualAddForm categories={categories} bannerReady={bannerReady} /></TabsContent>
      </Tabs>
    </div>
  );
}
