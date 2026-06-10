"use client";

import { TasksSection } from "@/components/tasks-section";

export default function TasksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">タスク管理</h1>
        <p className="text-[13px] text-muted-foreground mt-1">チームのタスクを管理・追跡</p>
      </div>
      <TasksSection />
    </div>
  );
}
