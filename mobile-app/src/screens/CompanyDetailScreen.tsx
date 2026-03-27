import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  ScrollView, TouchableOpacity, Alert, Platform,
  PanResponder,
} from 'react-native';
import Svg, { Polyline, Line, Circle, Text as SvgText } from 'react-native-svg';
import {
  addToWatchlist, removeFromWatchlist, isCompanyInWatchlist,
  getCompanyByCVR, getCompanySignalScore, getStoredCompanySignalScore, getCompanyEvents,
  getCompanyScoreHistory,
  type CompanySignalScoreV2, type EventType, type ScoreHistoryPoint,
} from '../services/api';
import { B, getRiskColors, getScoreColor, formatDate } from '../theme';
import AIInsightCard from '../components/AIInsightCard';
import NewsCard from '../components/NewsCard';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyEvent {
  id: string;
  company_id: string;
  event_type: EventType;
  description: string;
  detected_at: string;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeCvr(value: unknown): string {
  if (typeof value === 'number') return String(value).replace(/\D/g, '');
  if (typeof value === 'string') return value.replace(/\D/g, '');
  return '';
}

function firstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
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

function getOpportunityColors(type?: string) {
  switch ((type ?? '').toLowerCase()) {
    case 'growth':     return { bg: '#F0FDF4', border: '#BBF7D0', text: '#16A34A' };
    case 'transition': return { bg: '#EFF6FF', border: '#BFDBFE', text: '#2563EB' };
    case 'turnaround': return { bg: '#FFF7ED', border: '#FED7AA', text: '#EA580C' };
    default:           return { bg: B.bgCardAlt, border: B.border, text: B.textMuted };
  }
}

// ─── Sparkline Chart ─────────────────────────────────────────────────────────

function ScoreSparkline({ history }: { history: ScoreHistoryPoint[] }) {
  const WIDTH = 300;
  const HEIGHT = 80;
  const TOOLTIP_H = 36;
  const PADDING = { top: 12, bottom: 20, left: 8, right: 8 };

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  if (history.length < 2) {
    return (
      <View style={styles.sparklineEmpty}>
        <Text style={styles.sparklineEmptyText}>
          Not enough data yet — score history builds up over time
        </Text>
      </View>
    );
  }

  const scores = history.map((h) => h.score);
  const minScore = Math.max(0, Math.min(...scores) - 5);
  const maxScore = Math.min(100, Math.max(...scores) + 5);
  const range = maxScore - minScore || 1;

  const plotW = WIDTH - PADDING.left - PADDING.right;
  const plotH = HEIGHT - PADDING.top - PADDING.bottom;

  const toX = (i: number) => PADDING.left + (i / (history.length - 1)) * plotW;
  const toY = (score: number) => PADDING.top + plotH - ((score - minScore) / range) * plotH;

  const points = history.map((h, i) => `${toX(i)},${toY(h.score)}`).join(' ');

  const latest = history[history.length - 1];
  const first = history[0];
  const trend = latest.score - first.score;
  const trendColor = trend > 5 ? B.riskCritical : trend < -5 ? B.success : B.textMuted;
  const trendLabel = trend > 0 ? `+${Math.round(trend)}` : `${Math.round(trend)}`;

  // Find nearest point to touch X
  const getNearestIndex = (touchX: number) => {
    let nearest = 0;
    let minDist = Infinity;
    history.forEach((_, i) => {
      const dist = Math.abs(toX(i) - touchX);
      if (dist < minDist) { minDist = dist; nearest = i; }
    });
    return nearest;
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      setActiveIndex(getNearestIndex(e.nativeEvent.locationX));
    },
    onPanResponderMove: (e) => {
      setActiveIndex(getNearestIndex(e.nativeEvent.locationX));
    },
    onPanResponderRelease: () => {
      setTimeout(() => setActiveIndex(null), 1500);
    },
  });

  // Web hover handlers
  const webHandlers = {
    onMouseMove: (e: any) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setActiveIndex(getNearestIndex(x));
    },
    onMouseLeave: () => setActiveIndex(null),
  };

  const activePoint = activeIndex !== null ? history[activeIndex] : null;
  const activeX = activeIndex !== null ? toX(activeIndex) : null;
  const activeY = activeIndex !== null ? toY(history[activeIndex].score) : null;
  const activeScore = activePoint ? Math.round(activePoint.score) : null;
  const activeDate = activePoint
    ? new Date(activePoint.calculated_at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })
    : null;
  const activeScoreColor = activeScore !== null
    ? activeScore >= 70 ? B.riskCritical
    : activeScore >= 40 ? B.riskHigh
    : activeScore >= 20 ? B.riskModerate
    : B.success
    : B.blue;

  // Tooltip x position — keep it within bounds
  const tooltipW = 72;
  const tooltipX = activeX !== null
    ? Math.min(Math.max(activeX - tooltipW / 2, 0), WIDTH - tooltipW)
    : 0;

  return (
    <View>
      <View style={styles.sparklineHeader}>
        <Text style={styles.sparklineLabel}>Score History (30 days)</Text>
        <Text style={[styles.sparklineTrend, { color: trendColor }]}>
          {trendLabel} pts
        </Text>
      </View>

      {/* Tooltip */}
      <View style={[styles.tooltipWrap, { height: TOOLTIP_H }]}>
        {activePoint && (
          <View style={[styles.tooltip, { left: tooltipX, width: tooltipW }]}>
            <Text style={[styles.tooltipScore, { color: activeScoreColor }]}>{activeScore}</Text>
            <Text style={styles.tooltipDate}>{activeDate}</Text>
          </View>
        )}
      </View>

      <View {...panResponder.panHandlers} {...(Platform.OS === 'web' ? webHandlers : {})}>
        <Svg width={WIDTH} height={HEIGHT}>
          {/* Grid line at midpoint */}
          <Line
            x1={PADDING.left} y1={toY((minScore + maxScore) / 2)}
            x2={WIDTH - PADDING.right} y2={toY((minScore + maxScore) / 2)}
            stroke={B.border} strokeWidth={1} strokeDasharray="3,3"
          />

          {/* Score line */}
          <Polyline
            points={points}
            fill="none"
            stroke={B.blue}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Vertical crosshair on hover */}
          {activeX !== null && activeY !== null && (
            <>
              <Line
                x1={activeX} y1={PADDING.top}
                x2={activeX} y2={HEIGHT - PADDING.bottom}
                stroke={B.blue} strokeWidth={1} strokeDasharray="3,3" strokeOpacity={0.4}
              />
              {/* Single active dot */}
              <Circle
                cx={activeX} cy={activeY}
                r={5} fill={activeScoreColor}
                stroke={B.bgCard} strokeWidth={2}
              />
            </>
          )}

          {/* Date labels */}
          <SvgText x={PADDING.left} y={HEIGHT} fontSize={9} fill={B.textMuted} textAnchor="start">
            {new Date(first.calculated_at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}
          </SvgText>
          <SvgText x={WIDTH - PADDING.right} y={HEIGHT} fontSize={9} fill={B.textMuted} textAnchor="end">
            {new Date(latest.calculated_at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}
          </SvgText>

          {/* Latest score label when nothing hovered */}
          {activeIndex === null && (
            <SvgText
              x={toX(history.length - 1)}
              y={toY(latest.score) - 8}
              fontSize={10} fill={B.blue} fontWeight="700"
              textAnchor="end"
            >
              {Math.round(latest.score)}
            </SvgText>
          )}
        </Svg>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CompanyDetailScreen({ route }: any) {
  const routeParams = route?.params || {};

  const initialCompany = useMemo(
    () => routeParams?.company ?? routeParams?.item ?? routeParams?.selectedCompany ?? null,
    [routeParams]
  );

  const resolvedCvrNumber = useMemo(() => {
    const raw = firstDefined(
      routeParams?.cvrNumber, routeParams?.cvr_number, routeParams?.cvr,
      routeParams?.company?.cvr_number, routeParams?.item?.cvr_number,
      initialCompany?.cvr_number, initialCompany?.cvr
    );
    return normalizeCvr(raw);
  }, [routeParams, initialCompany]);

  const resolvedCompanyName = useMemo(() => {
    const raw = firstDefined(
      routeParams?.companyName, routeParams?.name, routeParams?.company?.name,
      routeParams?.item?.name, initialCompany?.name, 'Unknown company'
    );
    return String(raw ?? 'Unknown company').trim();
  }, [routeParams, initialCompany]);

  const [company, setCompany] = useState<any>(initialCompany);
  const [signalScore, setSignalScore] = useState<CompanySignalScoreV2 | null>(null);
  const [events, setEvents] = useState<CompanyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [signalLoading, setSignalLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [scoreHistory, setScoreHistory] = useState<ScoreHistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const selectedCvr = useMemo(
    () => normalizeCvr(firstDefined(company?.cvr_number, initialCompany?.cvr_number, resolvedCvrNumber)),
    [company, initialCompany, resolvedCvrNumber]
  );

  const loadCompany = useCallback(async () => {
    try {
      setLoading(true);
      if (!resolvedCvrNumber) { setCompany(initialCompany ?? null); return; }
      const result = await getCompanyByCVR(resolvedCvrNumber);
      setCompany(result ?? initialCompany ?? null);
    } catch { setCompany(initialCompany ?? null); }
    finally { setLoading(false); }
  }, [resolvedCvrNumber, initialCompany]);

  const loadSignalScore = useCallback(async (forceRecalculate = false) => {
    if (!selectedCvr) return;
    try {
      setSignalLoading(true);
      if (forceRecalculate) {
        // Full recalculate via edge function
        setSignalScore(await getCompanySignalScore(selectedCvr));
        // Also refresh history so sparkline reflects the new point
        if (company?.id) {
          setScoreHistory(await getCompanyScoreHistory(company.id, 30));
        }
      } else {
        // Read stored score from DB — fast, no edge function call
        const stored = await getStoredCompanySignalScore(selectedCvr);
        if (stored) {
          setSignalScore({
            score: stored.risk_score,
            risk_level: stored.risk_level as any,
            opportunity_type: 'stable' as any,
            volatility_classification: null,
            risk_factors: stored.risk_factors ?? [],
            event_counts: stored.event_counts ?? {},
            summary: { calculated_at: stored.calculated_at, data_sources: [] },
          } as any);
        } else {
          setSignalScore(null);
        }
      }
    } catch { setSignalScore(null); }
    finally { setSignalLoading(false); }
  }, [selectedCvr, company?.id]);

  const loadEvents = useCallback(async () => {
    if (!company?.id) return;
    try {
      setEventsLoading(true);
      setEvents(((await getCompanyEvents(company.id)) ?? []).slice(0, 8));
    } catch { setEvents([]); }
    finally { setEventsLoading(false); }
  }, [company?.id]);

  const loadScoreHistory = useCallback(async () => {
    if (!company?.id) return;
    try {
      setHistoryLoading(true);
      setScoreHistory(await getCompanyScoreHistory(company.id, 30));
    } catch { setScoreHistory([]); }
    finally { setHistoryLoading(false); }
  }, [company?.id]);

  const loadWatchStatus = useCallback(async () => {
    if (!selectedCvr) return;
    try { setIsWatched(!!(await isCompanyInWatchlist(selectedCvr))); }
    catch { setIsWatched(false); }
  }, [selectedCvr]);

  // How often to auto-recalculate while the screen stays open
  const SCORE_POLL_MS = 5 * 60 * 1000; // 5 minutes

  useEffect(() => { loadCompany(); }, [loadCompany]);
  useEffect(() => { if (!loading) { loadSignalScore(); loadWatchStatus(); } }, [loading]);
  useEffect(() => { if (company?.id) loadEvents(); }, [company?.id]);
  useEffect(() => { if (company?.id) loadScoreHistory(); }, [company?.id]);

  // Auto-recalculate score when screen loads, then every 5 minutes —
  // no manual Refresh needed. Stored score shows immediately while the
  // edge function runs in the background.
  useEffect(() => {
    if (!selectedCvr || loading) return;
    const initial = setTimeout(() => loadSignalScore(true), 800);
    const poll    = setInterval(() => loadSignalScore(true), SCORE_POLL_MS);
    return () => { clearTimeout(initial); clearInterval(poll); };
  }, [selectedCvr, loading, loadSignalScore]);

  const handleToggleWatchlist = async () => {
    if (!selectedCvr) return Alert.alert('Error', 'Company CVR is missing');
    try {
      setWatchLoading(true);
      if (isWatched) { await removeFromWatchlist(selectedCvr); setIsWatched(false); }
      else { await addToWatchlist(selectedCvr); setIsWatched(true); }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to update watchlist');
    } finally { setWatchLoading(false); }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={B.blue} />
      </View>
    );
  }

  if (!company) {
    return (
      <View style={styles.centered}>
        <View style={styles.emptyIllustration}>
          <Text style={styles.emptyIllustrationIcon}>🏢</Text>
        </View>
        <Text style={styles.notFoundText}>Company Not Found</Text>
        <Text style={styles.notFoundSub}>The CVR number may be invalid or the company hasn't been added to the database yet.</Text>
      </View>
    );
  }

  const address = company.address || {};
  const fullAddress =
    address.full_address ||
    [address.street, address.zipcode, address.city].filter(Boolean).join(', ') ||
    null;

  const scoreValue = signalScore?.score ?? null;
  const scoreColor = scoreValue !== null ? getScoreColor(scoreValue) : B.textMuted;
  const riskColors = getRiskColors(signalScore?.risk_level);
  const oppColors = getOpportunityColors(signalScore?.opportunity_type);

  const riskFactors: string[] = Array.isArray(signalScore?.risk_factors)
    ? (signalScore!.risk_factors as any[]).slice(0, 4)
        .map((f: any) => (typeof f === 'string' ? f : f?.label ?? '')).filter(Boolean)
    : [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <Text style={styles.companyName}>{company.name || resolvedCompanyName}</Text>

      {/* Info card */}
      <View style={styles.card}>
        <View style={styles.infoGrid}>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>CVR</Text>
            <Text style={styles.infoValue}>{company.cvr_number || '—'}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={styles.infoValue}>{company.status || '—'}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Employees</Text>
            <Text style={styles.infoValue}>{company.employee_count ?? '—'}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Industry</Text>
            <Text style={styles.infoValue} numberOfLines={2}>{company.industry || '—'}</Text>
          </View>
        </View>
        {fullAddress && (
          <>
            <View style={styles.divider} />
            <Text style={styles.infoLabel}>Address</Text>
            <Text style={styles.infoValue}>{fullAddress}</Text>
          </>
        )}
      </View>

      {/* Signal score card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionTitle}>Signal Score</Text>
          <TouchableOpacity
            style={[styles.refreshBtn, signalLoading && styles.btnDisabled]}
            onPress={() => loadSignalScore(true)} disabled={signalLoading}
          >
            <Text style={styles.refreshBtnText}>{signalLoading ? '↻ Updating…' : '↻ Refresh'}</Text>
          </TouchableOpacity>
        </View>

        {signalLoading && !signalScore ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={B.blue} />
            <Text style={styles.mutedText}>Calculating...</Text>
          </View>
        ) : !signalScore ? (
          <View style={styles.scoreEmptyWrap}>
            <Text style={styles.scoreEmptyIcon}>🧮</Text>
            <Text style={styles.scoreEmptyTitle}>No Score Calculated Yet</Text>
            <Text style={styles.emptyText}>Tap Refresh to calculate the signal score based on company events and data.</Text>
          </View>
        ) : (
          <>
            <View style={styles.scoreRow}>
              <View style={styles.scoreBig}>
                <Text style={[styles.scoreNumber, { color: scoreColor }]}>{Math.round(signalScore.score)}</Text>
                <Text style={styles.scoreOutOf}>/100</Text>
              </View>
              <View style={styles.pillsCol}>
                <View style={[styles.pill, { backgroundColor: riskColors.bg, borderColor: riskColors.border }]}>
                  <View style={[styles.pillDot, { backgroundColor: riskColors.dot }]} />
                  <Text style={[styles.pillText, { color: riskColors.text }]}>
                    {(signalScore.risk_level ?? 'unknown').toUpperCase()}
                  </Text>
                </View>
                <View style={[styles.pill, { backgroundColor: oppColors.bg, borderColor: oppColors.border }]}>
                  <Text style={[styles.pillText, { color: oppColors.text }]}>
                    {(signalScore.opportunity_type ?? 'unknown').toUpperCase()}
                  </Text>
                </View>
                {signalScore.volatility_classification && (
                  <View style={[styles.pill, { backgroundColor: B.bgCardAlt, borderColor: B.border }]}>
                    <Text style={[styles.pillText, { color: B.textMuted }]}>
                      {signalScore.volatility_classification.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {riskFactors.length > 0 && (
              <>
                <View style={styles.divider} />
                <Text style={styles.infoLabel}>Risk Factors</Text>
                {riskFactors.map((factor, i) => (
                  <View key={i} style={styles.factorRow}>
                    <View style={[styles.factorDot, { backgroundColor: scoreColor }]} />
                    <Text style={styles.factorText}>{factor}</Text>
                  </View>
                ))}
              </>
            )}

            {/* Score history sparkline */}
            <View style={styles.divider} />
            {historyLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={B.blue} />
                <Text style={styles.mutedText}>Loading history...</Text>
              </View>
            ) : (
              <ScoreSparkline history={scoreHistory} />
            )}
          </>
        )}
      </View>

      {/* AI Insight card */}
      {company?.id && (
        <AIInsightCard companyId={company.id} compact={false} />
      )}

      {/* News card */}
      {company?.id && (
        <NewsCard companyId={company.id} />
      )}

      {/* Recent events card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionTitle}>Recent Events</Text>
          {eventsLoading && <ActivityIndicator size="small" color={B.blue} />}
        </View>

        {eventsLoading && events.length === 0 ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={B.blue} />
            <Text style={styles.mutedText}>Loading events...</Text>
          </View>
        ) : events.length === 0 ? (
          <View style={styles.eventsEmptyWrap}>
            <Text style={styles.eventsEmptyIcon}>📭</Text>
            <Text style={styles.eventsEmptyTitle}>No Events Recorded</Text>
            <Text style={styles.emptyText}>Events will appear here when changes are detected — leadership updates, filings, ownership changes and more.</Text>
          </View>
        ) : (
          events.map((event, index) => (
            <View key={event.id} style={[styles.eventRow, index < events.length - 1 && styles.eventRowBorder]}>
              <View style={styles.eventIconWrap}>
                <Text style={styles.eventIconText}>{getEventIcon(event.event_type)}</Text>
              </View>
              <View style={styles.eventContent}>
                <Text style={styles.eventDescription} numberOfLines={2}>{event.description}</Text>
                <Text style={styles.eventTime}>{formatDate(event.detected_at)}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Watchlist button */}
      <TouchableOpacity
        style={[styles.watchBtn, isWatched ? styles.watchBtnRemove : styles.watchBtnAdd, watchLoading && styles.btnDisabled]}
        onPress={handleToggleWatchlist} disabled={watchLoading} activeOpacity={0.85}
      >
        <Text style={[styles.watchBtnText, isWatched && styles.watchBtnTextRemove]}>
          {watchLoading ? 'Loading...' : isWatched ? '✕ Remove from Watchlist' : '+ Add to Watchlist'}
        </Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: B.bg },
  content: { padding: B.pad, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: B.bg, paddingHorizontal: 24 },
  notFoundText: { fontSize: 18, color: B.textPrimary, fontWeight: '700' },
  notFoundSub: { marginTop: 6, fontSize: 13, color: B.textMuted, textAlign: 'center' },
  mutedText: { fontSize: 13, color: B.textMuted },
  emptyText: { fontSize: 14, color: B.textMuted, marginTop: 8, lineHeight: 20 },

  companyName: { fontSize: 22, fontWeight: '800', color: B.textPrimary, marginBottom: 14, lineHeight: 28 },

  card: {
    backgroundColor: B.bgCard, borderRadius: B.radius, padding: 16,
    borderWidth: 1, borderColor: B.border, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: B.textPrimary },
  divider: { height: 1, backgroundColor: B.border, marginVertical: 12 },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  infoCell: { minWidth: '40%', flex: 1 },
  infoLabel: { fontSize: 10, fontWeight: '700', color: B.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  infoValue: { fontSize: 14, color: B.textPrimary, fontWeight: '600', lineHeight: 20 },

  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  scoreBig: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  scoreNumber: { fontSize: 48, fontWeight: '900', lineHeight: 54 },
  scoreOutOf: { fontSize: 15, color: B.textMuted, fontWeight: '700' },
  pillsCol: { flex: 1, gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: B.radiusFull, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  factorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 10 },
  factorDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  factorText: { flex: 1, fontSize: 13, color: B.textSecondary, lineHeight: 19 },

  eventRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 11, gap: 10 },
  eventRowBorder: { borderBottomWidth: 1, borderBottomColor: B.border },
  eventIconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: B.blueMuted, borderWidth: 1, borderColor: B.blueBorder, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  eventIconText: { fontSize: 15 },
  eventContent: { flex: 1 },
  eventDescription: { fontSize: 13, color: B.textPrimary, lineHeight: 19, fontWeight: '500' },
  eventTime: { fontSize: 11, color: B.textMuted, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  refreshBtn: { backgroundColor: B.bgCardAlt, borderWidth: 1, borderColor: B.border, paddingHorizontal: 11, paddingVertical: 6, borderRadius: B.radiusSm },
  refreshBtnText: { color: B.textSecondary, fontSize: 12, fontWeight: '600' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },

  watchBtn: { borderRadius: B.radiusSm, padding: 15, alignItems: 'center', marginTop: 4, marginBottom: 8 },
  watchBtnAdd: { backgroundColor: B.blue },
  watchBtnRemove: { backgroundColor: '#FEF2F2', borderWidth: 1.5, borderColor: B.riskCritical },
  watchBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  watchBtnTextRemove: { color: B.riskCritical },
  btnDisabled: { opacity: 0.5 },
  emptyIllustration: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: B.blueMuted, borderWidth: 1, borderColor: B.blueBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyIllustrationIcon: { fontSize: 32 },
  scoreEmptyWrap: { paddingVertical: 8, alignItems: 'flex-start' },
  scoreEmptyIcon: { fontSize: 24, marginBottom: 6 },
  scoreEmptyTitle: { fontSize: 14, fontWeight: '700', color: B.textPrimary, marginBottom: 4 },
  eventsEmptyWrap: { paddingVertical: 8 },
  eventsEmptyIcon: { fontSize: 24, marginBottom: 6 },
  eventsEmptyTitle: { fontSize: 14, fontWeight: '700', color: B.textPrimary, marginBottom: 4 },

  // Sparkline
  sparklineSvg: { marginTop: 4 },
  sparklineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  sparklineLabel: { fontSize: 10, fontWeight: '700', color: B.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  sparklineTrend: { fontSize: 12, fontWeight: '700' },
  sparklineEmpty: { paddingVertical: 8 },
  sparklineEmptyText: { fontSize: 12, color: B.textMuted, fontStyle: 'italic' },
  tooltipWrap: { position: 'relative', width: '100%' },
  tooltip: {
    position: 'absolute', top: 2,
    backgroundColor: B.textPrimary, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center',
  },
  tooltipScore: { fontSize: 14, fontWeight: '900', color: '#fff' },
  tooltipDate: { fontSize: 9, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
});