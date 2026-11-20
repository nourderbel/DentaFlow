"use client";

import { useCallback, useEffect, useState } from "react";

export type NotificationCategory = "agenda" | "stock" | "laboratory";

export type NotificationItem = {
  key: string;
  category: NotificationCategory;
  title: string;
  description: string;
  context: string;
  href: string;
  date: string;
  read: boolean;
  active: boolean;
};

export function notificationTitle(item: NotificationItem, locale: "fr" | "ar") {
  if (locale === "fr") return item.title;
  const titles: Record<NotificationCategory, string> = {
    agenda: "موعد بانتظار التأكيد",
    stock: "تم بلوغ الحد الأدنى للمخزون",
    laboratory: "طلب مخبري بحاجة إلى متابعة",
  };
  return titles[item.category];
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store", signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Impossible de charger les notifications.");
      if (!signal?.aborted) {
        setNotifications(body.data as NotificationItem[]);
        setError("");
      }
    } catch (reason) {
      if (signal?.aborted) return;
      setError(reason instanceof Error ? reason.message : "Impossible de charger les notifications.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initialRefresh = window.setTimeout(() => void refresh(controller.signal), 0);

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      controller.abort();
      window.clearTimeout(initialRefresh);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  const markRead = useCallback(async (keys: string[]) => {
    const unreadKeys = [...new Set(keys)].filter((key) => notifications.some((item) => item.key === key && !item.read));
    if (unreadKeys.length === 0) return true;
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: unreadKeys }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Impossible de marquer les notifications comme lues.");
      setNotifications((current) => current.map((item) => unreadKeys.includes(item.key) ? { ...item, read: true } : item));
      setError("");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible de marquer les notifications comme lues.");
      return false;
    }
  }, [notifications]);

  return {
    notifications,
    loading,
    error,
    refresh: () => refresh(),
    markRead,
    unreadCount: notifications.reduce((count, item) => count + Number(!item.read), 0),
  };
}
