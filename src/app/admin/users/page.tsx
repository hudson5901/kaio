"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  createdAt: string;
  lastLoginAt: string | null;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    password: "",
    role: "member" as "admin" | "member",
  });
  const [editData, setEditData] = useState({
    name: "",
    email: "",
    role: "member" as "admin" | "member",
    password: "",
  });
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ id: string; name: string } | null>(null);

  async function fetchUsers() {
    try {
      const res = await fetch("/api/users");
      if (!res.ok) {
        router.push("/");
        return;
      }
      const data = await res.json();
      setUsers(data);
    } catch {
      setError("ユーザー一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function checkAuth() {
    try {
      const res = await fetch("/api/auth/me");
      const me = await res.json();
      if (me.error || me.role !== "admin") {
        router.push("/");
        return;
      }
      setAuthChecked(true);
      fetchUsers();
    } catch {
      router.push("/");
    }
  }

  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
  useEffect(() => {
    checkAuth();
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setShowForm(false);
      setFormData({ email: "", name: "", password: "", role: "member" });
      fetchUsers();
    } catch {
      setError("ユーザーの作成に失敗しました");
    }
  }

  async function handleUpdate(id: string) {
    setError("");
    setSaving(id);
    try {
      const body: Record<string, string> = {};
      if (editData.name) body.name = editData.name;
      if (editData.email) body.email = editData.email;
      if (editData.role) body.role = editData.role;
      if (editData.password) body.password = editData.password;

      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setEditingId(null);
      fetchUsers();
    } catch {
      setError("ユーザーの更新に失敗しました");
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(id: string) {
    setError("");
    setDeleting(id);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      fetchUsers();
    } catch {
      setError("ユーザーの削除に失敗しました");
    } finally {
      setDeleting(null);
    }
  }

  function startEdit(user: User) {
    setEditingId(user.id);
    setEditData({ name: user.name, email: user.email, role: user.role, password: "" });
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  // 認証確認が終わるまで何も描画しない（非admin にチラ見えさせない）
  if (!authChecked) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground text-sm">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="min-w-0">
          <h1 className="text-[22px] sm:text-xl font-bold tracking-tight">ユーザー管理</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {users.length} ユーザー
          </p>
        </div>
        <Button className="h-11 sm:h-9 px-4 text-[14px] sm:text-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? "キャンセル" : "新規"}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="rounded-xl bg-card border border-border p-4">
          <h2 className="text-sm font-semibold mb-3">新規ユーザー作成</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                名前
              </label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="名前"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                メールアドレス
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="user@example.com"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                パスワード
              </label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                placeholder="パスワード"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                ロール
              </label>
              <select
                value={formData.role}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    role: e.target.value as "admin" | "member",
                  })
                }
                className="w-full h-11 sm:h-9 rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="member">メンバー</option>
                <option value="admin">管理者</option>
              </select>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" className="h-11 sm:h-9 w-full sm:w-auto">作成</Button>
            </div>
          </form>
        </div>
      )}

      {/* User List — MOBILE cards / DESKTOP table */}
      <div className="sm:hidden rounded-xl bg-card border border-border divide-y divide-border overflow-hidden">
        {users.map((user) => {
          const isEditing = editingId === user.id;
          if (isEditing) {
            return (
              <div key={user.id} className="p-3 space-y-2">
                <Input
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  placeholder="名前"
                  className="h-11"
                />
                <Input
                  type="email"
                  value={editData.email}
                  onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                  placeholder="メール"
                  className="h-11"
                />
                <select
                  value={editData.role}
                  onChange={(e) => setEditData({ ...editData, role: e.target.value as "admin" | "member" })}
                  className="w-full h-11 rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="member">メンバー</option>
                  <option value="admin">管理者</option>
                </select>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1 h-11 text-[14px]"
                    onClick={() => handleUpdate(user.id)}
                    disabled={saving === user.id}
                  >
                    {saving === user.id ? "保存中..." : "保存"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 h-11 text-[14px]"
                    onClick={() => setEditingId(null)}
                    disabled={saving === user.id}
                  >
                    取消
                  </Button>
                </div>
              </div>
            );
          }
          return (
            <div key={user.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-medium">{user.name}</span>
                    <span
                      className={`inline-flex items-center px-1.5 py-px rounded text-[10px] font-medium ${
                        user.role === "admin"
                          ? "bg-purple-500/15 text-purple-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {user.role === "admin" ? "管理者" : "メンバー"}
                    </span>
                  </div>
                  <p className="text-[12px] text-muted-foreground truncate mt-0.5">{user.email}</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">{formatDate(user.createdAt)}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-2.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-10 text-[13px]"
                  onClick={() => startEdit(user)}
                >
                  編集
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 h-10 text-[13px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  onClick={() => setConfirmDel({ id: user.id, name: user.name })}
                  disabled={deleting === user.id}
                >
                  {deleting === user.id ? "削除中..." : "削除"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* DESKTOP table */}
      <div className="hidden sm:block rounded-xl bg-card border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
              <th scope="col" className="text-left px-4 py-2.5 font-medium">名前</th>
              <th scope="col" className="text-left px-4 py-2.5 font-medium">メール</th>
              <th scope="col" className="text-left px-4 py-2.5 font-medium">ロール</th>
              <th scope="col" className="text-left px-4 py-2.5 font-medium">作成日</th>
              <th scope="col" className="text-right px-4 py-2.5 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-accent/30 transition-colors">
                {editingId === user.id ? (
                  <>
                    <td className="px-4 py-2.5">
                      <Input
                        value={editData.name}
                        onChange={(e) =>
                          setEditData({ ...editData, name: e.target.value })
                        }
                        className="h-7 text-sm"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <Input
                        type="email"
                        value={editData.email}
                        onChange={(e) =>
                          setEditData({ ...editData, email: e.target.value })
                        }
                        className="h-7 text-sm"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={editData.role}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            role: e.target.value as "admin" | "member",
                          })
                        }
                        className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                      >
                        <option value="member">メンバー</option>
                        <option value="admin">管理者</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleUpdate(user.id)}
                          disabled={saving === user.id}
                          aria-label={`${user.name} を保存`}
                        >
                          {saving === user.id ? "保存中..." : "保存"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setEditingId(null)}
                          disabled={saving === user.id}
                          aria-label={`${user.name} の編集を取消`}
                        >
                          取消
                        </Button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2.5 text-sm font-medium">
                      {user.name}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">
                      {user.email}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center px-1.5 py-px rounded text-[10px] font-medium ${
                          user.role === "admin"
                            ? "bg-purple-500/15 text-purple-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {user.role === "admin" ? "管理者" : "メンバー"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => startEdit(user)}
                          aria-label={`${user.name} を編集`}
                        >
                          編集
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-red-400 hover:text-red-300"
                          onClick={() => setConfirmDel({ id: user.id, name: user.name })}
                          disabled={deleting === user.id}
                          aria-label={`${user.name} を削除`}
                        >
                          {deleting === user.id ? "削除中..." : "削除"}
                        </Button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(o) => { if (!o) setConfirmDel(null); }}
        title="ユーザーを削除"
        description={confirmDel ? `「${confirmDel.name}」を削除します。この操作は取り消せません。` : ""}
        confirmLabel="削除"
        variant="destructive"
        loading={deleting === confirmDel?.id}
        onConfirm={() => { if (confirmDel) handleDelete(confirmDel.id); }}
      />
    </div>
  );
}
