import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Platform, Pressable, Image, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getWatchlist, removeFromWatchlist, getStoredCompanySignalScore,
  getCompanyEvents, getCompanySignalScore, getAllCompaniesWithScores,
  type StoredCompanyRiskScore,
} from '../services/api';
import { supabase } from '../services/supabase';
import { B, getRiskColors, getScoreColor, formatDate } from '../theme';

interface WatchlistCompany {
  id: string; cvr_number: string; name: string; status: string | null;
  address: Record<string, any> | null; industry: string | null;
  employee_count: number | null; last_checked_at: string | null;
}
interface WatchlistItem {
  id: string; company_id: string; created_at: string;
  notification_enabled: boolean; company: WatchlistCompany[] | WatchlistCompany | null;
}
interface EnrichedWatchlistItem {
  watchlistItem: WatchlistItem | null; company: WatchlistCompany;
  score: StoredCompanyRiskScore | null;
  latestEventDescription: string | null; latestEventType: string | null; latestEventAt: string | null;
}

function getCompanyFromItem(item: WatchlistItem): WatchlistCompany | null {
  if (!item.company) return null;
  if (Array.isArray(item.company)) return item.company[0] ?? null;
  return item.company;
}

function getEventIcon(eventType: string | null): string {
  const icons: Record<string, string> = {
    CEO_CHANGED: '👔', MANAGEMENT_CHANGED: '👥', BOARD_MEMBER_ADDED: '➕',
    BOARD_MEMBER_REMOVED: '➖', ADDRESS_CHANGED: '📍', STATUS_CHANGED: '⚠️',
    NAME_CHANGED: '✏️', OWNERSHIP_CHANGED: '🔄', EMPLOYEE_COUNT_CHANGED: '👥',
  };
  return eventType ? (icons[eventType] ?? '📰') : '';
}

const ROW_HEIGHT = 52;

const WatchlistRow = React.memo(({ item, index, isRemoving, showRemove, onPress, onRemove }: {
  item: EnrichedWatchlistItem; index: number; isRemoving: boolean; showRemove: boolean;
  onPress: () => void; onRemove: () => void;
}) => {
  const { company, score, latestEventType, latestEventAt } = item;
  const scoreValue = score?.risk_score ?? null;
  const scoreColor = scoreValue !== null ? getScoreColor(scoreValue) : B.border;
  const riskColors = getRiskColors(score?.risk_level);

  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onPress}>
      <Text style={styles.rank}>#{index + 1}</Text>
      <View style={[styles.dot, { backgroundColor: riskColors.dot }]} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{company.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {company.cvr_number}{company.industry ? `  ·  ${company.industry}` : ''}
        </Text>
      </View>
      <View style={styles.rowEventCol}>
        {latestEventType ? (
          <>
            <Text style={styles.rowEventIcon}>{getEventIcon(latestEventType)}</Text>
            <Text style={styles.rowEventTime}>{formatDate(latestEventAt)}</Text>
          </>
        ) : (
          <Text style={styles.rowEventEmpty}>—</Text>
        )}
      </View>
      <Text style={[styles.rowScore, { color: scoreColor }]}>
        {scoreValue !== null ? Math.round(scoreValue) : '—'}
      </Text>
      {showRemove && (
        <Pressable
          style={({ pressed }) => [styles.removeBtn, pressed && styles.removeBtnActive, isRemoving && styles.btnDisabled]}
          onPress={(e) => { e.stopPropagation(); onRemove(); }}
          disabled={isRemoving}
          hitSlop={10}
        >
          <Text style={styles.removeBtnText}>✕</Text>
        </Pressable>
      )}
      {!showRemove && <View style={{ width: 28 }} />}
    </Pressable>
  );
});

export default function WatchlistScreen({ navigation }: any) {
  const [enriched, setEnriched] = useState<EnrichedWatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [filterSize, setFilterSize] = useState<string>('all');
  const [filterActivity, setFilterActivity] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('score');
  const [viewMode, setViewMode] = useState<'watchlist' | 'all'>('watchlist');
  const [scoring, setScoring] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const enrichedRef = useRef<EnrichedWatchlistItem[]>([]);
  useEffect(() => { enrichedRef.current = enriched; }, [enriched]);

  const loadData = useCallback(async () => {
    try {
      const watchlistData = await getWatchlist();
      const items = (watchlistData ?? []) as unknown as WatchlistItem[];
      const enrichedItems = await Promise.all(
        items.map(async (item): Promise<EnrichedWatchlistItem | null> => {
          const company = getCompanyFromItem(item);
          if (!company) return null;
          const [score, events] = await Promise.all([
            getStoredCompanySignalScore(company.id).catch(() => null),
            getCompanyEvents(company.id).catch(() => []),
          ]);
          const latestEvent = Array.isArray(events) && events.length > 0 ? events[0] : null;
          return {
            watchlistItem: item, company, score: score ?? null,
            latestEventDescription: latestEvent?.description ?? null,
            latestEventType: latestEvent?.event_type ?? null,
            latestEventAt: latestEvent?.detected_at ?? null,
          };
        })
      );
      setEnriched(
        enrichedItems
          .filter((i): i is EnrichedWatchlistItem => i !== null)
          .sort((a, b) => (b.score?.risk_score ?? -1) - (a.score?.risk_score ?? -1))
      );
      setLastUpdatedAt(new Date());
    } catch (error) {
      console.error('[WatchlistScreen] loadData error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadAllData = useCallback(async () => {
    try {
      const all = await getAllCompaniesWithScores();
      setEnriched(
        all.map(({ company, score }) => ({
          watchlistItem: null,
          company: company as WatchlistCompany,
          score: score ?? null,
          latestEventDescription: null,
          latestEventType: null,
          latestEventAt: null,
        })).sort((a, b) => (b.score?.risk_score ?? -1) - (a.score?.risk_score ?? -1))
      );
      setLastUpdatedAt(new Date());
    } catch (error) {
      console.error('[WatchlistScreen] loadAllData error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (viewMode === 'watchlist') await loadData();
    else await loadAllData();
  }, [viewMode, loadData, loadAllData]);

  // Background score refresh — recalculates via edge function in batches of 3
  const refreshScores = useCallback(async () => {
    const companies = enrichedRef.current.map((e) => e.company);
    if (!companies.length) return;
    setScoring(true);
    try {
      for (let i = 0; i < companies.length; i += 3) {
        await Promise.all(
          companies.slice(i, i + 3).map((c) => getCompanySignalScore(c.cvr_number).catch(() => null))
        );
        if (i + 3 < companies.length) await new Promise((r) => setTimeout(r, 500));
      }
      await load();
    } catch (e) {
      console.warn('[WatchlistScreen] refreshScores error:', e);
    } finally {
      setScoring(false);
    }
  }, [load]);

  // Auto-refresh scores every 10 minutes while screen is mounted
  const SCORE_POLL_MS = 10 * 60 * 1000;
  useEffect(() => {
    const t = setTimeout(refreshScores, 4000); // initial refresh shortly after mount
    const p = setInterval(refreshScores, SCORE_POLL_MS);
    return () => { clearTimeout(t); clearInterval(p); };
  }, [refreshScores]);

  // Reload every time the tab comes into focus so adds from other screens show immediately
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    const channel = supabase.channel('watchlist_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'watchlists' }, () => load())
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const handleOpen = useCallback((item: EnrichedWatchlistItem) => {
    navigation.navigate('CompanyDetail', {
      cvrNumber: item.company.cvr_number, companyName: item.company.name, company: item.company,
    });
  }, [navigation]);

  const handleRemove = useCallback(async (item: EnrichedWatchlistItem) => {
    if (!item.watchlistItem) return;
    try {
      setRemovingId(item.watchlistItem.id);
      await removeFromWatchlist(item.company.cvr_number);
      setEnriched((prev) => prev.filter((e) => e.watchlistItem.id !== item.watchlistItem.id));
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to remove');
    } finally { setRemovingId(null); }
  }, []);

  // ── Filtered + sorted data ─────────────────────────────────────────────────
  const filtered = React.useMemo(() => {
    let data = [...enriched];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      data = data.filter((i) =>
        i.company.name.toLowerCase().includes(q) ||
        i.company.cvr_number.includes(q) ||
        (i.company.industry ?? '').toLowerCase().includes(q)
      );
    }

    // Risk filter
    if (filterRisk !== 'all') {
      data = data.filter((i) => (i.score?.risk_level ?? 'low') === filterRisk);
    }

    // Size filter
    if (filterSize !== 'all') {
      data = data.filter((i) => {
        const emp = i.company.employee_count ?? 0;
        if (filterSize === '10-50') return emp >= 10 && emp < 50;
        if (filterSize === '50-250') return emp >= 50 && emp < 250;
        if (filterSize === '250-1000') return emp >= 250 && emp < 1000;
        if (filterSize === '1000+') return emp >= 1000;
        return true;
      });
    }

    // Activity filter
    if (filterActivity === '7days') {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      data = data.filter((i) => i.latestEventAt && new Date(i.latestEventAt).getTime() > cutoff);
    } else if (filterActivity === '30days') {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      data = data.filter((i) => i.latestEventAt && new Date(i.latestEventAt).getTime() > cutoff);
    } else if (filterActivity === 'none') {
      data = data.filter((i) => !i.latestEventAt);
    }

    // Sort
    if (sortBy === 'score') data.sort((a, b) => (b.score?.risk_score ?? -1) - (a.score?.risk_score ?? -1));
    else if (sortBy === 'name') data.sort((a, b) => a.company.name.localeCompare(b.company.name));
    else if (sortBy === 'recent') data.sort((a, b) => {
      if (!a.latestEventAt) return 1;
      if (!b.latestEventAt) return -1;
      return new Date(b.latestEventAt).getTime() - new Date(a.latestEventAt).getTime();
    });
    else if (sortBy === 'added') data.sort((a, b) =>
      new Date(b.watchlistItem.created_at).getTime() - new Date(a.watchlistItem.created_at).getTime()
    );

    return data;
  }, [enriched, searchQuery, filterRisk, filterSize, filterActivity, sortBy]);

  const hasActiveFilters = filterRisk !== 'all' || filterSize !== 'all' || filterActivity !== 'all' || sortBy !== 'score';

  const renderItem = useCallback(({ item, index }: { item: EnrichedWatchlistItem; index: number }) => (
    <WatchlistRow item={item} index={index}
      isRemoving={removingId === (item.watchlistItem?.id ?? '')}
      showRemove={!!item.watchlistItem}
      onPress={() => handleOpen(item)} onRemove={() => handleRemove(item)} />
  ), [removingId, handleOpen, handleRemove, filtered]);

  const keyExtractor = useCallback((item: EnrichedWatchlistItem) => item.watchlistItem.id, []);

  const ListHeader = (
    <View>
      {/* Page header */}
      <View style={styles.pageHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.logoPill}>
            <Image source={require('../../assets/boyden-logo.png')} style={styles.logo} resizeMode="contain" />
          </View>
          <View style={styles.headerDivider} />
          <Text style={styles.headerTagline}>Watchlist</Text>
        </View>
        <View style={styles.headerRight}>
          {/* View mode toggle */}
          <View style={styles.viewToggle}>
            <Pressable
              style={[styles.viewToggleBtn, viewMode === 'watchlist' && styles.viewToggleBtnActive]}
              onPress={() => { setViewMode('watchlist'); setLoading(true); }}
            >
              <Text style={[styles.viewToggleTxt, viewMode === 'watchlist' && styles.viewToggleTxtActive]}>Watchlist</Text>
            </Pressable>
            <Pressable
              style={[styles.viewToggleBtn, viewMode === 'all' && styles.viewToggleBtnActive]}
              onPress={() => { setViewMode('all'); setLoading(true); }}
            >
              <Text style={[styles.viewToggleTxt, viewMode === 'all' && styles.viewToggleTxtActive]}>All</Text>
            </Pressable>
          </View>
          <View style={styles.headerCount}>
            <Text style={styles.headerCountText}>{filtered.length}</Text>
            <Text style={styles.headerCountLabel}>
              {filtered.length !== enriched.length ? `of ${enriched.length}` : 'companies'}
            </Text>
          </View>
        </View>
      </View>
      {/* Scoring status bar */}
      {(scoring || lastUpdatedAt) && (
        <View style={styles.statusBar}>
          {scoring
            ? <><ActivityIndicator size="small" color={B.blue} style={{ marginRight: 6 }} /><Text style={styles.statusText}>Updating scores...</Text></>
            : <Text style={styles.statusText}>Scores updated {lastUpdatedAt ? Math.round((Date.now() - lastUpdatedAt.getTime()) / 60000) : 0}m ago</Text>
          }
        </View>
      )}

      {/* Search + filter bar */}
      {enriched.length > 0 && (
        <View style={styles.searchBar}>
          <View style={styles.searchInputWrap}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search company or CVR..."
              placeholderTextColor={B.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
          <Pressable
            style={[styles.filterToggle, showFilters && styles.filterToggleActive]}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Text style={[styles.filterToggleText, showFilters && styles.filterToggleTextActive]}>
              {showFilters ? '✕' : '⚙'}{hasActiveFilters ? ' •' : ''}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Collapsible filter panel */}
      {showFilters && enriched.length > 0 && (
        <View style={styles.filterPanel}>
          {/* Sort */}
          <Text style={styles.filterLabel}>Sort By</Text>
          <View style={styles.chipRow}>
            {[
              { key: 'score', label: '↓ Score' },
              { key: 'recent', label: '🕐 Recent' },
              { key: 'name', label: 'A–Z' },
              { key: 'added', label: '📅 Added' },
            ].map((c) => (
              <Pressable key={c.key} onPress={() => setSortBy(c.key)}
                style={[styles.chip, sortBy === c.key && styles.chipActive]}>
                <Text style={[styles.chipText, sortBy === c.key && styles.chipTextActive]}>{c.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Risk */}
          <Text style={styles.filterLabel}>Risk Level</Text>
          <View style={styles.chipRow}>
            {[
              { key: 'all', label: 'All' },
              { key: 'critical', label: '🔴 Critical' },
              { key: 'high', label: '🟠 High' },
              { key: 'moderate', label: '🟡 Moderate' },
              { key: 'low', label: '🟢 Low' },
            ].map((c) => (
              <Pressable key={c.key} onPress={() => setFilterRisk(c.key)}
                style={[styles.chip, filterRisk === c.key && styles.chipActive]}>
                <Text style={[styles.chipText, filterRisk === c.key && styles.chipTextActive]}>{c.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Size */}
          <Text style={styles.filterLabel}>Company Size</Text>
          <View style={styles.chipRow}>
            {[
              { key: 'all', label: 'All' },
              { key: '10-50', label: '10–50' },
              { key: '50-250', label: '50–250 ★' },
              { key: '250-1000', label: '250–1000' },
              { key: '1000+', label: '1000+' },
            ].map((c) => (
              <Pressable key={c.key} onPress={() => setFilterSize(c.key)}
                style={[styles.chip, filterSize === c.key && styles.chipActive]}>
                <Text style={[styles.chipText, filterSize === c.key && styles.chipTextActive]}>{c.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Activity */}
          <Text style={styles.filterLabel}>Recent Activity</Text>
          <View style={styles.chipRow}>
            {[
              { key: 'all', label: 'Any' },
              { key: '7days', label: 'Last 7 days' },
              { key: '30days', label: 'Last 30 days' },
              { key: 'none', label: 'No events' },
            ].map((c) => (
              <Pressable key={c.key} onPress={() => setFilterActivity(c.key)}
                style={[styles.chip, filterActivity === c.key && styles.chipActive]}>
                <Text style={[styles.chipText, filterActivity === c.key && styles.chipTextActive]}>{c.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Reset */}
          {hasActiveFilters && (
            <Pressable style={styles.resetBtn} onPress={() => {
              setFilterRisk('all'); setFilterSize('all');
              setFilterActivity('all'); setSortBy('score');
            }}>
              <Text style={styles.resetBtnText}>✕ Reset all filters</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Column headers */}
      {filtered.length > 0 && (
        <View style={styles.colHeader}>
          <Text style={[styles.colLabel, { width: 40 }]}>#</Text>
          <View style={{ width: 16 }} />
          <Text style={[styles.colLabel, { flex: 1 }]}>COMPANY</Text>
          <Text style={[styles.colLabel, { width: 60, textAlign: 'center' }]}>LAST EVENT</Text>
          <Text style={[styles.colLabel, { width: 42, textAlign: 'right' }]}>SCORE</Text>
          <View style={{ width: 36 }} />
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={B.blue} />
          <Text style={styles.loadingText}>Loading watchlist...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIllustration}>
              <Text style={styles.emptyIllustrationIcon}>🎯</Text>
            </View>
            <Text style={styles.emptyTitle}>Your Watchlist is Empty</Text>
            <Text style={styles.emptyText}>
              Add companies to track their signal scores, leadership changes and financial events in real time.
            </Text>
            <View style={styles.emptySteps}>
              <View style={styles.emptyStep}>
                <View style={styles.emptyStepNum}><Text style={styles.emptyStepNumText}>1</Text></View>
                <Text style={styles.emptyStepText}>Go to Signals tab</Text>
              </View>
              <View style={styles.emptyStep}>
                <View style={styles.emptyStepNum}><Text style={styles.emptyStepNumText}>2</Text></View>
                <Text style={styles.emptyStepText}>Search for a company</Text>
              </View>
              <View style={styles.emptyStep}>
                <View style={styles.emptyStepNum}><Text style={styles.emptyStepNumText}>3</Text></View>
                <Text style={styles.emptyStepText}>Tap Add to Watchlist</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('Signals')}>
              <Text style={styles.btnText}>Browse Signals →</Text>
            </TouchableOpacity>
          </View>
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews maxToRenderPerBatch={30} windowSize={15} initialNumToRender={40}
        getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={B.blue} colors={[B.blue]} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: B.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: B.textMuted, fontSize: 14 },
  listContent: { paddingBottom: Platform.OS === 'ios' ? 40 : 90, flexGrow: 1 },

  pageHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: B.pad, paddingTop: 18, paddingBottom: 14,
    backgroundColor: B.bgNavy, borderBottomWidth: 0,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerDivider: { width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.2)' },
  headerTagline: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  logoPill: { backgroundColor: '#FFFFFF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  logo: { height: 22, width: 100 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCount: { alignItems: 'flex-end' },
  headerCountText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', lineHeight: 24 },
  headerCountLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600' },
  viewToggle: {
    flexDirection: 'row', borderRadius: B.radiusSm,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', overflow: 'hidden',
  },
  viewToggleBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(255,255,255,0.08)' },
  viewToggleBtnActive: { backgroundColor: B.blue },
  viewToggleTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700' },
  viewToggleTxtActive: { color: '#fff' },
  statusBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: B.pad, paddingVertical: 5,
    backgroundColor: B.bgCardAlt, borderBottomWidth: 1, borderBottomColor: B.border,
  },
  statusText: { color: B.textMuted, fontSize: 11 },

  colHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: B.pad, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: B.border, backgroundColor: B.bgCardAlt,
  },
  colLabel: { color: B.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },

  row: {
    height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: B.pad, borderBottomWidth: 1, borderBottomColor: B.border,
    backgroundColor: B.bgCard, gap: 8,
  },
  rowPressed: { backgroundColor: B.bgCardAlt },
  rank: { width: 32, color: B.textMuted, fontSize: 10, fontWeight: '700' },
  dot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  rowInfo: { flex: 1, justifyContent: 'center' },
  rowName: { color: B.textPrimary, fontSize: 13, fontWeight: '700', lineHeight: 17 },
  rowSub: { color: B.textMuted, fontSize: 10, lineHeight: 14, marginTop: 1 },
  rowEventCol: { width: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  rowEventIcon: { fontSize: 11 },
  rowEventTime: { color: B.textSecondary, fontSize: 10, fontWeight: '600' },
  rowEventEmpty: { color: B.border, fontSize: 13 },
  rowScore: { width: 42, fontSize: 15, fontWeight: '900', textAlign: 'right' },
  removeBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  removeBtnActive: { backgroundColor: '#FEE2E2' },
  btnDisabled: { opacity: 0.4 },
  removeBtnText: { color: B.textMuted, fontSize: 11, fontWeight: '800' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 },
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
  emptyIllustrationIcon: { fontSize: 32 },
  emptySteps: { marginBottom: 24, gap: 10, alignSelf: 'stretch', paddingHorizontal: 8 },
  emptyStep: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyStepNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: B.blue, alignItems: 'center', justifyContent: 'center',
  },
  emptyStepNumText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  emptyStepText: { color: B.textSecondary, fontSize: 14 },

  // Search + filter
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: B.pad, paddingVertical: 8,
    backgroundColor: B.bgCard, borderBottomWidth: 1, borderBottomColor: B.border,
  },
  searchInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: B.bgInput, borderRadius: B.radiusSm,
    borderWidth: 1, borderColor: B.border, paddingHorizontal: 10, height: 36,
  },
  searchIcon: { fontSize: 13, marginRight: 6 },
  searchInput: { flex: 1, color: B.textPrimary, fontSize: 13, height: 36 },
  filterToggle: {
    width: 36, height: 36, borderRadius: B.radiusSm,
    backgroundColor: B.bgCardAlt, borderWidth: 1, borderColor: B.border,
    alignItems: 'center', justifyContent: 'center',
  },
  filterToggleActive: { backgroundColor: B.blueMuted, borderColor: B.blue },
  filterToggleText: { color: B.textSecondary, fontSize: 14, fontWeight: '700' },
  filterToggleTextActive: { color: B.blue },

  filterPanel: {
    backgroundColor: B.bgCard, borderBottomWidth: 1, borderBottomColor: B.border,
    paddingHorizontal: B.pad, paddingVertical: 12,
  },
  filterLabel: {
    color: B.textSecondary, fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 2 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: B.radiusFull,
    backgroundColor: B.bgCardAlt, borderWidth: 1, borderColor: B.border,
  },
  chipActive: { backgroundColor: B.blueMuted, borderColor: B.blue },
  chipText: { color: B.textSecondary, fontSize: 11, fontWeight: '600' },
  chipTextActive: { color: B.blue },
  resetBtn: {
    marginTop: 10, paddingVertical: 8, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: B.border,
  },
  resetBtnText: { color: B.riskCritical, fontSize: 12, fontWeight: '700' },
});