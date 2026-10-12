import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { getNews } from "./news.js";

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "VárdApp API", version: "0.1.0" }));

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

app.get("/api/programs", (_req, res) => res.json({ items: [], message: "A programnaptár adatforrása még nincs bekötve." }));
app.get("/api/businesses", (_req, res) => res.json({ items: [], message: "A vállalkozói adatbázis még nincs feltöltve." }));
app.get("/api/healthcare", (_req, res) => res.json({ items: [], message: "Az orvosi és intézményi címtár még nincs feltöltve." }));

// Minimal protected admin endpoint placeholder. Use HTTPS and proper identity/roles in production.
app.get("/api/admin/status", (req, res) => {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected || req.header("x-admin-key") !== expected) return res.status(401).json({ error: "Unauthorized" });
  res.json({ ok: true, message: "Admin API elérhető. A teljes admin UI és CRUD műveletek még fejlesztendők." });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => console.log(`VárdApp API listening on :${port}`));
