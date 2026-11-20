import { NextResponse } from "next/server";
import { withAuth } from "@/server/http";
import { getPool } from "@/server/db";

export const GET = withAuth(async (_request, session) => {
  const rows = await getPool().query(
    `SELECT COALESCE(NULLIF(c.name, ''), t.name, 'DentaClinic') AS name,
            c.address, c.city, c.governorate, c.phone, c.email
       FROM tenants t
       LEFT JOIN clinics c ON c.id = (
         SELECT primary_clinic.id
           FROM clinics primary_clinic
          WHERE primary_clinic.tenant_id = t.id
            AND primary_clinic.is_active = 1
            AND primary_clinic.deleted_at IS NULL
          ORDER BY primary_clinic.is_primary DESC, primary_clinic.id
          LIMIT 1
       )
      WHERE t.id = ?
      LIMIT 1`,
    [session.tenantId],
  );
  const clinic = rows[0] as {
    name: string;
    address: string | null;
    city: string | null;
    governorate: string | null;
    phone: string | null;
    email: string | null;
  } | undefined;
  if (!clinic) throw new Error("Informations du cabinet introuvables pour ce compte.");

  return NextResponse.json({
    data: {
      name: clinic.name,
      address: clinic.address ?? "",
      city: clinic.city ?? "",
      governorate: clinic.governorate ?? "",
      phone: clinic.phone ?? "",
      email: clinic.email ?? "",
    },
  }, { headers: { "Cache-Control": "no-store" } });
});
