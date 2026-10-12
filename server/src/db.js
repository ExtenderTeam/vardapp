import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "store.json");

const useMysql = !!(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE);

let pool = null;
let mysqlReady = null;

export function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

// ---------- JSON fallback ----------
function ensureDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function defaultStore() {
  return { users: [], notes: [] };
}

function readStore() {
  ensureDir();
  if (!fs.existsSync(dbPath)) {
    const empty = defaultStore();
    fs.writeFileSync(dbPath, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
  try {
    const raw = fs.readFileSync(dbPath, "utf8");
    const data = JSON.parse(raw);
    return {
      users: Array.isArray(data.users) ? data.users : [],
      notes: Array.isArray(data.notes) ? data.notes : []
    };
  } catch {
    return defaultStore();
  }
}

function writeStore(store) {
  ensureDir();
  const tmp = dbPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(tmp, dbPath);
}

// ---------- MySQL ----------
async function getPool() {
  if (!useMysql) return null;
  if (pool) return pool;
  if (mysqlReady) return mysqlReady;
  mysqlReady = (async () => {
    const mysql = await import("mysql2/promise");
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 12000,
      enableKeepAlive: true
    });
    await ensureSchema(pool);
    console.log("[db] MySQL connected:", process.env.MYSQL_HOST, process.env.MYSQL_DATABASE);
    return pool;
  })().catch((err) => {
    console.error("[db] MySQL unavailable, falling back to JSON store:", err.message);
    pool = null;
    mysqlReady = null;
    return null;
  });
  return mysqlReady;
}

async function ensureSchema(p) {
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(120) NOT NULL DEFAULT '',
      created_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      body TEXT,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      INDEX (user_id),
      CONSTRAINT fk_notes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// Call once at startup (non-blocking)
export function initDb() {
  if (useMysql) {
    getPool().catch(() => {});
  } else {
    console.log("[db] Using JSON file store at", dbPath);
  }
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt || user.created_at
  };
}

// ---- Users ----

export async function findUserByEmail(email) {
  const normalized = (email || "").trim().toLowerCase();
  const p = await getPool();
  if (p) {
    const [rows] = await p.query(
      "SELECT id, email, password_hash AS passwordHash, name, created_at AS createdAt FROM users WHERE email = ? LIMIT 1",
      [normalized]
    );
    return rows[0] || null;
  }
  const store = readStore();
  return store.users.find((u) => u.email === normalized) || null;
}

export async function findUserById(id) {
  const p = await getPool();
  if (p) {
    const [rows] = await p.query(
      "SELECT id, email, password_hash AS passwordHash, name, created_at AS createdAt FROM users WHERE id = ? LIMIT 1",
      [id]
    );
    return rows[0] || null;
  }
  const store = readStore();
  return store.users.find((u) => u.id === id) || null;
}

export async function createUser(data) {
  const email = data.email.trim().toLowerCase();
  const p = await getPool();
  if (p) {
    const [existing] = await p.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (existing.length) {
      const err = new Error("Ez az e-mail már regisztrálva van.");
      err.code = "EMAIL_TAKEN";
      throw err;
    }
    const user = {
      id: createId("usr"),
      email,
      passwordHash: data.passwordHash,
      name: (data.name || "").trim() || email.split("@")[0],
      createdAt: new Date().toISOString()
    };
    await p.query(
      "INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)",
      [user.id, user.email, user.passwordHash, user.name, user.createdAt]
    );
    return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
  }

  const store = readStore();
  if (store.users.some((u) => u.email === email)) {
    const err = new Error("Ez az e-mail már regisztrálva van.");
    err.code = "EMAIL_TAKEN";
    throw err;
  }
  const user = {
    id: createId("usr"),
    email,
    passwordHash: data.passwordHash,
    name: (data.name || "").trim() || email.split("@")[0],
    createdAt: new Date().toISOString()
  };
  store.users.push(user);
  writeStore(store);
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}

// ---- Notes ----

export async function listNotesByUser(userId) {
  const p = await getPool();
  if (p) {
    const [rows] = await p.query(
      "SELECT id, user_id AS userId, title, body, created_at AS createdAt, updated_at AS updatedAt FROM notes WHERE user_id = ? ORDER BY updated_at DESC",
      [userId]
    );
    return rows;
  }
  const store = readStore();
  return store.notes
    .filter((n) => n.userId === userId)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export async function getNote(userId, noteId) {
  const p = await getPool();
  if (p) {
    const [rows] = await p.query(
      "SELECT id, user_id AS userId, title, body, created_at AS createdAt, updated_at AS updatedAt FROM notes WHERE id = ? AND user_id = ? LIMIT 1",
      [noteId, userId]
    );
    return rows[0] || null;
  }
  const store = readStore();
  return store.notes.find((n) => n.id === noteId && n.userId === userId) || null;
}

export async function createNote(userId, { title, body }) {
  const ts = new Date().toISOString();
  const note = {
    id: createId("note"),
    userId,
    title: (title || "").trim() || "Névtelen jegyzet",
    body: (body || "").trim(),
    createdAt: ts,
    updatedAt: ts
  };
  const p = await getPool();
  if (p) {
    await p.query(
      "INSERT INTO notes (id, user_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [note.id, note.userId, note.title, note.body, note.createdAt, note.updatedAt]
    );
    return note;
  }
  const store = readStore();
  store.notes.push(note);
  writeStore(store);
  return note;
}

export async function updateNote(userId, noteId, { title, body }) {
  const p = await getPool();
  if (p) {
    const existing = await getNote(userId, noteId);
    if (!existing) return null;
    const ts = new Date().toISOString();
    const newTitle =
      title !== undefined ? String(title).trim() || "Névtelen jegyzet" : existing.title;
    const newBody = body !== undefined ? String(body).trim() : existing.body;
    await p.query(
      "UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      [newTitle, newBody, ts, noteId, userId]
    );
    return { ...existing, title: newTitle, body: newBody, updatedAt: ts };
  }
  const store = readStore();
  const idx = store.notes.findIndex((n) => n.id === noteId && n.userId === userId);
  if (idx === -1) return null;
  const ts = new Date().toISOString();
  store.notes[idx] = {
    ...store.notes[idx],
    title: title !== undefined ? String(title).trim() || "Névtelen jegyzet" : store.notes[idx].title,
    body: body !== undefined ? String(body).trim() : store.notes[idx].body,
    updatedAt: ts
  };
  writeStore(store);
  return store.notes[idx];
}

export async function deleteNote(userId, noteId) {
  const p = await getPool();
  if (p) {
    const [result] = await p.query("DELETE FROM notes WHERE id = ? AND user_id = ?", [
      noteId,
      userId
    ]);
    return result.affectedRows > 0;
  }
  const store = readStore();
  const before = store.notes.length;
  store.notes = store.notes.filter((n) => !(n.id === noteId && n.userId === userId));
  if (store.notes.length === before) return false;
  writeStore(store);
  return true;
}
