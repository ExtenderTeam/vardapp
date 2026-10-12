/**
 * Időszaknak megfelelő magyar üdvözlés.
 * @param {Date} [now]
 * @returns {string} pl. "Jó reggelt", "Szép napot", "Szép estét", "Jó éjszakát"
 */
export function getTimeGreeting(now = new Date()) {
  const h = now.getHours();
  if (h >= 5 && h < 10) return "Jó reggelt";
  if (h >= 10 && h < 18) return "Szép napot";
  if (h >= 18 && h < 22) return "Szép estét";
  return "Jó éjszakát";
}

/**
 * Teljes üdvözlő sor, opcionális névvel.
 * @param {string|null} name
 * @param {Date} [now]
 */
export function getFullGreeting(name, now = new Date()) {
  const base = getTimeGreeting(now);
  const trimmed = (name || "").trim();
  if (trimmed) return `${base}, ${trimmed}!`;
  return `${base}!`;
}
