"use client";

import React, { useEffect, useMemo, useState } from "react";
import { auth, database } from "@/lib/firebase";
import { ref as dbRef, onValue } from "firebase/database";

type UserRow = {
  id: string;
  name: string;
  email: string;
  status?: string;
};

type Filter = "all" | "active" | "pending_approval" | "rejected";

export default function AdminNotificationsPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"email" | "notification">("email");

  // Email fields
  const [subject, setSubject] = useState("");
  const [htmlContent, setHtmlContent] = useState("<p>Hello,</p><p>…</p>");

  // In-app fields
  const [notifTitle, setNotifTitle] = useState("Important update");
  const [notifBody, setNotifBody] = useState("Your message goes here.");

  const [sending, setSending] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  // Load users
  useEffect(() => {
    const uref = dbRef(database, "users");
    const unsub = onValue(uref, (snap) => {
      const v = (snap.val() || {}) as Record<string, any>;
      const list: UserRow[] = Object.entries(v).map(([id, u]) => ({
        id,
        name: String(u?.name || "-"),
        email: String(u?.email || ""),
        status: String(u?.status || ""),
      }));
      setUsers(list);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== "all" && (u.status || "").toLowerCase() !== filter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.status || "").toLowerCase().includes(q)
      );
    });
  }, [users, query, filter]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filtered.map((u) => u.id)));
  };
  const clearSelection = () => setSelectedIds(new Set());

  const sendEmail = async () => {
    if (!subject.trim() || !htmlContent.trim()) {
      setResultMsg("Subject and content are required for email.");
      return;
    }
    setSending(true);
    setResultMsg(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Admin not authenticated.");
      const toAll = selectedIds.size === 0; // no selection -> broadcast to all
      const res = await fetch("/api/admin/broadcast-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          toAll,
          userIds: Array.from(selectedIds),
          subject,
          htmlContent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to send emails");
      setResultMsg(`Sent email to ${data.sent || 0} users (skipped ${data.skipped || 0}).`);
    } catch (e: any) {
      setResultMsg(e?.message || "Failed to send emails.");
    } finally {
      setSending(false);
    }
  };

  const sendInApp = async () => {
    if (!notifTitle.trim() || !notifBody.trim()) {
      setResultMsg("Title and message are required for notifications.");
      return;
    }
    setSending(true);
    setResultMsg(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Admin not authenticated.");
      const toAll = selectedIds.size === 0;
      const res = await fetch("/api/admin/broadcast-notification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          toAll,
          userIds: Array.from(selectedIds),
          title: notifTitle,
          message: notifBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create notifications");
      setResultMsg(`Created notifications for ${data.written || 0} users.`);
    } catch (e: any) {
      setResultMsg(e?.message || "Failed to create notifications.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Notifications & Email</h1>
        <p className="text-slate-600 mt-1">Send messages to registered users</p>
      </header>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search by name, email, status"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full sm:w-80 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="all">All</option>
            <option value="active">active</option>
            <option value="pending_approval">pending_approval</option>
            <option value="rejected">rejected</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={selectAllFiltered} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Select All ({filtered.length})
          </button>
          <button onClick={clearSelection} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Clear
          </button>
        </div>
      </div>

      {/* Users table */}
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm mb-6">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Select</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-500">No users match your filters.</td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(u.id)}
                        onChange={() => toggleSelect(u.id)}
                        className="h-4 w-4 rounded text-sky-600 focus:ring-sky-500"
                      />
                    </td>
                    <td className="px-4 py-2">{u.name}</td>
                    <td className="px-4 py-2">{u.email || "-"}</td>
                    <td className="px-4 py-2 text-slate-600">{u.status || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-xs text-slate-500">
          Selected: <span className="font-semibold text-slate-700">{selectedIds.size}</span> {selectedIds.size === 0 ? "(sending to all users)" : ""}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setTab("email")}
          className={`rounded-md px-3 py-2 text-sm font-semibold ${tab === "email" ? "bg-sky-600 text-white" : "bg-white border border-slate-300 text-slate-700"}`}
        >
          Email
        </button>
        <button
          onClick={() => setTab("notification")}
          className={`rounded-md px-3 py-2 text-sm font-semibold ${tab === "notification" ? "bg-sky-600 text-white" : "bg-white border border-slate-300 text-slate-700"}`}
        >
          In‑app Notification
        </button>
      </div>

      {tab === "email" ? (
        <section className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="grid gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="Subject"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">HTML Content</label>
              <textarea
                rows={8}
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                Tip: You can include simple HTML like &lt;p&gt; and &lt;strong&gt;. For bulk sends, we’ll batch on the server.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={sendEmail}
                disabled={sending}
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:bg-sky-400"
              >
                {sending ? "Sending…" : selectedIds.size === 0 ? "Send to All" : `Send to ${selectedIds.size} Selected`}
              </button>
              {resultMsg && <span className="text-sm text-slate-600">{resultMsg}</span>}
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="grid gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
              <input
                type="text"
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="Important update"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
              <textarea
                rows={5}
                value={notifBody}
                onChange={(e) => setNotifBody(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="Write a short message"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={sendInApp}
                disabled={sending}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-400"
              >
                {sending ? "Sending…" : selectedIds.size === 0 ? "Notify All" : `Notify ${selectedIds.size} Selected`}
              </button>
              {resultMsg && <span className="text-sm text-slate-600">{resultMsg}</span>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}