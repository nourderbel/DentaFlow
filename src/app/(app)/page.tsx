import { HomeView } from "@/features/home/HomeView";
import { getSession } from "@/server/auth/session";
import { getPool } from "@/server/db";

export default async function HomePage() {
  const session = await getSession();
  const rows = session
    ? await getPool().query("SELECT full_name AS fullName FROM users WHERE id = ? AND tenant_id = ? LIMIT 1", [session.userId, session.tenantId])
    : [];
  return <HomeView userName={rows[0]?.fullName ?? "DentaClinic"} />;
}
