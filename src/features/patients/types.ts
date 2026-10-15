export type PatientListItem = {
  id: number;
  patientNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  sex: string | null;
  nationalId: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  governorate: string | null;
  allergies: string | null;
  chronicConditions: string | null;
  balance: string; // DECIMAL renvoyé en texte par MariaDB
  lastVisit: string | null;
};

/** Fiche complète : liste + champs administratifs et médicaux. */
export type PatientDetail = PatientListItem & {
  address: string | null;
  profession: string | null;
  maritalStatus: string | null;
  emergencyContact: string | null;
  medications: string | null;
  anamnesis: string | null;
  pregnancyStatus: string | null;
  diabetes: number; // TINYINT : 0 ou 1
  hypertension: number;
  anticoagulants: number;
  medicalNotes: string | null;
  createdAt: string;
};

export type PatientFormValues = {
  firstName: string; lastName: string; phone: string; whatsapp: string; nationalId: string;
  dateOfBirth: string; sex: string; email: string;
  address: string; city: string; governorate: string; profession: string; maritalStatus: string; emergencyContact: string;
  allergies: string; chronicConditions: string; medications: string; anamnesis: string;
  pregnancyStatus: string; medicalNotes: string;
  diabetes: boolean; hypertension: boolean; anticoagulants: boolean;
};

export const EMPTY_PATIENT_FORM: PatientFormValues = {
  firstName: "", lastName: "", phone: "", whatsapp: "", nationalId: "", dateOfBirth: "", sex: "", email: "",
  address: "", city: "", governorate: "", profession: "", maritalStatus: "", emergencyContact: "",
  allergies: "", chronicConditions: "", medications: "", anamnesis: "", pregnancyStatus: "", medicalNotes: "",
  diabetes: false, hypertension: false, anticoagulants: false,
};

/** Transforme une fiche venant de la base (null) en valeurs de formulaire (""). */
export function toFormValues(p: PatientDetail): PatientFormValues {
  const s = (v: string | null) => v ?? "";
  return {
    firstName: p.firstName, lastName: p.lastName, phone: p.phone, whatsapp: s(p.whatsapp), nationalId: s(p.nationalId),
    dateOfBirth: s(p.dateOfBirth), sex: s(p.sex), email: s(p.email),
    address: s(p.address), city: s(p.city), governorate: s(p.governorate), profession: s(p.profession),
    maritalStatus: s(p.maritalStatus), emergencyContact: s(p.emergencyContact),
    allergies: s(p.allergies), chronicConditions: s(p.chronicConditions), medications: s(p.medications),
    anamnesis: s(p.anamnesis), pregnancyStatus: s(p.pregnancyStatus), medicalNotes: s(p.medicalNotes),
    diabetes: Boolean(p.diabetes), hypertension: Boolean(p.hypertension), anticoagulants: Boolean(p.anticoagulants),
  };
}