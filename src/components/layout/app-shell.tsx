"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "./sidebar";
import { MobileBottomNav } from "./mobile-bottom-nav";

const pageTitles: Record<string, string> = {
  "/": "ダッシュボード",
  "/items": "アイテム管理",
  "/tasks": "タスク管理",
  "/notifications": "通知",
  "/ebay-listing": "eBay出品",
  "/inventory": "在庫管理",
  "/scrape": "スクレイピング",
  "/settings": "設定",
  "/admin/users": "ユーザー管理",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  // モバイル(lg未満)では初期 collapsed=true、デスクトップでは保存された値に従う
  const [collapsed, setCollapsed] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
    if (isMobile) {
      setCollapsed(true);
      return;
    }
    const saved = localStorage.getItem("sidebar-collapsed");
    setCollapsed(saved === "true");
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // モバイルでナビゲーションしたら自動で閉じる (lg未満 かつ 開いてる時)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.matchMedia("(max-width: 1023px)").matches;
    if (isMobile && !collapsed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(true);
    }
    // pathname変化のみで発火させたいので collapsed は依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Esc キーでサイドバーを閉じる
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !collapsed) setCollapsed(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed]);

  // 未読通知数をポーリング（タブ非表示時は停止）
  useEffect(() => {
    function fetchUnread() {
      if (document.hidden) return;
      fetch("/api/notifications?unread=true&limit=100")
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setUnreadCount(data.length); })
        .catch(() => {});
    }
    fetchUnread();
    const iv = setInterval(fetchUnread, 30000);
    document.addEventListener("visibilitychange", fetchUnread);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", fetchUnread); };
  }, []);

  function toggleSidebar() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }

  if (isLoginPage) {
    return <div className="flex-1 w-full">{children}</div>;
  }

  // ページタイトル判定
  const pageTitle =
    pageTitles[pathname] ||
    (pathname.startsWith("/items/") ? "アイテム詳細" : "Kaio");

  return (
    <>
      {/* Mobile overlay backdrop */}
      {!collapsed && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={toggleSidebar}
        />
      )}
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <div className={`flex-1 min-h-screen transition-all duration-200 ${collapsed ? "lg:ml-14 ml-0" : "lg:ml-60 ml-0"}`}>
        {/* Fixed Header */}
        <header className="sticky top-0 z-20 h-14 lg:h-12 border-b border-border/50 bg-background/80 backdrop-blur-md flex items-center justify-between px-3 sm:px-10">
          <div className="flex items-center gap-2 min-w-0">
            {/* Mobile hamburger — 44px tap area */}
            <button
              onClick={toggleSidebar}
              aria-label={collapsed ? "メニューを開く" : "メニューを閉じる"}
              aria-expanded={!collapsed}
              className="lg:hidden w-11 h-11 -ml-2 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <h2 className="text-[14px] lg:text-[13px] font-semibold tracking-tight truncate">{pageTitle}</h2>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Notifications bell */}
            <Link
              href="/notifications"
              className="relative w-11 h-11 lg:w-8 lg:h-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="通知"
              aria-label={unreadCount > 0 ? `通知 (未読 ${unreadCount}件)` : "通知"}
            >
              <svg className="w-5 h-5 lg:w-4 lg:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 lg:-top-0.5 lg:-right-0.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1" aria-hidden>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
            {/* Settings */}
            <Link
              href="/settings"
              className="w-11 h-11 lg:w-8 lg:h-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="設定"
              aria-label="設定"
            >
              <svg className="w-5 h-5 lg:w-4 lg:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </Link>
          </div>
        </header>
        <main>
          <div className="px-3 sm:px-10 py-3 max-w-[1200px] animate-fade-in has-mobile-bottom-nav">{children}</div>
        </main>
      </div>
      {/* Mobile bottom navigation (<lg) */}
      <MobileBottomNav unreadCount={unreadCount} />
    </>
  );
}
