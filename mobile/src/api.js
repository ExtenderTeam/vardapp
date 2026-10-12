import AsyncStorage from "@react-native-async-storage/async-storage";

const API = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
const TOKEN_KEY = "@vardapp/token";

export async function getToken() {
  try {
    return (await AsyncStorage.getItem(TOKEN_KEY)) || null;
  } catch {
    return null;
  }
}

export async function setToken(token) {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function apiRegister({ email, password, name }) {
  const data = await request("/api/auth/register", {
    method: "POST",
    body: { email, password, name }
  });
  if (data.token) await setToken(data.token);
  return data;
}

export async function apiLogin({ email, password }) {
  const data = await request("/api/auth/login", {
    method: "POST",
    body: { email, password }
  });
  if (data.token) await setToken(data.token);
  return data;
}

export async function apiLogout() {
  await setToken(null);
}

export async function apiMe() {
  return request("/api/auth/me", { auth: true });
}

export async function apiListNotes() {
  return request("/api/notes", { auth: true });
}

export async function apiCreateNote({ title, body }) {
  return request("/api/notes", { method: "POST", body: { title, body }, auth: true });
}

export async function apiUpdateNote(id, { title, body }) {
  return request(`/api/notes/${id}`, { method: "PUT", body: { title, body }, auth: true });
}

export async function apiDeleteNote(id) {
  return request(`/api/notes/${id}`, { method: "DELETE", auth: true });
}

export { API };
