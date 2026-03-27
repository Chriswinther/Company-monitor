import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, ScrollView, StyleSheet,
  RefreshControl, TouchableOpacity, ActivityIndicator,
  Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getEventFeed, getTodayTopCompanies, type TodayTopCompany } from '../services/api';
import { supabase } from '../services/supabase';
import { B, getScoreColor, formatDate } from '../theme';

interface CompanyEvent {
  event_id: string;
  company_id: string;
  company_name: string;
  cvr_number: string;
  event_type: string;
  description: string;
  detected_at: string;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
}

function getEventIcon(eventType: string): string {
  const icons: Record<string, string> = {
    CEO_CHANGED: '👔', MANAGEMENT_CHANGED: '👥', BOARD_MEMBER_ADDED: '➕',
    BOARD_MEMBER_REMOVED: '➖', EXECUTIVE_ADDED: '🚀', EXECUTIVE_REMOVED: '🚪',
    ADDRESS_CHANGED: '📍', STATUS_CHANGED: '⚠️', NAME_CHANGED: '✏️',
    OWNERSHIP_CHANGED: '🔄', FINANCIAL_REPORT_FILED: '📊',
    INDUSTRY_CHANGED: '🏢', EMPLOYEE_COUNT_CHANGED: '👥',
  };
  return icons[eventType] ?? '📰';
}

function getEventLabel(t: string): string {
  return t.replaceAll('_', ' ');
}

function getTodayLabel(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ─── Top Card ─────────────────────────────────────────────────────────────────

function TopCard({ item, rank, onPress }: { item: TodayTopCompany; rank: number; onPress: () => void }) {
  const scoreColor = getScoreColor(item.risk_score);
  return (
    <TouchableOpacity style={styles.topCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.topCardHeader}>
        <Text style={styles.topCardRank}>#{rank}</Text>
        <Text style={[styles.topCardScore, { color: scoreColor }]}>{Math.round(item.risk_score)}</Text>
      </View>
      <Text style={styles.topCardName} numberOfLines={2}>{item.company_name}</Text>
      {item.industry ? <Text style={styles.topCardIndustry} numberOfLines={1}>{item.industry}</Text> : null}
      <View style={styles.topCardFooter}>
        <Text style={styles.topCardEventIcon}>{getEventIcon(item.latest_event_type)}</Text>
        <Text style={styles.topCardEventCount}>{item.event_count} event{item.event_count !== 1 ? 's' : ''}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FeedScreen({ navigation }: any) {
  const [events, setEvents] = useState<CompanyEvent[]>([]);
  const [topCompanies, setTopCompanies] = useState<TodayTopCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [topLoading, setTopLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadTopCompanies = useCallback(async () => {
    try {
      setTopLoading(true);
      const data = await getTodayTopCompanies(5);
      setTopCompanies(data);
    } catch { setTopCompanies([]); }
    finally { setTopLoading(false); }
  }, []);

  const loadEvents = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);
      const data = await getEventFeed(50, 0);
      setEvents(data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load feed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadEvents(false);
    loadTopCompanies();
    const channel = supabase.channel('feed_events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'company_events' }, () => {
        loadEvents(true);
        loadTopCompanies();
      }).subscribe();
    subRef.current = channel;
    return () => { channel.unsubscribe(); };
  }, [loadEvents, loadTopCompanies]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadEvents(true);
    loadTopCompanies();
  }, [loadEvents, loadTopCompanies]);

  const navigateToDetail = useCallback((item: CompanyEvent) => {
    navigation.navigate('CompanyDetail', {
      cvrNumber: item.cvr_number, companyName: item.company_name,
      company: { id: item.company_id, cvr_number: item.cvr_number, name: item.company_name },
    });
  }, [navigation]);

  const navigateToDetailFromTop = useCallback((item: TodayTopCompany) => {
    navigation.navigate('CompanyDetail', {
      cvrNumber: item.cvr_number, companyName: item.company_name,
      company: { id: item.company_id, cvr_number: item.cvr_number, name: item.company_name },
    });
  }, [navigation]);

  const renderEvent = useCallback(({ item }: { item: CompanyEvent }) => (
    <TouchableOpacity style={styles.eventCard} activeOpacity={0.8} onPress={() => navigateToDetail(item)}>
      <View style={styles.eventHeader}>
        <View style={styles.iconWrap}>
          <Text style={styles.eventIcon}>{getEventIcon(item.event_type)}</Text>
        </View>
        <View style={styles.eventHeaderText}>
          <Text style={styles.companyName} numberOfLines={1}>{item.company_name}</Text>
          <Text style={styles.eventTime}>{formatDate(item.detected_at)}</Text>
        </View>
        <View style={styles.typePill}>
          <Text style={styles.typePillText} numberOfLines={2}>{getEventLabel(item.event_type)}</Text>
        </View>
      </View>
      <Text style={styles.eventDescription}>{item.description}</Text>
      <Text style={styles.eventCVR}>CVR {item.cvr_number}</Text>
    </TouchableOpacity>
  ), [navigateToDetail]);

  const keyExtractor = useCallback((item: CompanyEvent) => item.event_id, []);

  const ListHeader = (
    <View>
      {/* Boyden header */}
      <View style={styles.pageHeader}>
        <View style={styles.headerLeft}>
          <Image source={require('../../assets/boyden-logo.png')} style={styles.logo} resizeMode="contain" />
          <View style={styles.headerDivider} />
          <Text style={styles.headerTagline}>Executive Intelligence</Text>
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {/* Today's Top */}
      <View style={styles.todaySection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's Top Signals</Text>
          <Text style={styles.sectionSub}>{getTodayLabel()}</Text>
        </View>

        {topLoading ? (
          <View style={styles.topLoadingRow}>
            <ActivityIndicator size="small" color={B.blue} />
            <Text style={styles.topLoadingText}>Loading signals...</Text>
          </View>
        ) : topCompanies.length === 0 ? (
          <View style={styles.topEmptyRow}>
            <Text style={styles.topEmptyText}>No events detected today yet</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topScrollContent}>
            {topCompanies.map((item, i) => (
              <TopCard key={item.company_id} item={item} rank={i + 1} onPress={() => navigateToDetailFromTop(item)} />
            ))}
          </ScrollView>
        )}
      </View>

      {/* Feed label */}
      <View style={styles.feedLabelRow}>
        <Text style={styles.feedLabel}>Activity Feed</Text>
        <Text style={styles.feedCount}>{events.length} events</Text>
      </View>
    </View>
  );

  if (loading && events.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={B.blue} />
          <Text style={styles.loadingText}>Loading feed...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && events.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <View style={[styles.emptyIllustration, styles.emptyIllustrationError]}>
            <Text style={styles.emptyIllustrationIcon}>⚡</Text>
          </View>
          <Text style={styles.emptyTitle}>Connection Issue</Text>
          <Text style={styles.emptyText}>Could not reach the server. Check your connection and try again.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => loadEvents(false)}>
            <Text style={styles.btnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={events}
        renderItem={renderEvent}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIllustration}>
                <Text style={styles.emptyIllustrationIcon}>📡</Text>
              </View>
              <Text style={styles.emptyTitle}>Monitoring Active</Text>
              <Text style={styles.emptyText}>
                Your radar is running. Events will appear here as soon as changes are detected at your watched companies.
              </Text>
              <View style={styles.emptyHints}>
                <View style={styles.emptyHint}>
                  <Text style={styles.emptyHintDot}>·</Text>
                  <Text style={styles.emptyHintText}>Leadership changes</Text>
                </View>
                <View style={styles.emptyHint}>
                  <Text style={styles.emptyHintDot}>·</Text>
                  <Text style={styles.emptyHintText}>Ownership updates</Text>
                </View>
                <View style={styles.emptyHint}>
                  <Text style={styles.emptyHintDot}>·</Text>
                  <Text style={styles.emptyHintText}>Financial filings</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('Signals')}>
                <Text style={styles.btnText}>Browse Signals →</Text>
              </TouchableOpacity>
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        maxToRenderPerBatch={12}
        windowSize={10}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={B.blue} colors={[B.blue]} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: B.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText: { marginTop: 12, color: B.textMuted, fontSize: 14 },
  listContent: { paddingBottom: 40, flexGrow: 1 },

  // Page header with logo
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: B.pad,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: B.bgNavy,
    borderBottomWidth: 0,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerDivider: { width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.2)' },
  headerTagline: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  logo: { height: 34, width: 130, tintColor: '#FFFFFF' },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(22,163,74,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: B.radiusFull,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: B.success },
  liveText: { color: '#4ADE80', fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  // Today's top section
  todaySection: {
    backgroundColor: B.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: B.border,
    paddingBottom: 14,
  },
  sectionHeader: {
    paddingHorizontal: B.pad,
    paddingTop: 16,
    paddingBottom: 12,
  },
  sectionTitle: { color: B.textPrimary, fontSize: 16, fontWeight: '700' },
  sectionSub: { color: B.textMuted, fontSize: 12, marginTop: 2 },
  topScrollContent: { paddingHorizontal: B.pad, gap: 10 },
  topCard: {
    width: 148,
    backgroundColor: B.bgCardAlt,
    borderRadius: B.radius,
    padding: 13,
    borderWidth: 1,
    borderColor: B.border,
  },
  topCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  topCardRank: { color: B.textMuted, fontSize: 11, fontWeight: '700' },
  topCardScore: { fontSize: 20, fontWeight: '900' },
  topCardName: { color: B.textPrimary, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  topCardIndustry: { color: B.textMuted, fontSize: 10, marginTop: 3 },
  topCardFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10,
    paddingTop: 8, borderTopWidth: 1, borderTopColor: B.border,
  },
  topCardEventIcon: { fontSize: 11 },
  topCardEventCount: { color: B.textSecondary, fontSize: 10, fontWeight: '600' },
  topLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: B.pad, paddingVertical: 16 },
  topLoadingText: { color: B.textMuted, fontSize: 13 },
  topEmptyRow: { paddingHorizontal: B.pad, paddingVertical: 14 },
  topEmptyText: { color: B.textMuted, fontSize: 13 },

  // Feed label
  feedLabelRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: B.pad, paddingVertical: 12,
  },
  feedLabel: { color: B.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  feedCount: { color: B.textMuted, fontSize: 12 },

  // Event cards
  eventCard: {
    backgroundColor: B.bgCard,
    marginHorizontal: B.pad,
    marginBottom: 8,
    borderRadius: B.radius,
    padding: 14,
    borderWidth: 1,
    borderColor: B.border,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  eventHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: B.blueMuted,
    borderWidth: 1, borderColor: B.blueBorder,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10, flexShrink: 0,
  },
  eventIcon: { fontSize: 16 },
  eventHeaderText: { flex: 1, paddingRight: 8 },
  companyName: { fontSize: 14, fontWeight: '700', color: B.textPrimary, lineHeight: 20 },
  eventTime: { fontSize: 11, color: B.textMuted, marginTop: 2 },
  typePill: {
    backgroundColor: B.bgCardAlt, paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: B.radiusSm, maxWidth: 100, flexShrink: 0,
  },
  typePillText: { color: B.textSecondary, fontSize: 9, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.3 },
  eventDescription: { fontSize: 13, color: B.textSecondary, lineHeight: 19, marginBottom: 8 },
  eventCVR: { fontSize: 11, color: B.textMuted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  // Empty / error
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { color: B.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  emptyText: { color: B.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 20, maxWidth: 280 },
  btn: { backgroundColor: B.blue, paddingHorizontal: 22, paddingVertical: 12, borderRadius: B.radiusFull },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  emptyIllustration: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: B.blueMuted, borderWidth: 1, borderColor: B.blueBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyIllustrationError: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  emptyIllustrationIcon: { fontSize: 32 },
  emptyHints: { marginBottom: 24, alignSelf: 'flex-start', paddingLeft: 8 },
  emptyHint: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  emptyHintDot: { color: B.blue, fontSize: 18, fontWeight: '900', lineHeight: 20 },
  emptyHintText: { color: B.textSecondary, fontSize: 14 },
});