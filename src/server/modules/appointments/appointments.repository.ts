import type { PoolConnection } from "mariadb";
import { getPool } from "@/server/db";
import type { AppointmentInput, RescheduleInput } from "./appointments.schema";

export async function listAppointments(tenantId: number, from: string, to: string) {
  return getPool().query(
    `SELECT a.id, a.appointment_number AS appointmentNumber, a.patient_id AS patientId,
            CONCAT(p.first_name, ' ', p.last_name) AS patientName,
            p.first_name AS patientFirstName, p.last_name AS patientLastName, p.phone AS patientPhone,
            a.dentist_id AS dentistId, u.full_name AS dentistName, a.chair_id AS chairId,
            a.appointment_date AS date, TIME_FORMAT(a.start_time, '%H:%i') AS time,
            a.duration_minutes AS durationMinutes, a.appointment_type AS type, a.status, a.notes
       FROM appointments a
       INNER JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
       INNER JOIN users u ON u.id = a.dentist_id AND u.tenant_id = a.tenant_id
      WHERE a.tenant_id = ? AND a.deleted_at IS NULL AND a.appointment_date BETWEEN ? AND ?
      ORDER BY a.appointment_date, a.start_time
      LIMIT 1500`,
    [tenantId, from, to],
  );
}

export async function listPractitioners(tenantId: number) {
  return getPool().query(
    `SELECT id, full_name AS name, role FROM users
      WHERE tenant_id = ? AND is_active = 1 AND deleted_at IS NULL AND role IN ('DENTIST', 'ADMIN')
      ORDER BY full_name`,
    [tenantId],
  );
}

export async function patientExists(connection: PoolConnection, tenantId: number, id: number) {
  const rows = await connection.query(
    "SELECT id FROM patients WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL", [id, tenantId],
  );
  return rows.length > 0;
}

export async function practitionerExists(connection: PoolConnection, tenantId: number, id: number) {
  const rows = await connection.query(
    "SELECT id FROM users WHERE id = ? AND tenant_id = ? AND is_active = 1 AND deleted_at IS NULL", [id, tenantId],
  );
  return rows.length > 0;
}

/** Verrouille la journée : deux réservations du même jour sont traitées l'une après l'autre. */
export async function lockDay(connection: PoolConnection, tenantId: number, date: string) {
  await connection.query(
    "INSERT IGNORE INTO appointment_day_locks (tenant_id, appointment_date) VALUES (?, ?)", [tenantId, date],
  );
  await connection.query(
    "SELECT tenant_id FROM appointment_day_locks WHERE tenant_id = ? AND appointment_date = ? FOR UPDATE",
    [tenantId, date],
  );
}

/** Cherche un rendez-vous qui chevauche le créneau, pour le même praticien OU le même fauteuil. */
export async function findConflict(
  connection: PoolConnection,
  tenantId: number,
  a: Pick<AppointmentInput, "date" | "time" | "dentistId" | "chairId" | "durationMinutes">,
  excludeId?: number,
) {
  const rows = await connection.query(
    `SELECT appointment_number AS appointmentNumber, TIME_FORMAT(start_time, '%H:%i') AS time
       FROM appointments
      WHERE tenant_id = ? AND appointment_date = ? AND deleted_at IS NULL
        AND status NOT IN ('CANCELLED', 'NO_SHOW')
        AND (? IS NULL OR id <> ?)
        AND (dentist_id = ? OR chair_id = ?)
        AND start_time < ADDTIME(?, SEC_TO_TIME(? * 60))
        AND ADDTIME(start_time, SEC_TO_TIME(duration_minutes * 60)) > ?
      LIMIT 1`,
    [tenantId, a.date, excludeId ?? null, excludeId ?? null, a.dentistId, a.chairId, a.time, a.durationMinutes, a.time],
  );
  return rows[0] ?? null;
}

export async function insertAppointment(
  connection: PoolConnection, tenantId: number, userId: number, number: string, a: AppointmentInput,
): Promise<number> {
  const result = await connection.query(
    `INSERT INTO appointments (tenant_id, appointment_number, patient_id, dentist_id, chair_id, appointment_date,
       start_time, duration_minutes, appointment_type, status, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, number, a.patientId, a.dentistId, a.chairId, a.date, a.time, a.durationMinutes, a.type, a.status, a.notes, userId],
  );
  return result.insertId;
}

export async function updateStatus(connection: PoolConnection, tenantId: number, id: number, status: string) {
  const result = await connection.query(
    "UPDATE appointments SET status = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
    [status, id, tenantId],
  );
  return result.affectedRows > 0;
}

export async function findAppointmentForReschedule(connection: PoolConnection, tenantId: number, id: number) {
  const rows = await connection.query(
    `SELECT appointment_date AS date, TIME_FORMAT(start_time, '%H:%i') AS time,
            dentist_id AS dentistId, chair_id AS chairId, duration_minutes AS durationMinutes
       FROM appointments
      WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [id, tenantId],
  );
  return rows[0] ?? null;
}

export async function updateSchedule(
  connection: PoolConnection,
  tenantId: number,
  id: number,
  input: RescheduleInput,
) {
  const result = await connection.query(
    "UPDATE appointments SET appointment_date = ?, start_time = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
    [input.date, input.time, id, tenantId],
  );
  return result.affectedRows > 0;
}

export async function updateAppointment(
  connection: PoolConnection,
  tenantId: number,
  id: number,
  input: Omit<AppointmentInput, "status">,
) {
  const result = await connection.query(
    `UPDATE appointments
        SET patient_id = ?, dentist_id = ?, chair_id = ?, appointment_date = ?,
            start_time = ?, duration_minutes = ?, appointment_type = ?, notes = ?
      WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [
      input.patientId,
      input.dentistId,
      input.chairId,
      input.date,
      input.time,
      input.durationMinutes,
      input.type,
      input.notes,
      id,
      tenantId,
    ],
  );
  return result.affectedRows > 0;
}

export async function listRescheduleHistory(
  tenantId: number,
  appointmentId: number,
) {
  return getPool().query(
    `SELECT al.id, al.metadata, al.created_at AS createdAt,
            COALESCE(u.full_name, 'Utilisateur supprimé') AS userName
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id AND u.tenant_id = al.tenant_id
      WHERE al.tenant_id = ? AND al.resource = 'appointment'
        AND al.resource_id = ? AND al.action = 'RESCHEDULE'
      ORDER BY al.created_at DESC
      LIMIT 100`,
    [tenantId, String(appointmentId)],
  );
}

export async function cancelAppointment(connection: PoolConnection, tenantId: number, id: number) {
  const result = await connection.query(
    "UPDATE appointments SET status = 'CANCELLED', deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
    [id, tenantId],
  );
  return result.affectedRows > 0;
}