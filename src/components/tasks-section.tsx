"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  assigneeId: string | null;
  itemId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  assignee: { id: string; name: string } | null;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

const STATUS_CONFIG = {
  pending: {
    label: "未着手",
    className:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  in_progress: {
    label: "進行中",
    className:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  done: {
    label: "完了",
    className:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
} as const;

const PRIORITY_CONFIG = {
  high: { label: "高", dotClass: "bg-rose-500" },
  medium: { label: "中", dotClass: "bg-amber-500" },
  low: { label: "低", dotClass: "bg-gray-400" },
} as const;

const NEXT_STATUS: Record<Task["status"], Task["status"]> = {
  pending: "in_progress",
  in_progress: "done",
  done: "pending",
};

export function TasksSection() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriority, setFormPriority] = useState<"low" | "medium" | "high">(
    "medium"
  );
  const [formAssigneeId, setFormAssigneeId] = useState("");

  // Filter state
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const fetchTasks = useCallback(async () => {
    try {
      const url =
        filterStatus === "all"
          ? "/api/tasks"
          : `/api/tasks?status=${filterStatus}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data);
      }
    } catch (err) {
      console.error("Failed to fetch current user:", err);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchUsers();
    fetchCurrentUser();
  }, [fetchTasks, fetchUsers, fetchCurrentUser]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !currentUser || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          priority: formPriority,
          assigneeId: formAssigneeId || undefined,
          createdBy: currentUser.id,
        }),
      });

      if (res.ok) {
        setFormTitle("");
        setFormDescription("");
        setFormPriority("medium");
        setFormAssigneeId("");
        setShowForm(false);
        await fetchTasks();
      }
    } catch (err) {
      console.error("Failed to create task:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusToggle = async (task: Task) => {
    const nextStatus = NEXT_STATUS[task.status];
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        await fetchTasks();
      }
    } catch (err) {
      console.error("Failed to update task:", err);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm("このタスクを削除しますか?")) return;

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchTasks();
      }
    } catch (err) {
      console.error("Failed to delete task:", err);
    }
  };

  const taskCounts = {
    all: tasks.length,
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">タスク</h2>
          <span className="text-[12px] text-muted-foreground/60">
            {tasks.length}
          </span>
        </div>

        <Button
          size="sm"
          variant={showForm ? "ghost" : "outline"}
          className="h-7 text-[12px]"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? (
            "キャンセル"
          ) : (
            <span className="flex items-center gap-1">
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              新規タスク
            </span>
          )}
        </Button>
      </div>

      {/* Filters - Notion-style tab pills */}
      <div className="flex gap-1 mb-3">
        {(
          [
            { key: "all", label: "すべて" },
            { key: "pending", label: "未着手" },
            { key: "in_progress", label: "進行中" },
            { key: "done", label: "完了" },
          ] as const
        ).map((filter) => (
          <button
            key={filter.key}
            onClick={() => {
              setFilterStatus(filter.key);
              setLoading(true);
            }}
            className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${
              filterStatus === filter.key
                ? "bg-accent text-foreground"
                : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/50"
            }`}
          >
            {filter.label}
            <span className="ml-1 text-[10px] opacity-50">
              {taskCounts[filter.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-3 p-3 border border-border/60 rounded-lg bg-accent/20">
          <form onSubmit={handleCreateTask} className="space-y-2.5">
            <Input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="タスクタイトル"
              className="text-[13px] h-8 border-border/50"
            />
            <Textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="説明（任意）"
              className="min-h-[40px] resize-none text-[13px] border-border/50"
            />
            <div className="flex gap-2 flex-wrap">
              {/* Priority */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">優先度:</span>
                <div className="flex gap-0.5">
                  {(["low", "medium", "high"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFormPriority(p)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        formPriority === p
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/50"
                      }`}
                    >
                      {PRIORITY_CONFIG[p].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assignee */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">担当者:</span>
                <select
                  value={formAssigneeId}
                  onChange={(e) => setFormAssigneeId(e.target.value)}
                  className="h-6 rounded border border-border/50 bg-transparent px-1.5 text-[11px] outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
                >
                  <option value="">未割当</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                className="h-7 text-[12px]"
                disabled={!formTitle.trim() || submitting}
              >
                {submitting ? "作成中..." : "タスク作成"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Task list - clean, Notion-like */}
      <div className="border border-border/60 rounded-lg overflow-hidden">
        {loading ? (
          <div className="px-4 py-8 text-center text-[12px] text-muted-foreground/60">
            読み込み中...
          </div>
        ) : tasks.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-muted-foreground/60">
            {filterStatus === "all"
              ? "タスクはまだありません"
              : "該当するタスクはありません"}
          </div>
        ) : (
          tasks.map((task, index) => (
            <div
              key={task.id}
              className={`px-4 py-2.5 hover:bg-accent/40 transition-colors group ${
                index > 0 ? "border-t border-border/30" : ""
              }`}
            >
              <div className="flex items-start gap-2.5">
                {/* Status toggle / checkbox-like */}
                <button
                  onClick={() => handleStatusToggle(task)}
                  className="mt-0.5 shrink-0"
                  title={`ステータス変更: ${STATUS_CONFIG[NEXT_STATUS[task.status]].label}`}
                >
                  {task.status === "done" ? (
                    <svg
                      className="w-4 h-4 text-emerald-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      />
                    </svg>
                  ) : task.status === "in_progress" ? (
                    <svg
                      className="w-4 h-4 text-blue-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4 text-muted-foreground/30 hover:text-muted-foreground/60"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Priority dot */}
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_CONFIG[task.priority].dotClass}`}
                      title={`優先度: ${PRIORITY_CONFIG[task.priority].label}`}
                    />

                    {/* Title */}
                    <span
                      className={`text-[13px] font-medium truncate ${
                        task.status === "done"
                          ? "line-through text-muted-foreground/60"
                          : ""
                      }`}
                    >
                      {task.title}
                    </span>

                    {/* Status badge */}
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 h-[18px] leading-none border-0 ${STATUS_CONFIG[task.status].className}`}
                    >
                      {STATUS_CONFIG[task.status].label}
                    </Badge>
                  </div>

                  {/* Description */}
                  {task.description && (
                    <p className="text-[12px] text-muted-foreground/70 mt-0.5 truncate">
                      {task.description}
                    </p>
                  )}

                  {/* Meta */}
                  <div className="flex items-center gap-2.5 mt-0.5">
                    {task.assignee && (
                      <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                          />
                        </svg>
                        {task.assignee.name}
                      </span>
                    )}

                    {task.itemId && (
                      <a
                        href={`/items/${task.itemId}`}
                        className="text-[11px] text-muted-foreground/50 hover:text-foreground flex items-center gap-1 transition-colors"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                          />
                        </svg>
                        アイテム
                      </a>
                    )}
                  </div>
                </div>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(task.id)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive"
                  title="削除"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
