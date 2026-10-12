import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  profile: "@vardapp/profile"
};

/**
 * @typedef {{ name: string, email?: string, loggedIn: boolean, id?: string }} Profile
 */

/** @returns {Promise<Profile>} */
export async function loadProfile() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.profile);
    if (!raw) return { name: "", email: "", loggedIn: false };
    const p = JSON.parse(raw);
    return {
      name: typeof p.name === "string" ? p.name : "",
      email: typeof p.email === "string" ? p.email : "",
      loggedIn: !!p.loggedIn,
      id: typeof p.id === "string" ? p.id : undefined
    };
  } catch {
    return { name: "", email: "", loggedIn: false };
  }
}

/** @param {Profile} profile */
export async function saveProfile(profile) {
  await AsyncStorage.setItem(
    KEYS.profile,
    JSON.stringify({
      name: (profile.name || "").trim(),
      email: (profile.email || "").trim(),
      loggedIn: !!profile.loggedIn,
      id: profile.id || undefined
    })
  );
}

export async function clearProfile() {
  await AsyncStorage.removeItem(KEYS.profile);
}
