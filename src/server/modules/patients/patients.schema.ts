import { z } from "zod";

// "nour DERBEL" → "Nour Derbel" ; gère aussi les noms composés (Jean-Pierre, O'Brien)
const capitalize = (v: string) =>
  v.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());

// "" venant d'un formulaire devient null
const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => v || null).nullish().transform((v) => v ?? null);

export const patientInputSchema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est obligatoire.").max(100).transform(capitalize),
lastName: z.string().trim().min(1, "Le nom est obligatoire.").max(100).transform(capitalize),
  phone: z.string().trim().min(1, "Le téléphone est obligatoire.").max(32),
  nationalId: z
    .string().trim().transform((v) => v.replace(/\s/g, ""))
    .refine((v) => v === "" || /^\d{8}$/.test(v), "La CIN doit comporter 8 chiffres.")
    .transform((v) => v || null).nullish().transform((v) => v ?? null),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.").nullish().or(z.literal("")).transform((v) => v || null),
  sex: optionalText(20),
  whatsapp: optionalText(32),
  email: z.string().trim().email("E-mail invalide.").nullish().or(z.literal("")).transform((v) => v || null),
  address: optionalText(255),
  city: optionalText(100),
  governorate: optionalText(100),
  profession: optionalText(120),
  maritalStatus: optionalText(40),
  emergencyContact: optionalText(180),
  allergies: optionalText(2000),
  chronicConditions: optionalText(2000),
  medications: optionalText(2000),
  anamnesis: optionalText(4000),
  pregnancyStatus: optionalText(40),
  medicalNotes: optionalText(4000),
  diabetes: z.boolean().default(false),
  hypertension: z.boolean().default(false),
  anticoagulants: z.boolean().default(false),
});

export type PatientInput = z.infer<typeof patientInputSchema>;