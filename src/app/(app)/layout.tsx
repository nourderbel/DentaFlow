import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { getPool } from "@/server/db";
import { AppShell } from "@/components/layout/AppShell";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  DENTIST: "Dentiste",
  SECRETARY: "Secrétaire",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const rows = await getPool().query(
    "SELECT full_name, role FROM users WHERE id = ? AND tenant_id = ? AND is_active = 1 AND deleted_at IS NULL",
    [session.userId, session.tenantId],
  );
  if (!rows[0]) redirect("/login"); // compte supprimé ou désactivé depuis la création du cookie

  return (
    <AppShell userName={rows[0].full_name} role={ROLE_LABELS[rows[0].role] ?? rows[0].role} roleCode={rows[0].role}>
      {children}
    </AppShell>
  );
}