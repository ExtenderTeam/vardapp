import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";

const API = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
const tabs = [
  { key: "news", label: "Hírek", icon: "📰" },
  { key: "programs", label: "Programok", icon: "📅" },
  { key: "businesses", label: "Vállalkozások", icon: "🏪" },
  { key: "healthcare", label: "Orvosok", icon: "🏥" }
];

export default function App() {
  const [tab, setTab] = useState("news");
  const [news, setNews] = useState([]);
  const [meta, setMeta] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadNews = useCallback(async (refresh = false) => {
    try {
      setError("");
      const response = await fetch(`${API}/api/news${refresh ? "?refresh=1" : ""}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Nem sikerült betölteni a híreket.");
      setNews(body.items || []);
      setMeta(body.fetchedAt ? `Frissítve: ${new Date(body.fetchedAt).toLocaleString("hu-HU")}` : "");
    } catch (e) {
      setError(`${e.message} Ellenőrizd, hogy az API fut-e, és a telefon eléri-e a szerver IP-címét.`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadNews(); }, [loadNews]);

  const onRefresh = () => { setRefreshing(true); loadNews(true); };

  const renderNews = ({ item }) => (
    <Pressable style={styles.newsCard} onPress={() => item.url && Linking.openURL(item.url)}>
      <View style={styles.categoryRow}>
        <Text style={styles.category}>{item.category || "Helyi hírek"}</Text>
        <Text style={styles.date}>{item.date || ""}</Text>
      </View>
      <Text style={styles.newsTitle}>{item.title}</Text>
      {!!item.excerpt && <Text style={styles.excerpt} numberOfLines={3}>{item.excerpt}</Text>}
      <Text style={styles.readMore}>Eredeti cikk megnyitása ↗</Text>
    </Pressable>
  );

  const renderOther = () => {
    const content = {
      programs: ["Programok Kisvárdán", "A városi programnaptár bekötése következik."],
      businesses: ["Helyi vállalkozások", "Üzletek, éttermek és szolgáltatók adatbázisa."],
      healthcare: ["Orvosok és intézmények", "Rendelők, intézmények, elérhetőségek és nyitvatartás."]
    }[tab];
    return <View style={styles.empty}><Text style={styles.emptyIcon}>{tabs.find(t => t.key === tab)?.icon}</Text><Text style={styles.emptyTitle}>{content[0]}</Text><Text style={styles.emptyText}>{content[1]}</Text><Text style={styles.pending}>Fejlesztés alatt</Text></View>;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#123F35" />
      <ExpoStatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>V</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>VárdApp</Text>
          <Text style={styles.tagline}>Kisvárda a zsebedben</Text>
        </View>
        <Text style={styles.headerTown}>KISVÁRDA</Text>
      </View>
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>ÜDVÖZLÜNK</Text>
        <Text style={styles.heroTitle}>Minden fontos helyi információ, egy helyen.</Text>
        <Text style={styles.heroSub}>Hírek • programok • helyi szolgáltatások</Text>
      </View>
      <View style={styles.tabBar}>
        {tabs.map(t => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]}>
            <Text style={styles.tabIcon}>{t.icon}</Text>
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      {tab !== "news" ? renderOther() : (
        <View style={styles.content}>
          <View style={styles.sectionHeader}>
            <View><Text style={styles.sectionTitle}>Friss hírek</Text><Text style={styles.sectionSub}>Forrás: kisvarda.hu</Text></View>
            {!!meta && <Text style={styles.updated}>{meta}</Text>}
          </View>
          {loading ? <ActivityIndicator style={{ marginTop: 36 }} size="large" color="#176B52" /> :
            error ? <View style={styles.errorBox}><Text style={styles.errorTitle}>A hírek most nem érhetők el</Text><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => { setLoading(true); loadNews(); }} style={styles.retry}><Text style={styles.retryText}>Újrapróbálom</Text></Pressable></View> :
            <FlatList data={news} keyExtractor={(item, index) => item.id || String(index)} renderItem={renderNews} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#176B52" />} ListEmptyComponent={<Text style={styles.emptyText}>Még nincs megjeleníthető hír.</Text>} />
          }
        </View>
      )}
      <View style={styles.footer}><Text style={styles.footerText}>VárdApp · Kisvárda</Text><Text style={styles.footerSmall}>A hírek eredeti forrása: kisvarda.hu</Text></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F7F5" },
  header: { backgroundColor: "#123F35", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  brandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#D6E9A8", alignItems: "center", justifyContent: "center" },
  brandMarkText: { fontSize: 26, fontWeight: "900", color: "#123F35" },
  brand: { color: "#FFFFFF", fontWeight: "800", fontSize: 22, letterSpacing: 0.2 },
  tagline: { color: "#C9DED5", fontSize: 12, marginTop: 1 },
  headerTown: { color: "#D6E9A8", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  hero: { backgroundColor: "#176B52", paddingHorizontal: 22, paddingTop: 22, paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroEyebrow: { color: "#D6E9A8", fontSize: 10, fontWeight: "800", letterSpacing: 1.8, marginBottom: 8 },
  heroTitle: { color: "#FFFFFF", fontSize: 24, lineHeight: 30, fontWeight: "800", maxWidth: 330 },
  heroSub: { color: "#DDECE5", fontSize: 12, marginTop: 10 },
  tabBar: { flexDirection: "row", marginHorizontal: 12, marginTop: 14, marginBottom: 10, backgroundColor: "#FFFFFF", borderRadius: 16, padding: 5, elevation: 1 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 12 },
  tabActive: { backgroundColor: "#E4F0E9" },
  tabIcon: { fontSize: 18, marginBottom: 3 },
  tabLabel: { color: "#66736D", fontSize: 10, fontWeight: "600" },
  tabLabelActive: { color: "#15513F", fontWeight: "800" },
  content: { flex: 1, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8, paddingBottom: 10 },
  sectionTitle: { color: "#173D32", fontWeight: "800", fontSize: 21 },
  sectionSub: { color: "#788780", fontSize: 12, marginTop: 2 },
  updated: { color: "#7D8983", fontSize: 9, maxWidth: 115, textAlign: "right" },
  list: { paddingBottom: 12 },
  newsCard: { backgroundColor: "#FFFFFF", padding: 16, borderRadius: 17, marginBottom: 11, borderWidth: 1, borderColor: "#E7ECE8" },
  categoryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 },
  category: { color: "#176B52", backgroundColor: "#E4F0E9", overflow: "hidden", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: "800" },
  date: { color: "#8A958F", fontSize: 10 },
  newsTitle: { color: "#1E3029", fontSize: 16, lineHeight: 22, fontWeight: "800" },
  excerpt: { color: "#63716A", fontSize: 13, lineHeight: 19, marginTop: 7 },
  readMore: { color: "#176B52", fontWeight: "800", fontSize: 12, marginTop: 12 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  emptyIcon: { fontSize: 44, marginBottom: 14 },
  emptyTitle: { color: "#173D32", fontSize: 20, fontWeight: "800", textAlign: "center" },
  emptyText: { color: "#738078", fontSize: 14, textAlign: "center", lineHeight: 21, marginTop: 8 },
  pending: { marginTop: 16, color: "#176B52", fontWeight: "800", fontSize: 12, backgroundColor: "#E4F0E9", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, overflow: "hidden" },
  errorBox: { marginTop: 22, backgroundColor: "#FFFFFF", borderRadius: 16, padding: 18 },
  errorTitle: { color: "#9D312A", fontSize: 16, fontWeight: "800" },
  errorText: { color: "#5E6963", fontSize: 13, lineHeight: 19, marginTop: 8 },
  retry: { alignSelf: "flex-start", backgroundColor: "#176B52", borderRadius: 10, paddingHorizontal: 15, paddingVertical: 10, marginTop: 14 },
  retryText: { color: "#FFFFFF", fontWeight: "800" },
  footer: { paddingTop: 8, paddingBottom: 10, alignItems: "center" },
  footerText: { color: "#496158", fontSize: 11, fontWeight: "800" },
  footerSmall: { color: "#87938C", fontSize: 9, marginTop: 2 }
});
