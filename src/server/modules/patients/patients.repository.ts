import type { PoolConnection } from "mariadb";
import { getPool } from "@/server/db";
import type { PatientInput } from "./patients.schema";

const LIST_COLUMNS = `id, patient_number AS patientNumber, first_name AS firstName, last_name AS lastName,
  date_of_birth AS dateOfBirth, sex, national_id AS nationalId, phone, whatsapp, email, city, governorate,
  allergies, chronic_conditions AS chronicConditions, last_visit AS lastVisit`;

export async function listPatients(tenantId: number, search: string, archived = false) {
  const like = `%${search}%`;
  return getPool().query(
    `SELECT ${LIST_COLUMNS}, patients.deleted_at AS archivedAt,
            COALESCE(treatment_balance.balance, patients.balance_tnd) AS balance
       FROM patients
       LEFT JOIN (
         SELECT t.tenant_id, t.patient_id,
                SUM(GREATEST(COALESCE(f.total_agreed, t.amount, 0) - COALESCE(payments.total_paid, 0), 0)) AS balance
           FROM patient_treatments t
           LEFT JOIN treatment_finances f ON f.tenant_id = t.tenant_id
             AND f.patient_id = t.patient_id AND f.treatment_id = t.id
           LEFT JOIN (
             SELECT tenant_id, patient_id, treatment_id, SUM(amount) AS total_paid
               FROM treatment_payments
              WHERE tenant_id = ?
              GROUP BY tenant_id, patient_id, treatment_id
           ) payments ON payments.tenant_id = t.tenant_id
             AND payments.patient_id = t.patient_id AND payments.treatment_id = t.id
          WHERE t.tenant_id = ?
          GROUP BY t.tenant_id, t.patient_id
       ) treatment_balance ON treatment_balance.tenant_id = patients.tenant_id
         AND treatment_balance.patient_id = patients.id
      WHERE patients.tenant_id = ? AND patients.deleted_at IS ${archived ? "NOT NULL" : "NULL"}
        AND (? = '' OR patients.patient_number LIKE ? OR patients.first_name LIKE ? OR patients.last_name LIKE ?
          OR CONCAT(patients.first_name, ' ', patients.last_name) LIKE ? OR CONCAT(patients.last_name, ' ', patients.first_name) LIKE ?
          OR patients.phone LIKE ? OR patients.whatsapp LIKE ? OR patients.national_id LIKE ?)
      ORDER BY patients.created_at DESC, patients.id DESC LIMIT 500`,
    [tenantId, tenantId, tenantId, search, like, like, like, like, like, like, like, like],
  );
}

export async function listReceivables(tenantId: number) {
  return getPool().query(
    `WITH treatment_balance AS (
       SELECT t.tenant_id, t.patient_id,
              SUM(GREATEST(COALESCE(f.total_agreed, t.amount, 0) - COALESCE(payments.total_paid, 0), 0)) AS balance
         FROM patient_treatments t
         LEFT JOIN treatment_finances f ON f.tenant_id = t.tenant_id
           AND f.patient_id = t.patient_id AND f.treatment_id = t.id
         LEFT JOIN (
           SELECT tenant_id, patient_id, treatment_id, SUM(amount) AS total_paid
             FROM treatment_payments
            WHERE tenant_id = ?
            GROUP BY tenant_id, patient_id, treatment_id
         ) payments ON payments.tenant_id = t.tenant_id
           AND payments.patient_id = t.patient_id AND payments.treatment_id = t.id
        WHERE t.tenant_id = ?
        GROUP BY t.tenant_id, t.patient_id
     ), debtors AS (
       SELECT patients.id, patients.patient_number AS patientNumber,
              patients.first_name AS firstName, patients.last_name AS lastName,
              treatment_balance.balance AS balance
         FROM patients
         LEFT JOIN treatment_balance ON treatment_balance.tenant_id = patients.tenant_id
           AND treatment_balance.patient_id = patients.id
        WHERE patients.tenant_id = ? AND patients.deleted_at IS NULL
          AND treatment_balance.balance > 0
     )
     SELECT id, patientNumber, firstName, lastName, balance,
            SUM(balance) OVER () AS totalReceivable,
            COUNT(*) OVER () AS debtorCount
       FROM debtors
      ORDER BY balance DESC, lastName, firstName
      LIMIT 6`,
    [tenantId, tenantId, tenantId],
  );
}

export async function countActivePatients(tenantId: number) {
  const rows = await getPool().query(
    "SELECT COUNT(*) AS total FROM patients WHERE tenant_id = ? AND deleted_at IS NULL",
    [tenantId],
  );
  return Number(rows[0]?.total ?? 0);
}

export async function findPatient(tenantId: number, id: number) {
  const rows = await getPool().query(
    `SELECT ${LIST_COLUMNS}, balance_tnd AS balance, address, profession, marital_status AS maritalStatus, emergency_contact AS emergencyContact,
            medications, anamnesis, pregnancy_status AS pregnancyStatus, diabetes, hypertension, anticoagulants,
            medical_notes AS medicalNotes, created_at AS createdAt
       FROM patients WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id, tenantId],
  );
  return rows[0] ?? null;
}

export async function insertPatient(
  connection: PoolConnection, tenantId: number, userId: number, number: string, p: PatientInput,
): Promise<number> {
  const result = await connection.query(
    `INSERT INTO patients (tenant_id, patient_number, first_name, last_name, date_of_birth, sex, national_id, phone, whatsapp,
       email, address, city, governorate, profession, marital_status, emergency_contact, allergies, chronic_conditions,
       medications, anamnesis, pregnancy_status, diabetes, hypertension, anticoagulants, medical_notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, number, p.firstName, p.lastName, p.dateOfBirth, p.sex, p.nationalId, p.phone, p.whatsapp,
      p.email, p.address, p.city, p.governorate, p.profession, p.maritalStatus, p.emergencyContact, p.allergies,
      p.chronicConditions, p.medications, p.anamnesis, p.pregnancyStatus, p.diabetes ? 1 : 0,
      p.hypertension ? 1 : 0, p.anticoagulants ? 1 : 0, p.medicalNotes, userId],
  );
  return result.insertId;
}

export async function updatePatient(connection: PoolConnection, tenantId: number, id: number, p: PatientInput) {
  const result = await connection.query(
    `UPDATE patients SET first_name=?, last_name=?, date_of_birth=?, sex=?, national_id=?, phone=?, whatsapp=?, email=?,
       address=?, city=?, governorate=?, profession=?, marital_status=?, emergency_contact=?, allergies=?,
       chronic_conditions=?, medications=?, anamnesis=?, pregnancy_status=?, diabetes=?, hypertension=?,
       anticoagulants=?, medical_notes=?
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [p.firstName, p.lastName, p.dateOfBirth, p.sex, p.nationalId, p.phone, p.whatsapp, p.email, p.address, p.city,
      p.governorate, p.profession, p.maritalStatus, p.emergencyContact, p.allergies, p.chronicConditions,
      p.medications, p.anamnesis, p.pregnancyStatus, p.diabetes ? 1 : 0, p.hypertension ? 1 : 0,
      p.anticoagulants ? 1 : 0, p.medicalNotes, id, tenantId],
  );
  return result.affectedRows > 0;
}

export async function softDeletePatient(connection: PoolConnection, tenantId: number, id: number) {
  const result = await connection.query(
    "UPDATE patients SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
    [id, tenantId],
  );
  return result.affectedRows > 0;
}

export async function restorePatient(connection: PoolConnection, tenantId: number, id: number) {
  const result = await connection.query(
    "UPDATE patients SET deleted_at = NULL WHERE id = ? AND tenant_id = ? AND deleted_at IS NOT NULL",
    [id, tenantId],
  );
  return result.affectedRows > 0;
}


export async function nationalIdTaken(connection: PoolConnection, tenantId: number, nationalId: string, excludeId = 0) {
  const rows = await connection.query(
    "SELECT id FROM patients WHERE tenant_id = ? AND national_id = ? AND deleted_at IS NULL AND id <> ? LIMIT 1",
    [tenantId, nationalId, excludeId],
  );
  return rows.length > 0;
}