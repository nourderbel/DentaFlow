import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/server/audit";
import { getPool } from "@/server/db";
import { HttpError, withAuth, withTransaction, WRITE_ROLES } from "@/server/http";

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(180),
  contact: z.string().trim().max(180).default(""),
  phone: z.string().trim().max(40).default(""),
  email: z.union([z.string().trim().email().max(180), z.literal("")]).default(""),
  specialty: z.string().trim().max(120).default(""),
  address: z.string().trim().max(255).default(""),
});

function toSupplier(row: Record<string, unknown>) {
  const id = Number(row.id);
  return {
    id,
    code: `FOU-${String(id).padStart(6, "0")}`,
    name: String(row.name),
    contact: String(row.contact ?? ""),
    phone: String(row.phone ?? ""),
    email: String(row.email ?? ""),
    specialty: String(row.specialty ?? ""),
    address: String(row.address ?? ""),
  };
}

export const GET = withAuth(async (_request, session) => {
  const rows = await getPool().query(
    `SELECT id, name, contact_name AS contact, phone, email,
            category AS specialty, address
       FROM suppliers
      WHERE tenant_id = ? AND deleted_at IS NULL AND is_active = 1
      ORDER BY name, id`,
    [session.tenantId],
  );
  return NextResponse.json(
    { data: (rows as Array<Record<string, unknown>>).map(toSupplier) },
    { headers: { "Cache-Control": "no-store" } },
  );
});

export const POST = withAuth(
  async (request, session) => {
    const parsed = supplierSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Fournisseur invalide.");
    const supplier = await withTransaction(async (connection) => {
      const existing = await connection.query(
        `SELECT id FROM suppliers
          WHERE tenant_id = ? AND deleted_at IS NULL AND LOWER(name) = LOWER(?)
          LIMIT 1`,
        [session.tenantId, parsed.data.name],
      );
      if (existing.length > 0) throw new HttpError(409, "Un fournisseur portant ce nom existe déjà.");

      const result = await connection.query(
        `INSERT INTO suppliers
          (tenant_id, name, contact_name, phone, email, address, category)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [session.tenantId, parsed.data.name, parsed.data.contact || null, parsed.data.phone || null,
          parsed.data.email || null, parsed.data.address || null, parsed.data.specialty || null],
      );
      await audit(connection, session.tenantId, session.userId, "CREATE", "supplier", result.insertId, {
        name: parsed.data.name,
      });
      return toSupplier({
        id: result.insertId,
        name: parsed.data.name,
        contact: parsed.data.contact,
        phone: parsed.data.phone,
        email: parsed.data.email,
        specialty: parsed.data.specialty,
        address: parsed.data.address,
      });
    });
    return NextResponse.json({ data: supplier }, { status: 201, headers: { "Cache-Control": "no-store" } });
  },
  { roles: WRITE_ROLES },
);
