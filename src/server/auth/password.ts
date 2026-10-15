import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Format stocké en base : scrypt$<sel en hexadécimal>$<empreinte en hexadécimale>
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex"); // sel aléatoire, différent pour chaque utilisateur
  const key = await derive(password, salt);
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, expectedHex] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const actual = await derive(password, salt);
  const expected = Buffer.from(expectedHex, "hex");
  // timingSafeEqual compare en temps constant : impossible de deviner le hash par chronométrage
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}