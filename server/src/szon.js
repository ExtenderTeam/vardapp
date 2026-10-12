/**
 * Szabolcs hírek – szonscraper API
 * (pl. https://szonscraperapi.netlify.app → GET /api/news)
 * + HTML/RSS fallback a szon.hu-ról.
 */
import * as cheerio from "cheerio";

const szonApiBase = (process.env.SZON_API_URL || "https://szonscraperapi.netlify.app").replace(
  /\/$/,
  ""
);
const szonSite = process.env.SZON_SOURCE_URL || "https://www.szon.hu/";
const ttl = Number(process.env.SZON_CACHE_TTL_MS || 900000);
let cached = { at: 0, items: [], source: null, provider: null };

function absoluteUrl(href, base = szonSite) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function mapSzonscraperItem(item) {
  return {
    id: item.url || String(item.id),
    title: item.title || "",
    url: item.url || null,
    date: item.published_at || item.scraped_at || "",
    excerpt: (item.summary || "").slice(0, 420),
    image: item.image || null,
    category: "Szabolcs",
    source: "SZON (szon.hu)"
  };
}

/** Netlify: /api/news · helyi uvicorn: /news */
function newsPaths(base) {
  const paths = [];
  if (/netlify\.app$/i.test(new URL(base).hostname) || base.includes("netlify")) {
    paths.push("/api/news", "/news");
  } else {
    paths.push("/news", "/api/news");
  }
  return paths;
}

async function fromSzonscraper({ force = false } = {}) {
  if (!szonApiBase) return null;
  const q = force ? "?limit=40" : "?limit=40";
  let lastErr = null;

  for (const path of newsPaths(szonApiBase)) {
    try {
      const url = `${szonApiBase}${path}${q}`;
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "VardApp/0.2 (Szabolcs news client)"
        },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        lastErr = new Error(`szonscraper ${path} HTTP ${response.status}`);
        continue;
      }
      const body = await response.json();
      const items = (body.items || [])
        .map(mapSzonscraperItem)
        .filter((i) => i.title && i.url);
      if (!items.length) {
        lastErr = new Error("szonscraper üres lista");
        continue;
      }
      return {
        items,
        fetchedAt: new Date().toISOString(),
        cached: false,
        source: `${szonApiBase}${path}`,
        provider: "szonscraper"
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("szonscraper nem elérhető");
}

async function fromSzonSite() {
  const response = await fetch(szonSite, {
    headers: {
      "user-agent": "VardApp/0.2 (Kisvarda local information app)",
      accept: "text/html,application/xhtml+xml"
    },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`szon.hu HTTP ${response.status}`);
  const html = await response.text();
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  const rssHref =
    $('link[type="application/rss+xml"]').attr("href") ||
    $('link[type="application/atom+xml"]').attr("href");
  if (rssHref) {
    try {
      const rssUrl = absoluteUrl(rssHref);
      const rssRes = await fetch(rssUrl, {
        headers: { "user-agent": "VardApp/0.2" },
        signal: AbortSignal.timeout(10000)
      });
      if (rssRes.ok) {
        const rssText = await rssRes.text();
        const $r = cheerio.load(rssText, { xmlMode: true });
        $r("item, entry").each((_, el) => {
          const title = $r(el).find("title").first().text().replace(/\s+/g, " ").trim();
          const link =
            $r(el).find("link").first().attr("href") ||
            $r(el).find("link").first().text() ||
            $r(el).find("guid").first().text();
          const url = absoluteUrl((link || "").trim());
          const desc = ($r(el).find("description, summary, content").first().text() || "")
            .replace(/\s+/g, " ")
            .trim();
          const date =
            $r(el).find("pubDate, published, updated").first().text().trim() || "";
          if (!title || !url || seen.has(url)) return;
          seen.add(url);
          items.push({
            id: url,
            title,
            url,
            date,
            excerpt: desc.slice(0, 420),
            image: null,
            category: "Szabolcs",
            source: "SZON (szon.hu)"
          });
        });
      }
    } catch {
      /* HTML fallback */
    }
  }

  if (!items.length) {
    $("article, .article, .news-item, .cikk, .post").each((_, node) => {
      const el = $(node);
      const link = el.find("h2 a, h3 a, a").first();
      const href = absoluteUrl(link.attr("href"));
      const title = (link.text() || el.find("h2, h3").first().text()).replace(/\s+/g, " ").trim();
      if (!href || !title || title.length < 8 || seen.has(href)) return;
      if (!href.includes("szon.hu")) return;
      seen.add(href);
      const excerpt = (el.find("p").first().text() || "").replace(/\s+/g, " ").trim();
      const img = el.find("img").first();
      items.push({
        id: href,
        title,
        url: href,
        date: "",
        excerpt: excerpt.slice(0, 420),
        image: absoluteUrl(img.attr("src") || img.attr("data-src") || "") || null,
        category: "Szabolcs",
        source: "SZON (szon.hu)"
      });
    });
  }

  if (!items.length) {
    $("a[href]").each((_, node) => {
      const el = $(node);
      const href = absoluteUrl(el.attr("href"));
      const title = el.text().replace(/\s+/g, " ").trim();
      if (!href || !href.includes("szon.hu") || seen.has(href)) return;
      if (title.length < 20) return;
      try {
        if (!/\/[^/]+\/.+/.test(new URL(href).pathname)) return;
      } catch {
        return;
      }
      seen.add(href);
      items.push({
        id: href,
        title,
        url: href,
        date: "",
        excerpt: "",
        image: null,
        category: "Szabolcs",
        source: "SZON (szon.hu)"
      });
    });
  }

  if (!items.length) {
    throw new Error("Nem sikerült Szabolcs híreket felismerni a szon.hu-ról.");
  }
  return {
    items: items.slice(0, 40),
    fetchedAt: new Date().toISOString(),
    cached: false,
    source: szonSite,
    provider: "fallback"
  };
}

export async function getSzonNews({ force = false } = {}) {
  if (!force && Date.now() - cached.at < ttl && cached.items.length) {
    return {
      items: cached.items,
      fetchedAt: new Date(cached.at).toISOString(),
      cached: true,
      source: cached.source,
      provider: cached.provider
    };
  }

  let data;
  try {
    data = await fromSzonscraper({ force });
  } catch (e) {
    console.warn("[szon] szonscraper unavailable, fallback:", e.message);
    data = await fromSzonSite();
  }

  cached = {
    at: Date.now(),
    items: data.items,
    source: data.source,
    provider: data.provider
  };
  return data;
}
