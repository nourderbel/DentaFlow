import { SettingsView } from "@/features/settings/SettingsView";
import { getSession } from "@/server/auth/session";
import { canAccess } from "@/server/auth/access-control";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [canView, canEdit, canViewTeam, canManageTeam] = await Promise.all([
    canAccess(session, { module: "settings", action: "view" }),
    canAccess(session, { module: "settings", action: "edit" }),
    canAccess(session, { module: "team", action: "view" }),
    canAccess(session, { module: "team", action: "edit" }),
  ]);
  if (!canView) redirect("/");

  return <SettingsView canEdit={canEdit} canViewTeam={canViewTeam} canManageTeam={canManageTeam} />;
}
