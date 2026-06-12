"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  // SSR / 初回ハイドレーション時はアイコン非表示にして FOUC を防ぐ。
  // documentElement のクラスは layout.tsx の inline script が既に適用しているので
  // それを唯一の真値として読み取る。
  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(true);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggle() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("kaio-theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  }

  const labelText = dark ? "ライトモードに切替" : "ダークモードに切替";

  return (
    <button
      onClick={toggle}
      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      title={labelText}
      aria-label={labelText}
      aria-pressed={dark}
    >
      {/* 未マウント時はアイコンを描画しない (固定サイズで枠だけ確保) */}
      {!mounted ? (
        <span className="w-4 h-4 block" aria-hidden />
      ) : dark ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      )}
    </button>
  );
}
