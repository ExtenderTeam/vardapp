import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { getFullGreeting } from "./src/greeting";
import { formatNameDays, getNameDays, getTodayNameDays } from "./src/nevnap";
import { loadProfile, saveProfile, clearProfile } from "./src/storage";
import {
  apiRegister,
  apiLogin,
  apiLogout,
  apiMe,
  apiListNotes,
  apiCreateNote,
  apiUpdateNote,
  apiDeleteNote,
  getToken
} from "./src/api";

const API = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

const tabs = [
  { key: "news", label: "Hírek", icon: "📰" },
  { key: "calendar", label: "Naptár", icon: "📅" },
  { key: "notes", label: "Jegyzetek", icon: "📝" },
  { key: "more", label: "Egyéb", icon: "⋯" }
];

const WEEKDAYS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];
const MONTH_NAMES = [
  "Január", "Február", "Március", "Április", "Május", "Június",
  "Július", "Augusztus", "Szeptember", "Október", "November", "December"
];

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Hétfő = 0 ... Vasárnap = 6 */
function mondayBasedWeekday(date) {
  return (date.getDay() + 6) % 7;
}

export default function App() {
  const [tab, setTab] = useState("news");
  const [news, setNews] = useState([]);
  const [newsSource, setNewsSource] = useState("kisvarda"); // kisvarda | szon
  const [meta, setMeta] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [profile, setProfile] = useState({ name: "", email: "", loggedIn: false });
  const [greeting, setGreeting] = useState(getFullGreeting(""));
  const [authModal, setAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteModal, setNoteModal] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");

  const now = useMemo(() => new Date(), []);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState(now.getDate());

  const refreshNotes = useCallback(async () => {
    setNotesLoading(true);
    try {
      const data = await apiListNotes();
      setNotes(data.items || []);
    } catch {
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  // ---- init: restore session ----
  useEffect(() => {
    (async () => {
      const local = await loadProfile();
      const token = await getToken();
      if (token && local.loggedIn) {
        try {
          const { user } = await apiMe();
          const next = { id: user.id, name: user.name, email: user.email, loggedIn: true };
          await saveProfile(next);
          setProfile(next);
          setGreeting(getFullGreeting(user.name));
          await refreshNotes();
          return;
        } catch {
          await apiLogout();
          await clearProfile();
        }
      }
      setProfile({ name: "", email: "", loggedIn: false });
      setGreeting(getFullGreeting(""));
    })();
  }, [refreshNotes]);

  useEffect(() => {
    const id = setInterval(() => {
      setGreeting(getFullGreeting(profile.loggedIn ? profile.name : ""));
    }, 60_000);
    return () => clearInterval(id);
  }, [profile]);

  // ---- news ----
  const loadNews = useCallback(async (refresh = false, source = newsSource) => {
    try {
      setError("");
      const path = source === "szon" ? "/api/szon-news" : "/api/news";
      const response = await fetch(`${API}${path}${refresh ? "?refresh=1" : ""}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Nem sikerült betölteni a híreket.");
      setNews(body.items || []);
      const label = source === "szon" ? "SZON" : "kisvarda.hu";
      setMeta(
        body.fetchedAt
          ? `${label} · ${new Date(body.fetchedAt).toLocaleString("hu-HU")}`
          : label
      );
    } catch (e) {
      setError(`${e.message} Ellenőrizd, hogy az API fut-e, és a telefon eléri-e a szerver IP-címét.`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [newsSource]);

  useEffect(() => {
    setLoading(true);
    loadNews(false, newsSource);
  }, [newsSource, loadNews]);

  const onRefresh = () => {
    setRefreshing(true);
    loadNews(true, newsSource);
  };

  // ---- auth (szerver JWT) ----
  const openAuth = (mode = "login") => {
    setAuthMode(mode);
    setAuthName(profile.name || "");
    setAuthEmail(profile.email || "");
    setAuthPassword("");
    setAuthModal(true);
  };

  const handleAuthSubmit = async () => {
    const email = authEmail.trim();
    const password = authPassword;
    const name = authName.trim();
    if (!email || !email.includes("@")) {
      Alert.alert("Hiányzó adat", "Érvényes e-mail cím szükséges.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Gyenge jelszó", "A jelszónak legalább 6 karakter hosszúnak kell lennie.");
      return;
    }
    if (authMode === "register" && !name) {
      Alert.alert("Hiányzó név", "Add meg a neved a regisztrációhoz.");
      return;
    }
    setAuthBusy(true);
    try {
      const result =
        authMode === "register"
          ? await apiRegister({ email, password, name })
          : await apiLogin({ email, password });
      const user = result.user;
      const next = { id: user.id, name: user.name, email: user.email, loggedIn: true };
      await saveProfile(next);
      setProfile(next);
      setGreeting(getFullGreeting(user.name));
      setAuthModal(false);
      await refreshNotes();
    } catch (e) {
      Alert.alert("Hiba", e.message || "Sikertelen művelet.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    await apiLogout();
    await clearProfile();
    setProfile({ name: "", email: "", loggedIn: false });
    setGreeting(getFullGreeting(""));
    setNotes([]);
    setAuthModal(false);
  };

  // ---- notes (szerver) ----
  const openNewNote = () => {
    if (!profile.loggedIn) {
      Alert.alert("Bejelentkezés szükséges", "A jegyzetek a fiókodhoz kapcsolódnak.", [
        { text: "Mégse", style: "cancel" },
        { text: "Bejelentkezés", onPress: () => openAuth("login") }
      ]);
      return;
    }
    setEditingNote(null);
    setNoteTitle("");
    setNoteBody("");
    setNoteModal(true);
  };

  const openEditNote = (note) => {
    setEditingNote(note);
    setNoteTitle(note.title);
    setNoteBody(note.body);
    setNoteModal(true);
  };

  const saveNote = async () => {
    if (!profile.loggedIn) return;
    setNoteBusy(true);
    try {
      if (editingNote) {
        const updated = await apiUpdateNote(editingNote.id, { title: noteTitle, body: noteBody });
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      } else {
        const created = await apiCreateNote({ title: noteTitle, body: noteBody });
        setNotes((prev) => [created, ...prev]);
      }
      setNoteModal(false);
    } catch (e) {
      Alert.alert("Hiba", e.message || "Nem sikerült menteni a jegyzetet.");
    } finally {
      setNoteBusy(false);
    }
  };

  const deleteNote = (note) => {
    Alert.alert("Jegyzet törlése", `Biztosan törlöd: „${note.title}”?`, [
      { text: "Mégse", style: "cancel" },
      {
        text: "Törlés",
        style: "destructive",
        onPress: async () => {
          try {
            await apiDeleteNote(note.id);
            setNotes((prev) => prev.filter((n) => n.id !== note.id));
          } catch (e) {
            Alert.alert("Hiba", e.message || "Törlés sikertelen.");
          }
        }
      }
    ]);
  };

  // ---- calendar helpers ----
  const calendarCells = useMemo(() => {
    const first = new Date(calYear, calMonth, 1);
    const total = daysInMonth(calYear, calMonth);
    const startPad = mondayBasedWeekday(first);
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calYear, calMonth]);

  const selectedNameDays = useMemo(() => {
    return formatNameDays(getNameDays(calMonth + 1, selectedDay));
  }, [calMonth, selectedDay]);

  const todayNameDays = useMemo(() => formatNameDays(getTodayNameDays()), []);

  const isToday = (day) =>
    day &&
    calYear === now.getFullYear() &&
    calMonth === now.getMonth() &&
    day === now.getDate();

  const prevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else setCalMonth((m) => m - 1);
    setSelectedDay(1);
  };

  const nextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else setCalMonth((m) => m + 1);
    setSelectedDay(1);
  };

  // ---- renderers ----
  const renderNews = ({ item }) => (
    <Pressable style={styles.newsCard} onPress={() => item.url && Linking.openURL(item.url)}>
      <View style={styles.categoryRow}>
        <Text style={styles.category}>{item.category || "Helyi hírek"}</Text>
        <Text style={styles.date}>{item.date || ""}</Text>
      </View>
      <Text style={styles.newsTitle}>{item.title}</Text>
      {!!item.excerpt && (
        <Text style={styles.excerpt} numberOfLines={3}>
          {item.excerpt}
        </Text>
      )}
      <Text style={styles.readMore}>Eredeti cikk megnyitása ↗</Text>
    </Pressable>
  );

  const renderCalendar = () => (
    <ScrollView contentContainerStyle={styles.calScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.nameDayBanner}>
        <Text style={styles.nameDayLabel}>Mai névnap</Text>
        <Text style={styles.nameDayMain}>{todayNameDays.main}</Text>
        {!!todayNameDays.other && (
          <Text style={styles.nameDayOther} numberOfLines={2}>
            Egyéb: {todayNameDays.other}
          </Text>
        )}
      </View>

      <View style={styles.calHeader}>
        <Pressable onPress={prevMonth} style={styles.calNav}>
          <Text style={styles.calNavText}>‹</Text>
        </Pressable>
        <Text style={styles.calTitle}>
          {MONTH_NAMES[calMonth]} {calYear}
        </Text>
        <Pressable onPress={nextMonth} style={styles.calNav}>
          <Text style={styles.calNavText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekDay}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.dayGrid}>
        {calendarCells.map((day, idx) => {
          const selected = day === selectedDay;
          const today = isToday(day);
          return (
            <Pressable
              key={idx}
              style={[
                styles.dayCell,
                selected && styles.daySelected,
                today && !selected && styles.dayToday
              ]}
              disabled={!day}
              onPress={() => day && setSelectedDay(day)}
            >
              <Text
                style={[
                  styles.dayNum,
                  !day && styles.dayEmpty,
                  selected && styles.dayNumSelected,
                  today && !selected && styles.dayNumToday
                ]}
              >
                {day || ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.selectedBox}>
        <Text style={styles.selectedTitle}>
          {selectedDay}. {MONTH_NAMES[calMonth].toLowerCase()} – névnapok
        </Text>
        <Text style={styles.selectedMain}>{selectedNameDays.main}</Text>
        {!!selectedNameDays.other && (
          <Text style={styles.selectedOther}>Egyéb: {selectedNameDays.other}</Text>
        )}
        <Text style={styles.calHint}>
          A városi programok és események bekötése a következő iterációban érkezik.
        </Text>
      </View>
    </ScrollView>
  );

  const renderNotes = () => (
    <View style={styles.notesWrap}>
      <View style={styles.notesToolbar}>
        <Text style={styles.sectionTitle}>Jegyzeteim</Text>
        {profile.loggedIn && (
          <Pressable style={styles.addBtn} onPress={openNewNote}>
            <Text style={styles.addBtnText}>+ Új</Text>
          </Pressable>
        )}
      </View>
      {!profile.loggedIn ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔐</Text>
          <Text style={styles.emptyTitle}>Jelentkezz be a jegyzetekhez</Text>
          <Text style={styles.emptyText}>
            A jegyzetek a fiókodhoz kapcsolódnak, és több eszközön is elérhetők lesznek.
          </Text>
          <Pressable style={styles.retry} onPress={() => openAuth("login")}>
            <Text style={styles.retryText}>Bejelentkezés</Text>
          </Pressable>
          <Pressable style={[styles.secondaryBtn, { marginTop: 10 }]} onPress={() => openAuth("register")}>
            <Text style={styles.secondaryBtnText}>Regisztráció</Text>
          </Pressable>
        </View>
      ) : notesLoading ? (
        <ActivityIndicator style={{ marginTop: 36 }} size="large" color="#176B52" />
      ) : notes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📝</Text>
          <Text style={styles.emptyTitle}>Még nincs jegyzeted</Text>
          <Text style={styles.emptyText}>
            Itt tarthatod az emlékeztetőidet – a szerveren, a fiókodhoz kötve.
          </Text>
          <Pressable style={styles.retry} onPress={openNewNote}>
            <Text style={styles.retryText}>Első jegyzet</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable style={styles.noteCard} onPress={() => openEditNote(item)}>
              <View style={styles.noteHeader}>
                <Text style={styles.noteTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Pressable onPress={() => deleteNote(item)} hitSlop={12}>
                  <Text style={styles.noteDelete}>🗑</Text>
                </Pressable>
              </View>
              {!!item.body && (
                <Text style={styles.noteBody} numberOfLines={3}>
                  {item.body}
                </Text>
              )}
              <Text style={styles.noteDate}>
                {new Date(item.updatedAt).toLocaleString("hu-HU")}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );

  const renderMore = () => (
    <ScrollView contentContainerStyle={styles.moreScroll}>
      <View style={styles.profileCard}>
        <Text style={styles.profileLabel}>Fiók</Text>
        {profile.loggedIn ? (
          <>
            <Text style={styles.profileName}>{profile.name}</Text>
            {!!profile.email && <Text style={styles.profileEmail}>{profile.email}</Text>}
            <Text style={styles.profileHint}>
              Bejelentkezve. A jegyzetek a szerveren a fiókodhoz vannak kötve.
            </Text>
            <View style={styles.profileActions}>
              <Pressable style={styles.outlineBtn} onPress={handleLogout}>
                <Text style={styles.outlineBtnText}>Kijelentkezés</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.profileHint}>
              Regisztrálj vagy jelentkezz be a személyre szabott üdvözléshez és a szinkronizált jegyzetekhez.
            </Text>
            <View style={styles.profileActions}>
              <Pressable style={styles.retry} onPress={() => openAuth("login")}>
                <Text style={styles.retryText}>Bejelentkezés</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={() => openAuth("register")}>
                <Text style={styles.secondaryBtnText}>Regisztráció</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      <View style={styles.moreSection}>
        <Text style={styles.moreSectionTitle}>Programok</Text>
        <Text style={styles.moreSectionText}>A városi programnaptár bekötése következik.</Text>
        <Text style={styles.pending}>Fejlesztés alatt</Text>
      </View>
      <View style={styles.moreSection}>
        <Text style={styles.moreSectionTitle}>Vállalkozások</Text>
        <Text style={styles.moreSectionText}>Üzletek, éttermek és szolgáltatók adatbázisa.</Text>
        <Text style={styles.pending}>Fejlesztés alatt</Text>
      </View>
      <View style={styles.moreSection}>
        <Text style={styles.moreSectionTitle}>Orvosok és intézmények</Text>
        <Text style={styles.moreSectionText}>
          Rendelők, intézmények, elérhetőségek és nyitvatartás.
        </Text>
        <Text style={styles.pending}>Fejlesztés alatt</Text>
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#123F35" />
      <ExpoStatusBar style="light" />

      <View style={styles.header}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>V</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>VárdApp</Text>
          <Text style={styles.tagline}>Kisvárda a zsebedben</Text>
        </View>
        <Pressable onPress={() => openAuth("login")} hitSlop={8}>
          <Text style={styles.headerTown}>{profile.loggedIn ? "👤" : "KISVÁRDA"}</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>ÜDVÖZLÜNK</Text>
        <Text style={styles.heroTitle}>{greeting}</Text>
        <Text style={styles.heroSub}>
          Hírek • naptár & névnap • jegyzetek • helyi szolgáltatások
        </Text>
      </View>

      <View style={styles.tabBar}>
        {tabs.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabActive]}
          >
            <Text style={styles.tabIcon}>{t.icon}</Text>
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "news" && (
        <View style={styles.content}>
          <View style={styles.newsSourceBar}>
            <Pressable
              onPress={() => setNewsSource("kisvarda")}
              style={[styles.newsSourceBtn, newsSource === "kisvarda" && styles.newsSourceBtnActive]}
            >
              <Text style={[styles.newsSourceText, newsSource === "kisvarda" && styles.newsSourceTextActive]}>
                Kisvárda
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setNewsSource("szon")}
              style={[styles.newsSourceBtn, newsSource === "szon" && styles.newsSourceBtnActive]}
            >
              <Text style={[styles.newsSourceText, newsSource === "szon" && styles.newsSourceTextActive]}>
                Szabolcs (SZON)
              </Text>
            </Pressable>
          </View>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>
                {newsSource === "szon" ? "Szabolcs hírek" : "Friss hírek"}
              </Text>
              <Text style={styles.sectionSub}>
                {newsSource === "szon" ? "Forrás: szon.hu" : "Forrás: kisvarda.hu"}
              </Text>
            </View>
            {!!meta && <Text style={styles.updated}>{meta}</Text>}
          </View>
          {loading ? (
            <ActivityIndicator style={{ marginTop: 36 }} size="large" color="#176B52" />
          ) : error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>A hírek most nem érhetők el</Text>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                onPress={() => {
                  setLoading(true);
                  loadNews(false, newsSource);
                }}
                style={styles.retry}
              >
                <Text style={styles.retryText}>Újrapróbálom</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={news}
              keyExtractor={(item, index) => item.id || String(index)}
              renderItem={renderNews}
              contentContainerStyle={styles.list}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#176B52" />
              }
              ListEmptyComponent={
                <Text style={styles.emptyText}>Még nincs megjeleníthető hír.</Text>
              }
            />
          )}
        </View>
      )}

      {tab === "calendar" && <View style={styles.content}>{renderCalendar()}</View>}
      {tab === "notes" && renderNotes()}
      {tab === "more" && <View style={styles.content}>{renderMore()}</View>}

      <View style={styles.footer}>
        <Text style={styles.footerText}>VárdApp · Kisvárda</Text>
        <Text style={styles.footerSmall}>A hírek eredeti forrása: kisvarda.hu</Text>
      </View>

      {/* Auth modal */}
      <Modal visible={authModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {authMode === "register" ? "Regisztráció" : "Bejelentkezés"}
            </Text>
            <Text style={styles.modalHint}>
              A fiók a szerveren tárolódik. A jelszót soha nem küldjük vissza, csak hash formában mentjük.
            </Text>
            {authMode === "register" && (
              <>
                <Text style={styles.inputLabel}>Név *</Text>
                <TextInput
                  style={styles.input}
                  value={authName}
                  onChangeText={setAuthName}
                  placeholder="pl. Anna"
                  placeholderTextColor="#9AA69F"
                  autoCapitalize="words"
                />
              </>
            )}
            <Text style={styles.inputLabel}>E-mail *</Text>
            <TextInput
              style={styles.input}
              value={authEmail}
              onChangeText={setAuthEmail}
              placeholder="pl. anna@pelda.hu"
              placeholderTextColor="#9AA69F"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.inputLabel}>Jelszó * (min. 6 karakter)</Text>
            <TextInput
              style={styles.input}
              value={authPassword}
              onChangeText={setAuthPassword}
              placeholder="••••••••"
              placeholderTextColor="#9AA69F"
              secureTextEntry
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryBtn} onPress={() => setAuthModal(false)}>
                <Text style={styles.secondaryBtnText}>Mégse</Text>
              </Pressable>
              <Pressable
                style={[styles.retry, authBusy && { opacity: 0.6 }]}
                onPress={handleAuthSubmit}
                disabled={authBusy}
              >
                <Text style={styles.retryText}>
                  {authBusy ? "…" : authMode === "register" ? "Regisztráció" : "Belépés"}
                </Text>
              </Pressable>
            </View>
            <Pressable
              style={{ marginTop: 16, alignItems: "center" }}
              onPress={() => setAuthMode(authMode === "login" ? "register" : "login")}
            >
              <Text style={{ color: "#176B52", fontWeight: "700", fontSize: 13 }}>
                {authMode === "login"
                  ? "Nincs fiókod? Regisztráció →"
                  : "Van már fiókod? Bejelentkezés →"}
              </Text>
            </Pressable>
            {profile.loggedIn && (
              <Pressable style={[styles.outlineBtn, { marginTop: 14 }]} onPress={handleLogout}>
                <Text style={styles.outlineBtnText}>Kijelentkezés</Text>
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Note modal */}
      <Modal visible={noteModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingNote ? "Jegyzet szerkesztése" : "Új jegyzet"}
            </Text>
            <Text style={styles.inputLabel}>Cím</Text>
            <TextInput
              style={styles.input}
              value={noteTitle}
              onChangeText={setNoteTitle}
              placeholder="Cím"
              placeholderTextColor="#9AA69F"
            />
            <Text style={styles.inputLabel}>Szöveg</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={noteBody}
              onChangeText={setNoteBody}
              placeholder="Jegyzet tartalma…"
              placeholderTextColor="#9AA69F"
              multiline
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryBtn} onPress={() => setNoteModal(false)}>
                <Text style={styles.secondaryBtnText}>Mégse</Text>
              </Pressable>
              <Pressable style={[styles.retry, noteBusy && { opacity: 0.6 }]} onPress={saveNote} disabled={noteBusy}>
                <Text style={styles.retryText}>{noteBusy ? "…" : "Mentés"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F7F5" },
  header: {
    backgroundColor: "#123F35",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#D6E9A8",
    alignItems: "center",
    justifyContent: "center"
  },
  brandMarkText: { fontSize: 26, fontWeight: "900", color: "#123F35" },
  brand: { color: "#FFFFFF", fontWeight: "800", fontSize: 22, letterSpacing: 0.2 },
  tagline: { color: "#C9DED5", fontSize: 12, marginTop: 1 },
  headerTown: { color: "#D6E9A8", fontSize: 12, fontWeight: "800", letterSpacing: 1.2 },
  hero: {
    backgroundColor: "#176B52",
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24
  },
  heroEyebrow: {
    color: "#D6E9A8",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
    marginBottom: 6
  },
  heroTitle: { color: "#FFFFFF", fontSize: 22, lineHeight: 28, fontWeight: "800", maxWidth: 340 },
  heroSub: { color: "#DDECE5", fontSize: 12, marginTop: 8 },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 5,
    elevation: 1
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 12 },
  tabActive: { backgroundColor: "#E4F0E9" },
  tabIcon: { fontSize: 18, marginBottom: 3 },
  tabLabel: { color: "#66736D", fontSize: 10, fontWeight: "600" },
  tabLabelActive: { color: "#15513F", fontWeight: "800" },
  content: { flex: 1, paddingHorizontal: 16 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 10
  },
  sectionTitle: { color: "#173D32", fontWeight: "800", fontSize: 21 },
  sectionSub: { color: "#788780", fontSize: 12, marginTop: 2 },
  updated: { color: "#7D8983", fontSize: 9, maxWidth: 115, textAlign: "right" },
  list: { paddingBottom: 12 },
  newsCard: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 17,
    marginBottom: 11,
    borderWidth: 1,
    borderColor: "#E7ECE8"
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9
  },
  category: {
    color: "#176B52",
    backgroundColor: "#E4F0E9",
    overflow: "hidden",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: "800"
  },
  date: { color: "#8A958F", fontSize: 10 },
  newsTitle: { color: "#1E3029", fontSize: 16, lineHeight: 22, fontWeight: "800" },
  excerpt: { color: "#63716A", fontSize: 13, lineHeight: 19, marginTop: 7 },
  readMore: { color: "#176B52", fontWeight: "800", fontSize: 12, marginTop: 12 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  emptyIcon: { fontSize: 44, marginBottom: 14 },
  emptyTitle: { color: "#173D32", fontSize: 20, fontWeight: "800", textAlign: "center" },
  emptyText: {
    color: "#738078",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 8
  },
  pending: {
    marginTop: 12,
    alignSelf: "flex-start",
    color: "#176B52",
    fontWeight: "800",
    fontSize: 12,
    backgroundColor: "#E4F0E9",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    overflow: "hidden"
  },
  errorBox: { marginTop: 22, backgroundColor: "#FFFFFF", borderRadius: 16, padding: 18 },
  errorTitle: { color: "#9D312A", fontSize: 16, fontWeight: "800" },
  errorText: { color: "#5E6963", fontSize: 13, lineHeight: 19, marginTop: 8 },
  retry: {
    alignSelf: "flex-start",
    backgroundColor: "#176B52",
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginTop: 14
  },
  retryText: { color: "#FFFFFF", fontWeight: "800" },
  footer: { paddingTop: 8, paddingBottom: 10, alignItems: "center" },
  footerText: { color: "#496158", fontSize: 11, fontWeight: "800" },
  footerSmall: { color: "#87938C", fontSize: 9, marginTop: 2 },

  // Calendar
  calScroll: { paddingBottom: 24 },
  nameDayBanner: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E7ECE8"
  },
  nameDayLabel: { color: "#788780", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  nameDayMain: { color: "#173D32", fontSize: 20, fontWeight: "800", marginTop: 4 },
  nameDayOther: { color: "#63716A", fontSize: 12, marginTop: 6, lineHeight: 17 },
  calHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10
  },
  calNav: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#E4F0E9",
    alignItems: "center",
    justifyContent: "center"
  },
  calNavText: { fontSize: 24, color: "#15513F", fontWeight: "700", marginTop: -2 },
  calTitle: { color: "#173D32", fontSize: 18, fontWeight: "800" },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekDay: {
    flex: 1,
    textAlign: "center",
    color: "#8A958F",
    fontSize: 11,
    fontWeight: "700"
  },
  dayGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12
  },
  daySelected: { backgroundColor: "#176B52" },
  dayToday: { backgroundColor: "#E4F0E9" },
  dayNum: { color: "#1E3029", fontSize: 15, fontWeight: "600" },
  dayEmpty: { color: "transparent" },
  dayNumSelected: { color: "#FFFFFF", fontWeight: "800" },
  dayNumToday: { color: "#15513F", fontWeight: "800" },
  selectedBox: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E7ECE8"
  },
  selectedTitle: { color: "#788780", fontSize: 12, fontWeight: "700" },
  selectedMain: { color: "#173D32", fontSize: 18, fontWeight: "800", marginTop: 6 },
  selectedOther: { color: "#63716A", fontSize: 13, marginTop: 6, lineHeight: 18 },
  calHint: { color: "#8A958F", fontSize: 12, marginTop: 12, lineHeight: 17 },

  // Notes
  notesWrap: { flex: 1, paddingHorizontal: 16 },
  notesToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 10
  },
  addBtn: {
    backgroundColor: "#176B52",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  addBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  noteCard: {
    backgroundColor: "#FFFFFF",
    padding: 15,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E7ECE8"
  },
  noteHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  noteTitle: { flex: 1, color: "#1E3029", fontSize: 16, fontWeight: "800" },
  noteDelete: { fontSize: 16 },
  noteBody: { color: "#63716A", fontSize: 13, lineHeight: 19, marginTop: 6 },
  noteDate: { color: "#8A958F", fontSize: 10, marginTop: 8 },

  // More / profile
  moreScroll: { paddingBottom: 24 },
  profileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E7ECE8"
  },
  profileLabel: { color: "#788780", fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
  profileName: { color: "#173D32", fontSize: 20, fontWeight: "800", marginTop: 6 },
  profileEmail: { color: "#63716A", fontSize: 13, marginTop: 2 },
  profileHint: { color: "#63716A", fontSize: 13, lineHeight: 19, marginTop: 8 },
  profileActions: { flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" },
  moreSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E7ECE8"
  },
  moreSectionTitle: { color: "#173D32", fontSize: 16, fontWeight: "800" },
  moreSectionText: { color: "#63716A", fontSize: 13, lineHeight: 19, marginTop: 6 },

  secondaryBtn: {
    backgroundColor: "#E4F0E9",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  secondaryBtnText: { color: "#15513F", fontWeight: "800" },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: "#176B52",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  outlineBtnText: { color: "#176B52", fontWeight: "800" },

  // Modals
  newsSourceBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 4,
    marginTop: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#E7ECE8"
  },
  newsSourceBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center"
  },
  newsSourceBtnActive: { backgroundColor: "#E4F0E9" },
  newsSourceText: { color: "#66736D", fontSize: 12, fontWeight: "600" },
  newsSourceTextActive: { color: "#15513F", fontWeight: "800" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(18, 63, 53, 0.45)",
    justifyContent: "flex-end"
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 22,
    paddingBottom: 32
  },
  modalTitle: { color: "#173D32", fontSize: 20, fontWeight: "800" },
  modalHint: { color: "#63716A", fontSize: 13, lineHeight: 18, marginTop: 6, marginBottom: 14 },
  inputLabel: { color: "#496158", fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: "#F4F7F5",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E8E3",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1E3029",
    marginBottom: 10
  },
  inputMultiline: { minHeight: 120, paddingTop: 12 },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 8
  }
});
