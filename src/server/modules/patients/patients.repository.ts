import type { PoolConnection } from "mariadb";
import { getPool } from "@/server/db";
import type { PatientInput } from "./patients.schema";

const LIST_COLUMNS = `id, patient_number AS patientNumber, first_name AS firstName, last_name AS lastName,
  date_of_birth AS dateOfBirth, sex, national_id AS nationalId, phone, whatsapp, email, city, governorate,
  allergies, chronic_conditions AS chronicConditions, balance_tnd AS balance, last_visit AS lastVisit`;

export async function listPatients(tenantId: number, search: string) {
  const like = `%${search}%`;
  return getPool().query(
    `SELECT ${LIST_COLUMNS} FROM patients
      WHERE tenant_id = ? AND deleted_at IS NULL
        AND (? = '' OR patient_number LIKE ? OR first_name LIKE ? OR last_name LIKE ?
          OR CONCAT(first_name, ' ', last_name) LIKE ? OR CONCAT(last_name, ' ', first_name) LIKE ?
          OR phone LIKE ? OR whatsapp LIKE ? OR national_id LIKE ?)
      ORDER BY last_name, first_name LIMIT 500`,
    [tenantId, search, like, like, like, like, like, like, like, like],
  );
}

export async function findPatient(tenantId: number, id: number) {
  const rows = await getPool().query(
    `SELECT ${LIST_COLUMNS}, address, profession, marital_status AS maritalStatus, emergency_contact AS emergencyContact,
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


export async function nationalIdTaken(connection: PoolConnection, tenantId: number, nationalId: string, excludeId = 0) {
  const rows = await connection.query(
    "SELECT id FROM patients WHERE tenant_id = ? AND national_id = ? AND deleted_at IS NULL AND id <> ? LIMIT 1",
    [tenantId, nationalId, excludeId],
  );
  return rows.length > 0;
}