import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Linking, Platform,
} from 'react-native';
import { getCompanyNews, type NewsArticle } from '../services/api';
import { B } from '../theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSentimentStyle(label: NewsArticle['sentiment_label']) {
  switch (label) {
    case 'very_negative': return { color: B.riskCritical, bg: '#FEF2F2', border: '#FECACA', emoji: '🔴' };
    case 'negative':      return { color: B.riskHigh,     bg: '#FFF7ED', border: '#FED7AA', emoji: '🟠' };
    case 'positive':      return { color: B.riskLow,      bg: '#F0FDF4', border: '#BBF7D0', emoji: '🟢' };
    case 'very_positive': return { color: '#15803D',      bg: '#DCFCE7', border: '#86EFAC', emoji: '✅' };
    default:              return { color: B.textMuted,    bg: B.bgCardAlt, border: B.border, emoji: '⚪' };
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function openUrl(url: string) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    Linking.openURL(url);
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface NewsCardProps {
  companyId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewsCard({ companyId }: NewsCardProps) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      const data = await getCompanyNews(companyId, forceRefresh);
      setArticles(data);
    } catch { setArticles([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[styles.card, styles.loadingCard]}>
        <ActivityIndicator size="small" color={B.blue} />
        <Text style={styles.loadingText}>Fetching latest news...</Text>
      </View>
    );
  }

  if (articles.length === 0) return null;

  const negativeCount = articles.filter(a => a.sentiment_score < -0.1).length;
  const positiveCount = articles.filter(a => a.sentiment_score > 0.1).length;
  const totalImpact   = articles.reduce((s, a) => s + (a.score_impact ?? 0), 0);
  const visibleArticles = expanded ? articles : articles.slice(0, 3);

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.sectionLabel}>📰 NEWS SIGNALS</Text>
          <View style={styles.summaryRow}>
            {negativeCount > 0 && (
              <View style={[styles.badge, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                <Text style={[styles.badgeText, { color: B.riskCritical }]}>
                  {negativeCount} negative
                </Text>
              </View>
            )}
            {positiveCount > 0 && (
              <View style={[styles.badge, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                <Text style={[styles.badgeText, { color: B.riskLow }]}>
                  {positiveCount} positive
                </Text>
              </View>
            )}
            {totalImpact > 0 && (
              <View style={[styles.badge, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                <Text style={[styles.badgeText, { color: B.riskHigh }]}>
                  +{totalImpact} pts risk
                </Text>
              </View>
            )}
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

      {/* Articles */}
      <View style={styles.articleList}>
        {visibleArticles.map((article, idx) => {
          const sentStyle = getSentimentStyle(article.sentiment_label);
          return (
            <TouchableOpacity
              key={article.id ?? idx}
              style={[styles.articleRow, { borderLeftColor: sentStyle.color }]}
              onPress={() => openUrl(article.url)}
              activeOpacity={0.7}
            >
              <View style={styles.articleMeta}>
                <Text style={styles.articleEmoji}>{sentStyle.emoji}</Text>
                <Text style={styles.articleSource} numberOfLines={1}>
                  {article.source_name ?? 'Unknown source'}
                </Text>
                <Text style={styles.articleTime}>{timeAgo(article.published_at)}</Text>
              </View>
              <Text style={styles.articleTitle} numberOfLines={2}>
                {article.title}
              </Text>
              {article.description ? (
                <Text style={styles.articleDesc} numberOfLines={2}>
                  {article.description}
                </Text>
              ) : null}
              {article.score_impact !== 0 && (
                <Text style={[
                  styles.impactBadge,
                  { color: article.score_impact > 0 ? B.riskCritical : B.riskLow }
                ]}>
                  {article.score_impact > 0 ? `+${article.score_impact} risk pts` : `${article.score_impact} risk pts`}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Show more / less */}
      {articles.length > 3 && (
        <TouchableOpacity
          style={styles.expandBtn}
          onPress={() => setExpanded(!expanded)}
        >
          <Text style={styles.expandBtnText}>
            {expanded ? 'Show less' : `Show ${articles.length - 3} more articles`}
          </Text>
        </TouchableOpacity>
      )}

      <Text style={styles.footer}>
        {articles[0]?.cached ? '📦 Cached · ' : '✨ Fresh · '}
        {articles.length} articles · last 90 days
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: B.bgCard,
    borderRadius: B.radius,
    padding: 14,
    borderWidth: 1,
    borderColor: B.border,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: B.bgCardAlt,
  },
  loadingText: { color: B.textMuted, fontSize: 13 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerLeft: { flex: 1, gap: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: B.textMuted, letterSpacing: 0.3 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },

  refreshBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: B.bgCard, borderWidth: 1, borderColor: B.border,
    alignItems: 'center', justifyContent: 'center',
  },
  refreshBtnText: { color: B.textSecondary, fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  articleList: { gap: 8 },

  articleRow: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 6,
    gap: 3,
  },
  articleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  articleEmoji: { fontSize: 11 },
  articleSource: {
    fontSize: 11,
    fontWeight: '600',
    color: B.textMuted,
    flex: 1,
  },
  articleTime: { fontSize: 11, color: B.textMuted },
  articleTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: B.textPrimary,
    lineHeight: 18,
  },
  articleDesc: {
    fontSize: 12,
    color: B.textSecondary,
    lineHeight: 17,
  },
  impactBadge: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },

  expandBtn: {
    marginTop: 10,
    paddingVertical: 8,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: B.border,
  },
  expandBtnText: {
    fontSize: 13,
    color: B.blue,
    fontWeight: '600',
  },

  footer: {
    marginTop: 10,
    fontSize: 10,
    color: B.textMuted,
    textAlign: 'right',
  },
});
