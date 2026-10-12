import * as cheerio from "cheerio";

const sourceUrl = process.env.NEWS_SOURCE_URL || "https://www.kisvarda.hu/hirek/";
const ttl = Number(process.env.NEWS_CACHE_TTL_MS || 900000);
let cached = { at: 0, items: [] };

function absoluteUrl(href) {
  try { return new URL(href, sourceUrl).toString(); } catch { return null; }
}

export async function getNews({ force = false } = {}) {
  if (!force && Date.now() - cached.at < ttl && cached.items.length) {
    return { items: cached.items, fetchedAt: new Date(cached.at).toISOString(), cached: true, source: sourceUrl };
  }

  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent": "VardApp/0.1 (Kisvarda local information app; contact: admin@example.invalid)",
      "accept": "text/html,application/xhtml+xml"
    },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`News source returned HTTP ${response.status}`);

  const html = await response.text();
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  // The source is WordPress-like. Try article cards first, then fall back to links in the news content.
  const candidates = $("article, .type-post, .post, .news-item, .elementor-post").toArray();
  const nodes = candidates.length ? candidates : $("main a, .site-main a, .content a").toArray();

  for (const node of nodes) {
    const el = $(node);
    const link = el.is("a") ? el : el.find("h2 a, h3 a, .entry-title a, a").first();
    const href = absoluteUrl(link.attr("href"));
    const title = (link.text() || el.find("h2, h3, .entry-title").first().text()).replace(/\s+/g, " ").trim();
    if (!href || !title || title.length < 8 || seen.has(href)) continue;
    if (!href.includes("kisvarda.hu")) continue;
    if (href.replace(/\/$/, "") === sourceUrl.replace(/\/$/, "")) continue;

    const dateText = el.find("time").attr("datetime") || el.find("time").text() || el.find(".date, .posted-on").text() || "";
    const excerpt = (el.find(".entry-summary, .excerpt, .elementor-post__excerpt, p").first().text() || "").replace(/\s+/g, " ").trim();
    const img = el.find("img").first();
    const image = absoluteUrl(img.attr("src") || img.attr("data-src") || "");
    const category = (el.find(".cat-links a, .category a, .elementor-post-info__terms-list a").first().text() || "").trim();

    seen.add(href);
    items.push({
      id: href,
      title,
      url: href,
      date: dateText.trim(),
      excerpt: excerpt.slice(0, 420),
      image: image && image !== sourceUrl ? image : null,
      category: category || "Helyi hírek",
      source: "Kisvárda hivatalos honlapja"
    });
    if (items.length >= 40) break;
  }

  // If the site's layout changes, return an explicit error rather than silently fabricating news.
  if (!items.length) {
    throw new Error("Nem sikerült hírcikkeket felismerni. Valószínűleg megváltozott a kisvarda.hu HTML-szerkezete; frissíteni kell a parsert.");
  }
  cached = { at: Date.now(), items };
  return { items, fetchedAt: new Date(cached.at).toISOString(), cached: false, source: sourceUrl };
}
