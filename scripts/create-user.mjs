import { randomBytes, scrypt } from "node:crypto";
import { createInterface } from "node:readline/promises";
import mariadb from "mariadb";

if (!process.env.DATABASE_URL) {
  console.error("Lance : node --env-file=.env.local scripts\\create-user.mjs");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const tenantId = Number(await rl.question("tenant_id du cabinet (ex. 1) : "));
const fullName = (await rl.question("Nom complet : ")).trim();
const email = (await rl.question("E-mail : ")).trim().toLowerCase();
const role = ((await rl.question("Rôle (ADMIN / DENTIST / SECRETARY / ASSISTANT) [ADMIN] : ")).trim().toUpperCase()) || "ADMIN";
const password = await rl.question("Mot de passe (10 caractères min.) : ");
rl.close();

if (!tenantId || !fullName || !email.includes("@") || password.length < 10) {
  console.error("Informations invalides.");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const key = await new Promise((res, rej) => scrypt(password, salt, 64, (e, k) => (e ? rej(e) : res(k))));
const hash = `scrypt$${salt}$${key.toString("hex")}`;

const url = new URL(process.env.DATABASE_URL);
const c = await mariadb.createConnection({
  host: url.hostname, port: Number(url.port) || 3306,
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: url.pathname.slice(1), insertIdAsNumber: true,
});

try {
  const result = await c.query(
    "INSERT INTO users (tenant_id, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)",
    [tenantId, fullName, email, hash, role],
  );
  // Rattache l'utilisateur au site principal du cabinet
  await c.query(
    "INSERT INTO user_clinics (tenant_id, user_id, clinic_id) SELECT ?, ?, id FROM clinics WHERE tenant_id = ? AND is_primary = 1 LIMIT 1",
    [tenantId, result.insertId, tenantId],
  );
  console.log(`Utilisateur créé (id ${result.insertId}). Connexion : ${email}`);
} catch (error) {
  console.error("Échec :", error.message);
  process.exitCode = 1;
} finally {
  await c.end();
}