import nevnapok from "../data/nevnapok.json";

/**
 * Névnapok egy adott hónap+napra.
 * @param {number} month 1–12
 * @param {number} day 1–31
 * @returns {{ main: string[], other: string[] }}
 */
export function getNameDays(month, day) {
  const m = String(month);
  const d = String(day);
  const entry = nevnapok?.[m]?.[d];
  if (!entry) return { main: [], other: [] };
  return {
    main: Array.isArray(entry.main) ? entry.main : [],
    other: Array.isArray(entry.other) ? entry.other : []
  };
}

/**
 * Mai névnapok.
 */
export function getTodayNameDays(now = new Date()) {
  return getNameDays(now.getMonth() + 1, now.getDate());
}

/**
 * Formázott szöveg a fő + egyéb nevekből.
 */
export function formatNameDays(days) {
  const main = (days.main || []).join(", ");
  const other = (days.other || []).join(", ");
  if (main && other) return { main, other };
  if (main) return { main, other: "" };
  if (other) return { main: other, other: "" };
  return { main: "—", other: "" };
}
