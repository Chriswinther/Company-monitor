import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { getCompanyAIInsight, type AIInsight } from '../services/api';
import { B } from '../theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPredictionStyle(type: AIInsight['prediction_type']) {
  switch (type) {
    case 'leadership_change_likely':
      return { bg: '#FEF2F2', border: '#FECACA', dot: B.riskCritical, label: 'Leadership Change Likely' };
    case 'leadership_change_possible':
      return { bg: '#FFF7ED', border: '#FED7AA', dot: B.riskHigh, label: 'Leadership Change Possible' };
    case 'leadership_change_unlikely':
      return { bg: '#F0FDF4', border: '#BBF7D0', dot: B.riskLow, label: 'Leadership Stable' };
    default:
      return { bg: B.bgCardAlt, border: B.border, dot: B.textMuted, label: 'Insufficient Data' };
  }
}

function getConfidenceBadge(confidence: AIInsight['confidence']) {
  switch (confidence) {
    case 'high':   return { label: 'High confidence', color: B.riskCritical };
    case 'medium': return { label: 'Medium confidence', color: B.riskHigh };
    default:       return { label: 'Low confidence', color: B.textMuted };
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AIInsightCardProps {
  companyId: string;
  compact?: boolean; // compact = for feed/watchlist, full = for detail screen
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIInsightCard({ companyId, compact = false }: AIInsightCardProps) {
  const [insight, setInsight] = useState<AIInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      const data = await getCompanyAIInsight(companyId, forceRefresh);
      setInsight(data);
    } catch { setInsight(null); }
    finally { setLoading(false); setRefreshing(false); }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[styles.card, compact && styles.cardCompact, styles.loadingCard]}>
        <ActivityIndicator size="small" color={B.blue} />
        <Text style={styles.loadingText}>Analysing leadership signals...</Text>
      </View>
    );
  }

  if (!insight) return null;

  const predStyle = getPredictionStyle(insight.prediction_type);
  const confBadge = getConfidenceBadge(insight.confidence);
  const timeAgo = insight.generated_at
    ? new Date(insight.generated_at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })
    : '';

  if (compact) {
    // ── Compact version for Feed / Watchlist ──────────────────────────────
    return (
      <View style={[styles.compactWrap, { backgroundColor: predStyle.bg, borderColor: predStyle.border }]}>
        <View style={[styles.compactDot, { backgroundColor: predStyle.dot }]} />
        <Text style={styles.compactText} numberOfLines={2}>{insight.insight}</Text>
      </View>
    );
  }

  // ── Full version for Company Detail ──────────────────────────────────────
  return (
    <View style={[styles.card, { backgroundColor: predStyle.bg, borderColor: predStyle.border }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <Text style={styles.aiLabel}>🤖 AI Analysis</Text>
          <View style={styles.predictionBadge}>
            <View style={[styles.predDot, { backgroundColor: predStyle.dot }]} />
            <Text style={[styles.predLabel, { color: predStyle.dot }]}>{predStyle.label}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.refreshBtn, refreshing && styles.btnDisabled]}
          onPress={() => load(true)}
          disabled={refreshing}
        >
          {refreshing
            ? <ActivityIndicator size="small" color={B.blue} />
            : <Text style={styles.refreshBtnText}>↻</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Insight text */}
      <Text style={styles.insightText}>{insight.insight}</Text>

      {/* Footer */}
      <View style={styles.cardFooter}>
        <Text style={[styles.confidenceText, { color: confBadge.color }]}>
          {confBadge.label}
        </Text>
        <Text style={styles.generatedAt}>
          {insight.cached ? '📦 Cached · ' : '✨ Fresh · '}{timeAgo}
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: B.radius, padding: 14,
    borderWidth: 1, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  cardCompact: { padding: 10 },
  loadingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: B.bgCardAlt, borderColor: B.border,
  },
  loadingText: { color: B.textMuted, fontSize: 13 },

  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 10,
  },
  headerLeft: { flex: 1, gap: 6 },
  aiLabel: { fontSize: 11, fontWeight: '700', color: B.textMuted, letterSpacing: 0.3 },
  predictionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  predDot: { width: 7, height: 7, borderRadius: 3.5 },
  predLabel: { fontSize: 13, fontWeight: '700' },

  refreshBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: B.bgCard, borderWidth: 1, borderColor: B.border,
    alignItems: 'center', justifyContent: 'center',
  },
  refreshBtnText: { color: B.textSecondary, fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  insightText: {
    fontSize: 14, color: B.textPrimary, lineHeight: 22,
    fontWeight: '500', marginBottom: 10,
  },

  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
  },
  confidenceText: { fontSize: 11, fontWeight: '700' },
  generatedAt: { fontSize: 10, color: B.textMuted },

  // Compact
  compactWrap: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderWidth: 1, borderRadius: B.radiusSm,
    paddingHorizontal: 10, paddingVertical: 7, gap: 7, marginTop: 8,
  },
  compactDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4, flexShrink: 0 },
  compactText: { flex: 1, fontSize: 12, color: B.textSecondary, lineHeight: 18 },
});