import crypto from "crypto";
import { createUser, findUserByEmail, findUserById, publicUser } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "vardapp-dev-secret-change-me-in-production";
const JWT_EXPIRES_SEC = Number(process.env.JWT_EXPIRES_SEC || 60 * 60 * 24 * 30);

function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlJson(obj) {
  return b64url(JSON.stringify(obj));
}

/** passwordHash: scrypt$N$r$p$saltHex$hashHex */
export function hashPassword(password) {
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4], "hex");
    const expected = Buffer.from(parts[5], "hex");
    const hash = crypto.scryptSync(password, salt, expected.length, { N, r, p });
    return crypto.timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}

export function signToken(user) {
  const header = b64urlJson({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlJson({
    sub: user.id,
    email: user.email,
    iat: now,
    exp: now + JWT_EXPIRES_SEC
  });
  const data = `${header}.${payload}`;
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

export function verifyToken(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const data = `${header}.${payload}`;
    const expected = b64url(crypto.createHmac("sha256", JWT_SECRET).update(data).digest());
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const pad = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(
      Buffer.from(pad + "===".slice((pad.length + 3) % 4), "base64").toString()
    );
    if (json.exp && json.exp < Math.floor(Date.now() / 1000)) return null;
    return json;
  } catch {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const header = req.header("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: "Bejelentkezés szükséges." });
  }
  const payload = verifyToken(match[1]);
  if (!payload?.sub) {
    return res.status(401).json({ error: "Érvénytelen vagy lejárt token." });
  }
  try {
    const user = await findUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "A felhasználó nem található." });
    }
    req.user = publicUser(user);
    next();
  } catch (e) {
    return res.status(500).json({ error: "Adatbázis hiba." });
  }
}

export async function register({ email, password, name }) {
  const e = (email || "").trim().toLowerCase();
  const p = password || "";
  if (!e || !e.includes("@")) {
    const err = new Error("Érvényes e-mail cím szükséges.");
    err.code = "VALIDATION";
    throw err;
  }
  if (p.length < 6) {
    const err = new Error("A jelszónak legalább 6 karakter hosszúnak kell lennie.");
    err.code = "VALIDATION";
    throw err;
  }
  const passwordHash = hashPassword(p);
  const user = await createUser({ email: e, passwordHash, name: name || "" });
  const token = signToken(user);
  return { user, token };
}

export async function login({ email, password }) {
  const e = (email || "").trim().toLowerCase();
  const user = await findUserByEmail(e);
  if (!user) {
    const err = new Error("Hibás e-mail vagy jelszó.");
    err.code = "AUTH";
    throw err;
  }
  if (!verifyPassword(password || "", user.passwordHash)) {
    const err = new Error("Hibás e-mail vagy jelszó.");
    err.code = "AUTH";
    throw err;
  }
  const pub = publicUser(user);
  const token = signToken(pub);
  return { user: pub, token };
}
