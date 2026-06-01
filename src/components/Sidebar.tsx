"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Gamepad2,
  Upload,
  ImageOff,
  Tags,
  LogOut,
  Ghost,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/import", label: "Add Games", icon: Upload },
  { href: "/health", label: "Needs Attention", icon: ImageOff },
  { href: "/categories", label: "Categories", icon: Tags },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className={cn("flex items-center gap-2 px-3 py-5", collapsed ? "justify-center" : "px-5")}>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          <Ghost className="size-5" />
        </span>
        {!collapsed && (
          <div className="flex-1 leading-tight">
            <div className="text-sm font-semibold">ActionGames</div>
            <div className="text-xs text-muted-foreground">Admin · local</div>
          </div>
        )}
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            title="Collapse sidebar"
            onClick={() => setCollapsed(true)}
          >
            <PanelLeftClose className="size-4" />
          </Button>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center px-3 pb-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            title="Expand sidebar"
            onClick={() => setCollapsed(false)}
          >
            <PanelLeftOpen className="size-4" />
          </Button>
        </div>
      )}

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <Button
          variant="ghost"
          size="sm"
          className={cn("w-full text-muted-foreground", collapsed ? "justify-center px-0" : "justify-start")}
          title={collapsed ? "Log out" : undefined}
          onClick={logout}
        >
          <LogOut className="size-4 shrink-0" /> {!collapsed && "Log out"}
        </Button>
      </div>
    </aside>
  );
}
