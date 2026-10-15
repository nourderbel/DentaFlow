"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    if (response.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    const data = await response.json().catch(() => null);
    setError(data?.error ?? "Connexion impossible.");
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-xl border border-line bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-ink">
          Denta<span className="text-accent">Flow</span>
        </h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">{t("auth.subtitle")}</p>

        <label className="mb-1 block text-sm font-medium text-slate-600" htmlFor="email">{t("auth.email")}</label>
        <input id="email" name="email" type="email" required autoComplete="email"
          className="mb-4 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent" />

        <label className="mb-1 block text-sm font-medium text-slate-600" htmlFor="password">{t("auth.password")}</label>
        <input id="password" name="password" type="password" required autoComplete="current-password"
          className="mb-4 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent" />

        {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? t("auth.loggingIn") : t("auth.login")}
        </Button>
      </form>
    </main>
  );
}