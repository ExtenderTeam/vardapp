import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { getNews } from "./news.js";
import { getSzonNews } from "./szon.js";
import { register, login, requireAuth } from "./auth.js";
import {
  initDb,
  listNotesByUser,
  getNote,
  createNote,
  updateNote,
  deleteNote
} from "./db.js";

initDb();

const app = express();
// crossOriginResourcePolicy: same-origin blokkolná a webes klienst másik domainről
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
  })
);
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"]
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    app: "VárdApp API",
    version: "0.2.0",
    storage: process.env.MYSQL_HOST ? "mysql" : "json"
  })
);

app.get("/api/news", async (req, res) => {
  try {
    const data = await getNews({ force: req.query.refresh === "1" });
    res.set("Cache-Control", "public, max-age=60");
    res.json(data);
  } catch (error) {
    res.status(502).json({
      error: "A hivatalos híroldal jelenleg nem olvasható.",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message,
      source: process.env.NEWS_SOURCE_URL || "https://www.kisvarda.hu/hirek/"
    });
  }
});

app.get("/api/szon-news", async (req, res) => {
  try {
    const data = await getSzonNews({ force: req.query.refresh === "1" });
    res.set("Cache-Control", "public, max-age=60");
    res.json(data);
  } catch (error) {
    res.status(502).json({
      error: "A Szabolcs (SZON) hírek jelenleg nem érhetők el.",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message,
      source: process.env.SZON_API_URL || process.env.SZON_SOURCE_URL || "https://www.szon.hu/"
    });
  }
});

app.get("/api/programs", (_req, res) =>
  res.json({ items: [], message: "A programnaptár adatforrása még nincs bekötve." })
);
app.get("/api/businesses", (_req, res) =>
  res.json({ items: [], message: "A vállalkozói adatbázis még nincs feltöltve." })
);
app.get("/api/healthcare", (_req, res) =>
  res.json({ items: [], message: "Az orvosi és intézményi címtár még nincs feltöltve." })
);

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    const result = await register({ email, password, name });
    res.status(201).json(result);
  } catch (error) {
    const status =
      error.code === "EMAIL_TAKEN" ? 409 : error.code === "VALIDATION" ? 400 : 500;
    res.status(status).json({ error: error.message || "Regisztráció sikertelen." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const result = await login({ email, password });
    res.json(result);
  } catch (error) {
    const status = error.code === "AUTH" || error.code === "VALIDATION" ? 401 : 500;
    res.status(status).json({ error: error.message || "Bejelentkezés sikertelen." });
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/notes", requireAuth, async (req, res) => {
  try {
    const items = await listNotesByUser(req.user.id);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: "Jegyzetek betöltése sikertelen." });
  }
});

app.post("/api/notes", requireAuth, async (req, res) => {
  try {
    const { title, body } = req.body || {};
    const note = await createNote(req.user.id, { title, body });
    res.status(201).json(note);
  } catch (e) {
    res.status(500).json({ error: "Jegyzet mentése sikertelen." });
  }
});

app.put("/api/notes/:id", requireAuth, async (req, res) => {
  try {
    const existing = await getNote(req.user.id, req.params.id);
    if (!existing) return res.status(404).json({ error: "Jegyzet nem található." });
    const { title, body } = req.body || {};
    const updated = await updateNote(req.user.id, req.params.id, { title, body });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: "Jegyzet frissítése sikertelen." });
  }
});

app.delete("/api/notes/:id", requireAuth, async (req, res) => {
  try {
    const ok = await deleteNote(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ error: "Jegyzet nem található." });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Jegyzet törlése sikertelen." });
  }
});

app.get("/api/admin/status", (req, res) => {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected || req.header("x-admin-key") !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.json({
    ok: true,
    message: "Admin API elérhető.",
    storage: process.env.MYSQL_HOST ? "mysql" : "json"
  });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => console.log(`VárdApp API listening on :${port}`));
