import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Platform, Pressable,
  RefreshControl, StyleSheet, Text, TextInput, View,
  type ListRenderItemInfo,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAllCompaniesForSignals, getCompanySignalScore, searchCompanies, addToWatchlist, type RankedCompany, type RiskLevel, type CompanySearchResult } from '../services/api';
import { B, getRiskColors, getScoreColor } from '../theme';

type SortOption = 'score_desc' | 'score_asc' | 'name_asc';
type FilterLevel = 'all' | 'critical' | 'high' | 'moderate' | 'low';
type EmployeeRange = 'all' | '10-50' | '50-250' | '250-1000' | '1000+';
type ScoreFilter = 'all' | '40plus' | '60plus';

const PAGE_SIZE = 20;

const SORT_CHIPS = [
  { key: 'score_desc' as SortOption, label: '↓ Highest' },
  { key: 'score_asc' as SortOption, label: '↑ Lowest' },
  { key: 'name_asc' as SortOption, label: 'A–Z' },
];

const FILTER_CHIPS = [
  { key: 'all' as FilterLevel, label: 'All Risk' },
  { key: 'critical' as FilterLevel, label: '🔴 Critical' },
  { key: 'high' as FilterLevel, label: '🟠 High' },
  { key: 'moderate' as FilterLevel, label: '🟡 Moderate' },
  { key: 'low' as FilterLevel, label: '🟢 Low' },
];

const EMPLOYEE_CHIPS = [
  { key: 'all' as EmployeeRange, label: 'All Sizes' },
  { key: '10-50' as EmployeeRange, label: '10–50' },
  { key: '50-250' as EmployeeRange, label: '50–250 ★' },
  { key: '250-1000' as EmployeeRange, label: '250–1000' },
  { key: '1000+' as EmployeeRange, label: '1000+' },
];

const SCORE_CHIPS = [
  { key: 'all' as ScoreFilter, label: 'Any Score' },
  { key: '40plus' as ScoreFilter, label: 'Score 40+' },
  { key: '60plus' as ScoreFilter, label: 'Score 60+' },
];

function getRankStyle(rank: number) {
  if (rank === 1) return { color: '#B8860B', weight: '900' as const };
  if (rank === 2) return { color: '#708090', weight: '800' as const };
  if (rank === 3) return { color: '#8B6914', weight: '800' as const };
  return { color: B.textMuted, weight: '600' as const };
}

interface SignalCardProps {
  item: RankedCompany;
  rank: number;
  onPress: () => void;
}

const SignalCard = React.memo(({ item, rank, onPress }: SignalCardProps) => {
  const riskColors = getRiskColors(item.risk_level);
  const scoreColor = getScoreColor(item.risk_score);
  const rankStyle = getRankStyle(rank);

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={onPress}>
      {/* Rank */}
      <View style={styles.cardRank}>
        <Text style={[styles.rankText, { color: rankStyle.color, fontWeight: rankStyle.weight }]}>#{rank}</Text>
      </View>

      {/* Info */}
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.cardMeta}>
          {item.industry ? <Text style={styles.cardIndustry} numberOfLines={1}>{item.industry}</Text> : null}
          {item.cvr_number ? <Text style={styles.cardCvr}>CVR {item.cvr_number}</Text> : null}
        </View>
        <View style={[styles.riskPill, { backgroundColor: riskColors.bg, borderColor: riskColors.border }]}>
          <View style={[styles.riskDot, { backgroundColor: riskColors.dot }]} />
          <Text style={[styles.riskPillText, { color: riskColors.text }]}>
            {(item.risk_level ?? 'unknown').toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Score */}
      <View style={styles.cardScore}>
        <Text style={[styles.scoreValue, { color: scoreColor }]}>{Math.round(item.risk_score)}</Text>
        <Text style={styles.scoreLabel}>SCORE</Text>
      </View>
    </Pressable>
  );
});

const SCORE_POLL_MS = 10 * 60 * 1000;

export default function SearchScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [allCompanies, setAllCompanies] = useState<RankedCompany[]>([]);
  const [ranked, setRanked] = useState<RankedCompany[]>([]);
  const [searchResults, setSearchResults] = useState<CompanySearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('score_desc');
  const [filterLevel, setFilterLevel] = useState<FilterLevel>('all');
  const [employeeRange, setEmployeeRange] = useState<EmployeeRange>('all');
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ added: number; failed: number } | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allCompaniesRef = useRef<RankedCompany[]>([]);
  const isSearchMode = query.trim().length > 0;

  const applyFilters = useCallback((data: RankedCompany[]) => {
    let sorted = [...data];
    if (sortBy === 'score_desc') sorted.sort((a, b) => b.risk_score - a.risk_score);
    else if (sortBy === 'score_asc') sorted.sort((a, b) => a.risk_score - b.risk_score);
    else if (sortBy === 'name_asc') sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (filterLevel !== 'all') sorted = sorted.filter((c) => (c.risk_level ?? '').toLowerCase() === filterLevel);
    if (employeeRange !== 'all') {
      sorted = sorted.filter((c) => {
        const emp = c.employee_count ?? 0;
        if (employeeRange === '10-50') return emp >= 10 && emp < 50;
        if (employeeRange === '50-250') return emp >= 50 && emp < 250;
        if (employeeRange === '250-1000') return emp >= 250 && emp < 1000;
        if (employeeRange === '1000+') return emp >= 1000;
        return true;
      });
    }
    if (scoreFilter === '40plus') sorted = sorted.filter((c) => c.risk_score >= 40);
    if (scoreFilter === '60plus') sorted = sorted.filter((c) => c.risk_score >= 60);
    return sorted;
  }, [sortBy, filterLevel, employeeRange, scoreFilter]);

  const fetchRanked = useCallback(async (reset = false) => {
    try {
      if (reset) { setLoading(true); setError(null); }
      const data = await getAllCompaniesForSignals();
      allCompaniesRef.current = data;
      setAllCompanies(data);
      setRanked(applyFilters(data));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally { setLoading(false); setRefreshing(false); }
  }, [applyFilters]);

  // Background score refresh — recalculates via edge function in batches of 3
  const refreshScores = useCallback(async () => {
    const companies = allCompaniesRef.current;
    if (!companies.length) return;
    setScoring(true);
    try {
      for (let i = 0; i < companies.length; i += 3) {
        await Promise.all(
          companies.slice(i, i + 3).map((c) => getCompanySignalScore(c.cvr_number).catch(() => null))
        );
        if (i + 3 < companies.length) await new Promise((r) => setTimeout(r, 500));
      }
      await fetchRanked(false);
    } catch (e) {
      console.warn('[SearchScreen] refreshScores error:', e);
    } finally {
      setScoring(false);
    }
  }, [fetchRanked]);

  const fetchSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    try {
      setSearchLoading(true);
      const results = await searchCompanies(q.trim());
      setSearchResults(results);
    } catch { setSearchResults([]); }
    finally { setSearchLoading(false); }
  }, []);

  // Re-apply filters whenever sort/filter state changes without refetching
  useEffect(() => { setRanked(applyFilters(allCompaniesRef.current)); }, [applyFilters]);

  // Initial load
  useEffect(() => { fetchRanked(true); }, []);

  // Auto-refresh scores every 10 minutes
  useEffect(() => {
    const t = setTimeout(refreshScores, 4000);
    const p = setInterval(refreshScores, SCORE_POLL_MS);
    return () => { clearTimeout(t); clearInterval(p); };
  }, [refreshScores]);

  // Reload when tab comes into focus
  useFocusEffect(useCallback(() => { fetchRanked(false); }, [fetchRanked]));

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim()) { setSearchResults([]); return; }
    searchTimerRef.current = setTimeout(() => fetchSearch(query), 350);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [query, fetchSearch]);

  const onRefresh = useCallback(() => { setRefreshing(true); fetchRanked(true); }, [fetchRanked]);

  const navigateToDetail = useCallback((item: RankedCompany | CompanySearchResult) => {
    navigation.navigate('CompanyDetail', {
      cvrNumber: (item as RankedCompany).cvr_number ?? (item as CompanySearchResult).cvr_number,
      companyName: item.name, company: item,
    });
  }, [navigation]);

  const handleBulkAdd = useCallback(async () => {
    if (allCompanies.length === 0) return;
    const confirmed =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(`Add all ${allCompanies.length} companies to your watchlist?`)
        : await new Promise<boolean>((resolve) =>
            Alert.alert(
              'Add All to Watchlist',
              `Add ${allCompanies.length} companies to your watchlist?`,
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Add All', onPress: () => resolve(true) },
              ]
            )
          );
    if (!confirmed) return;
    try {
      setBulkAdding(true);
      setBulkResult(null);
      let added = 0; let failed = 0;
      await Promise.all(
        allCompanies.map(async (company) => {
          try {
            await addToWatchlist(company.cvr_number);
            added++;
          } catch { failed++; }
        })
      );
      setBulkResult({ added, failed });
      setTimeout(() => setBulkResult(null), 4000);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Bulk add failed');
    } finally { setBulkAdding(false); }
  }, [ranked]);

  const renderRanked = useCallback(({ item, index }: ListRenderItemInfo<RankedCompany>) => (
    <SignalCard item={item} rank={index + 1} onPress={() => navigateToDetail(item)} />
  ), [navigateToDetail]);

  const renderSearch = useCallback(({ item }: ListRenderItemInfo<CompanySearchResult>) => (
    <Pressable style={({ pressed }) => [styles.searchCard, pressed && styles.cardPressed]} onPress={() => navigateToDetail(item)}>
      <View style={styles.searchCardInfo}>
        <Text style={styles.searchCardName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.searchCardMeta}>CVR {item.cvr_number}{item.industry ? `  ·  ${item.industry}` : ''}</Text>
      </View>
      <Text style={styles.searchArrow}>›</Text>
    </Pressable>
  ), [navigateToDetail]);

  const ListHeader = useCallback(() => (
    <View>
      {!isSearchMode && (
        <>
          {/* Scoring indicator */}
          {scoring && (
            <View style={styles.scoringBar}>
              <ActivityIndicator size="small" color={B.blue} />
              <Text style={styles.scoringText}>Updating scores...</Text>
            </View>
          )}

          {/* Row 1: Sort + Advanced toggle */}
          <View style={styles.filterBar}>
            <View style={styles.chipsRow}>
              {SORT_CHIPS.map((chip) => (
                <Pressable key={chip.key} onPress={() => setSortBy(chip.key)}
                  style={[styles.chip, sortBy === chip.key && styles.chipActive]}>
                  <Text style={[styles.chipText, sortBy === chip.key && styles.chipTextActive]}>{chip.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.advancedToggle, showAdvanced && styles.advancedToggleActive]}
              onPress={() => setShowAdvanced(!showAdvanced)}
            >
              <Text style={[styles.advancedToggleText, showAdvanced && styles.advancedToggleTextActive]}>
                {showAdvanced ? '✕ Filters' : '⚙ Filters'}
                {(filterLevel !== 'all' || employeeRange !== 'all' || scoreFilter !== 'all') ? ' •' : ''}
              </Text>
            </Pressable>
          </View>

          {/* Advanced filters panel */}
          {showAdvanced && (
            <View style={styles.advancedPanel}>
              <Text style={styles.filterGroupLabel}>Risk Level</Text>
              <View style={styles.chipsRow}>
                {FILTER_CHIPS.map((chip) => (
                  <Pressable key={chip.key} onPress={() => setFilterLevel(chip.key)}
                    style={[styles.chip, filterLevel === chip.key && styles.chipActive]}>
                    <Text style={[styles.chipText, filterLevel === chip.key && styles.chipTextActive]}>{chip.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.filterGroupLabel}>Company Size <Text style={styles.filterGroupHint}>(employees)</Text></Text>
              <View style={styles.chipsRow}>
                {EMPLOYEE_CHIPS.map((chip) => (
                  <Pressable key={chip.key} onPress={() => setEmployeeRange(chip.key)}
                    style={[styles.chip, employeeRange === chip.key && styles.chipActive]}>
                    <Text style={[styles.chipText, employeeRange === chip.key && styles.chipTextActive]}>{chip.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.filterGroupNote}>★ 50–250 is Boyden's primary target range</Text>

              <Text style={styles.filterGroupLabel}>Minimum Score</Text>
              <View style={styles.chipsRow}>
                {SCORE_CHIPS.map((chip) => (
                  <Pressable key={chip.key} onPress={() => setScoreFilter(chip.key)}
                    style={[styles.chip, scoreFilter === chip.key && styles.chipActive]}>
                    <Text style={[styles.chipText, scoreFilter === chip.key && styles.chipTextActive]}>{chip.label}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Active filter summary + reset */}
              {(filterLevel !== 'all' || employeeRange !== 'all' || scoreFilter !== 'all') && (
                <Pressable style={styles.resetBtn} onPress={() => {
                  setFilterLevel('all'); setEmployeeRange('all'); setScoreFilter('all');
                }}>
                  <Text style={styles.resetBtnText}>✕ Reset all filters</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Top 3 spotlight */}
          {!loading && ranked.length >= 3 && (
            <View style={styles.spotlightWrap}>
              <Text style={styles.spotlightTitle}>Top 3 Today</Text>
              <View style={styles.spotlightRow}>
                {ranked.slice(0, 3).map((item, i) => (
                  <Pressable key={item.id} style={({ pressed }) => [styles.spotlightCard, pressed && styles.cardPressed]}
                    onPress={() => navigateToDetail(item)}>
                    <Text style={[styles.spotlightRank, { color: getRankStyle(i + 1).color }]}>#{i + 1}</Text>
                    <Text style={styles.spotlightName} numberOfLines={2}>{item.name}</Text>
                    <Text style={[styles.spotlightScore, { color: getScoreColor(item.risk_score) }]}>
                      {Math.round(item.risk_score)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {!loading && (
            <View style={styles.feedLabelRow}>
              <Text style={styles.feedLabel}>All Companies</Text>
              <Text style={styles.feedCount}>
                {ranked.length !== allCompanies.length
                  ? `${ranked.length} of ${allCompanies.length}`
                  : `${allCompanies.length} total`}
              </Text>
            </View>
          )}

          {/* Bulk add bar */}
          {!loading && allCompanies.length > 0 && (
            <View style={styles.bulkBar}>
              {bulkResult ? (
                <View style={styles.bulkResult}>
                  <Text style={styles.bulkResultText}>
                    ✅ Added {bulkResult.added} companies{bulkResult.failed > 0 ? ` · ${bulkResult.failed} already watched` : ''}
                  </Text>
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.bulkBtn, (pressed || bulkAdding) && styles.bulkBtnActive]}
                  onPress={handleBulkAdd}
                  disabled={bulkAdding}
                >
                  {bulkAdding ? (
                    <ActivityIndicator size="small" color={B.blue} />
                  ) : (
                    <Text style={styles.bulkBtnText}>
                      + Add all {allCompanies.length} to Watchlist
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          )}
        </>
      )}

    </View>
  ), [isSearchMode, sortBy, filterLevel, employeeRange, scoreFilter, showAdvanced, loading, scoring, ranked, allCompanies, navigateToDetail, handleBulkAdd, bulkAdding, bulkResult]);

  if (loading && ranked.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={B.blue} />
        <Text style={styles.loadingText}>Loading signals...</Text>
      </View>
    );
  }

  if (error && ranked.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyIcon}>⚠️</Text>
        <Text style={styles.emptyTitle}>Failed to load</Text>
        <Text style={styles.emptyText}>{error}</Text>
        <Pressable style={styles.retryBtn} onPress={() => fetchRanked(true)}>
          <Text style={styles.retryBtnText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Page header — static, never re-renders */}
      <View style={styles.pageHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.logoPill}>
            <Image source={require('../../assets/boyden-logo.png')} style={styles.logo} resizeMode="contain" />
          </View>
          <View style={styles.headerDivider} />
          <Text style={styles.headerTagline}>Signal Leaderboard</Text>
        </View>
      </View>

      {/* Search bar — outside FlatList so it never loses focus */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search companies or CVR..."
          placeholderTextColor={B.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {searchLoading && <ActivityIndicator size="small" color={B.blue} style={{ marginLeft: 8 }} />}
      </View>

      {isSearchMode && (
        <Text style={styles.searchModeLabel}>Results for "{query}"</Text>
      )}

      {isSearchMode ? (
        <FlatList data={searchResults} keyExtractor={(i) => i.id} renderItem={renderSearch}
          ListHeaderComponent={ListHeader} keyboardShouldPersistTaps="handled" ListEmptyComponent={
            loading ? null : (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIllustration}>
                <Text style={styles.emptyIllustrationIcon}>🔍</Text>
              </View>
              <Text style={styles.emptyTitle}>No Results Found</Text>
              <Text style={styles.emptyText}>Try searching by company name or enter a CVR number directly (e.g. 39823977)</Text>
            </View>
          )
          }
          contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} />
      ) : (
        <FlatList data={ranked} keyExtractor={(i) => i.id} renderItem={renderRanked}
          ListHeaderComponent={ListHeader} keyboardShouldPersistTaps="handled"
          ListEmptyComponent={loading ? null : (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIllustration}>
                <Text style={styles.emptyIllustrationIcon}>📊</Text>
              </View>
              <Text style={styles.emptyTitle}>No Signal Data Yet</Text>
              <Text style={styles.emptyText}>Search for a company and add it to your watchlist. Signal scores are calculated automatically.</Text>
            </View>
          )}
          contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}
          removeClippedSubviews maxToRenderPerBatch={12} windowSize={10}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={B.blue} colors={[B.blue]} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: B.bg },
  centered: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: B.textMuted, fontSize: 14 },
  listContent: { paddingBottom: 40, flexGrow: 1 },

  scoringBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 6, paddingHorizontal: B.pad,
    backgroundColor: B.blueMuted, borderBottomWidth: 1, borderBottomColor: B.blueBorder,
  },
  scoringText: { color: B.blue, fontSize: 12, fontWeight: '600' },

  // Page header
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

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: B.bgInput, borderRadius: B.radius,
    borderWidth: 1, borderColor: B.border,
    margin: B.pad, marginBottom: 8, paddingHorizontal: 12, height: 44,
  },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: { flex: 1, color: B.textPrimary, fontSize: 14, height: 44 },

  // Chips
  chipsRow: { flexDirection: 'row', paddingHorizontal: B.pad, gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: B.radiusFull,
    backgroundColor: B.bgCardAlt, borderWidth: 1, borderColor: B.border,
  },
  chipActive: { backgroundColor: B.blueMuted, borderColor: B.blue },
  chipText: { color: B.textSecondary, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: B.blue },

  filterBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: B.pad, marginBottom: 6, gap: 8 },
  advancedToggle: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: B.radiusFull,
    backgroundColor: B.bgCardAlt, borderWidth: 1, borderColor: B.border, flexShrink: 0,
  },
  advancedToggleActive: { backgroundColor: B.blueMuted, borderColor: B.blue },
  advancedToggleText: { color: B.textSecondary, fontSize: 12, fontWeight: '600' },
  advancedToggleTextActive: { color: B.blue },

  advancedPanel: {
    marginHorizontal: B.pad, marginBottom: 8,
    backgroundColor: B.bgCard, borderRadius: B.radius,
    borderWidth: 1, borderColor: B.border, padding: 14,
    shadowColor: B.blue, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  filterGroupLabel: { color: B.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },
  filterGroupHint: { color: B.textMuted, fontWeight: '400', textTransform: 'none', letterSpacing: 0 },
  filterGroupNote: { color: B.blue, fontSize: 11, fontWeight: '600', marginBottom: 10, marginTop: -4 },
  resetBtn: {
    marginTop: 10, paddingVertical: 8, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: B.border,
  },
  resetBtnText: { color: B.riskCritical, fontSize: 12, fontWeight: '700' },

  // Spotlight
  spotlightWrap: { paddingHorizontal: B.pad, marginBottom: 6, marginTop: 2 },
  spotlightTitle: { color: B.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  spotlightRow: { flexDirection: 'row', gap: 6 },
  spotlightCard: {
    flex: 1, backgroundColor: B.bgCard, borderRadius: B.radius, padding: 8,
    borderWidth: 1, borderColor: B.border, alignItems: 'center', gap: 2,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  spotlightRank: { fontSize: 10, fontWeight: '800' },
  spotlightName: { color: B.textSecondary, fontSize: 10, fontWeight: '600', textAlign: 'center', lineHeight: 13 },
  spotlightScore: { fontSize: 16, fontWeight: '900' },

  // Feed label
  feedLabelRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: B.pad, marginBottom: 6,
  },
  feedLabel: { color: B.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  feedCount: { color: B.textMuted, fontSize: 12 },

  // Signal card
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: B.bgCard, marginHorizontal: B.pad, marginBottom: 1,
    borderRadius: B.radiusSm, paddingVertical: 5, paddingHorizontal: 8,
    borderWidth: 1, borderColor: B.border,
    elevation: 0,
  },
  cardPressed: { opacity: 0.75, backgroundColor: B.bgCardAlt },
  cardRank: { width: 26, alignItems: 'center' },
  rankText: { fontSize: 10 },
  cardInfo: { flex: 1, marginLeft: 5, marginRight: 5 },
  cardName: { color: B.textPrimary, fontSize: 12, fontWeight: '700', marginBottom: 1 },
  cardMeta: { flexDirection: 'row', gap: 4, marginBottom: 3, flexWrap: 'wrap' },
  cardIndustry: { color: B.textMuted, fontSize: 9 },
  cardCvr: { color: B.textMuted, fontSize: 8, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  riskPill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    borderWidth: 1, borderRadius: B.radiusFull, paddingHorizontal: 5, paddingVertical: 1, gap: 3,
  },
  riskDot: { width: 4, height: 4, borderRadius: 2 },
  riskPillText: { fontSize: 7, fontWeight: '800', letterSpacing: 0.4 },
  cardScore: { alignItems: 'center', minWidth: 32 },
  scoreValue: { fontSize: 15, fontWeight: '900', lineHeight: 18 },
  scoreLabel: { color: B.textMuted, fontSize: 7, fontWeight: '700', letterSpacing: 1, marginTop: 1 },

  // Search result
  searchCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: B.bgCard, marginHorizontal: B.pad, marginBottom: 6,
    borderRadius: B.radius, padding: 14, borderWidth: 1, borderColor: B.border,
  },
  searchCardInfo: { flex: 1 },
  searchCardName: { color: B.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 3 },
  searchCardMeta: { color: B.textMuted, fontSize: 12 },
  searchArrow: { color: B.textMuted, fontSize: 22, marginLeft: 10 },
  searchModeLabel: { color: B.textMuted, fontSize: 12, fontWeight: '600', paddingHorizontal: B.pad, marginBottom: 8 },

  // Footer + empty
  footerLoader: { paddingVertical: 20, alignItems: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { color: B.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  emptyText: { color: B.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 21, maxWidth: 280 },
  bulkBar: { paddingHorizontal: B.pad, paddingBottom: 8 },
  bulkBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: B.blue, borderRadius: B.radiusFull,
    paddingVertical: 9, paddingHorizontal: 16, gap: 6,
    backgroundColor: B.blueMuted,
  },
  bulkBtnActive: { opacity: 0.7 },
  bulkBtnText: { color: B.blue, fontSize: 13, fontWeight: '700' },
  bulkResult: {
    alignItems: 'center', paddingVertical: 8,
    backgroundColor: '#F0FDF4', borderRadius: B.radiusFull,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  bulkResultText: { color: B.success, fontSize: 13, fontWeight: '600' },
  retryBtn: { marginTop: 16, backgroundColor: B.blue, paddingHorizontal: 22, paddingVertical: 12, borderRadius: B.radiusFull },
  retryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  emptyIllustration: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: B.blueMuted, borderWidth: 1, borderColor: B.blueBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyIllustrationIcon: { fontSize: 28 },
});