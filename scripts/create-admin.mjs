import { randomBytes, scrypt } from "node:crypto";
import { createInterface } from "node:readline/promises";
import mariadb from "mariadb";

const hashPassword = (password) =>
  new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString("hex");
    scrypt(password, salt, 64, (error, key) =>
      error ? reject(error) : resolve(`scrypt$${salt}$${key.toString("hex")}`),
    );
  });

const slugify = (text) =>
  text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL absente. Lance : node --env-file=.env.local scripts\\create-admin.mjs");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const clinicName = (await rl.question("Nom du cabinet : ")).trim();
const fullName = (await rl.question("Nom complet de l'administrateur : ")).trim();
const email = (await rl.question("E-mail de connexion : ")).trim().toLowerCase();
const password = await rl.question("Mot de passe (10 caractères minimum) : ");
rl.close();

if (!clinicName || !fullName || !email.includes("@") || password.length < 10) {
  console.error("Informations invalides : tout est obligatoire, mot de passe de 10 caractères minimum.");
  process.exit(1);
}

const url = new URL(process.env.DATABASE_URL);
const connection = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port) || 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  insertIdAsNumber: true,
});

try {
  await connection.beginTransaction();

  const tenant = await connection.query(
    "INSERT INTO tenants (name, slug) VALUES (?, ?)",
    [clinicName, slugify(clinicName)],
  );
  const tenantId = tenant.insertId;

  const clinic = await connection.query(
    "INSERT INTO clinics (tenant_id, name, is_primary) VALUES (?, ?, 1)",
    [tenantId, clinicName],
  );

  const user = await connection.query(
    "INSERT INTO users (tenant_id, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'ADMIN')",
    [tenantId, fullName, email, await hashPassword(password)],
  );

  await connection.query(
    "INSERT INTO user_clinics (tenant_id, user_id, clinic_id) VALUES (?, ?, ?)",
    [tenantId, user.insertId, clinic.insertId],
  );

  await connection.query(
    "INSERT INTO tenant_subscriptions (tenant_id, plan_code, status, started_at) VALUES (?, 'FREE', 'TRIAL', CURDATE())",
    [tenantId],
  );

  await connection.commit();
  console.log(`\nCabinet créé (tenant_id = ${tenantId}). Connexion : ${email}`);
} catch (error) {
  await connection.rollback();
  console.error("Échec, rien n'a été enregistré :", error.message);
  process.exitCode = 1;
} finally {
  await connection.end();
}