import { TeamView } from "@/features/team/TeamView";
import { getSession } from "@/server/auth/session";
import { redirect } from "next/navigation";
import { canAccess } from "@/server/auth/access-control";

export default async function TeamPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await canAccess(session, { module: "team", action: "view" }))) redirect("/");
  return <TeamView />;
}
