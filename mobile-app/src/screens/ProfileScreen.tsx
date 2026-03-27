import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, Image, Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserProfile, checkAllWatchedCompaniesForCurrentUser } from '../services/api';
import { supabase } from '../services/supabase';
import { registerForPushNotifications } from '../services/notifications';
import { B } from '../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  subscription_tier: 'free' | 'premium';
  created_at: string;
}

interface NotificationPrefs {
  ceo_changed: boolean;
  management_changed: boolean;
  status_changed: boolean;
  address_changed: boolean;
  employee_count_changed: boolean;
  financial_report_filed: boolean;
  ownership_changed: boolean;
}

interface AppSettings {
  defaultSort: 'score_desc' | 'score_asc' | 'name_asc';
  alertThreshold: number;
  notificationPrefs: NotificationPrefs;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultSort: 'score_desc',
  alertThreshold: 40,
  notificationPrefs: {
    ceo_changed: true,
    management_changed: true,
    status_changed: true,
    address_changed: false,
    employee_count_changed: false,
    financial_report_filed: true,
    ownership_changed: true,
  },
};

const SETTINGS_KEY = 'boyden_app_settings';

async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { return DEFAULT_SETTINGS; }
}

async function saveSettings(settings: AppSettings): Promise<void> {
  try { await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
  catch (err) { console.error('Failed to save settings:', err); }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function Divider() {
  return <View style={styles.divider} />;
}

function SettingRow({ icon, title, desc, right, onPress, disabled }: {
  icon: string; title: string; desc?: string;
  right?: React.ReactNode; onPress?: () => void; disabled?: boolean;
}) {
  const content = (
    <View style={[styles.settingRow, disabled && styles.rowDisabled]}>
      <Text style={styles.settingIcon}>{icon}</Text>
      <View style={styles.settingInfo}>
        <Text style={styles.settingTitle}>{title}</Text>
        {desc ? <Text style={styles.settingDesc}>{desc}</Text> : null}
      </View>
      {right ?? (onPress ? <Text style={styles.settingArrow}>›</Text> : null)}
    </View>
  );
  if (onPress) {
    return <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.7}>{content}</TouchableOpacity>;
  }
  return content;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    loadProfile();
    loadSettings().then(setSettings);
  }, []);

  const loadProfile = async () => {
    try {
      const data = await getUserProfile();
      const { data: { user } } = await supabase.auth.getUser();
      if (user && data) {
        setProfile({
          id: user.id, email: user.email || '',
          full_name: user.user_metadata?.full_name || data.full_name || null,
          subscription_tier: data.subscription_tier || 'free',
          created_at: user.created_at,
        });
      }
    } catch (error) { console.error('Error loading profile:', error); }
    finally { setLoading(false); }
  };

  const updateSettings = useCallback(async (partial: Partial<AppSettings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    await saveSettings(updated);
  }, [settings]);

  const updateNotifPref = useCallback(async (key: keyof NotificationPrefs, value: boolean) => {
    const updated = { ...settings, notificationPrefs: { ...settings.notificationPrefs, [key]: value } };
    setSettings(updated);
    await saveSettings(updated);
  }, [settings]);

  const handleSignOut = async () => {
    // Alert.alert doesn't work on web — use window.confirm instead
    const confirmed =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm('Are you sure you want to sign out?')
        : await new Promise<boolean>((resolve) =>
            Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Sign Out', style: 'destructive', onPress: () => resolve(true) },
            ])
          );

    if (!confirmed) return;

    try {
      const { error } = await supabase.auth.signOut();
      if (error) Alert.alert('Sign Out Failed', error.message);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Something went wrong');
    }
  };

  const handleEnableNotifications = async () => {
    try {
      const token = await registerForPushNotifications();
      if (token) Alert.alert('Success', 'Push notifications enabled!');
      else Alert.alert('Unavailable', 'Push notifications require a physical device.');
    } catch (error: any) { Alert.alert('Error', error.message); }
  };

  const handleRefreshAll = () => {
    Alert.alert(
      'Refresh All Companies',
      'Re-check all your watched companies for changes and update signal scores. This may take a moment.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Refresh', onPress: async () => {
            try {
              setRefreshing(true);
              await checkAllWatchedCompaniesForCurrentUser();
              Alert.alert('Done', 'All companies refreshed successfully.');
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Refresh failed');
            } finally { setRefreshing(false); }
          },
        },
      ]
    );
  };

  const handleSetThreshold = () => {
    Alert.alert('Alert Threshold', 'Notify me when a company score exceeds:', [
      { text: '20 — Moderate+', onPress: () => updateSettings({ alertThreshold: 20 }) },
      { text: '40 — High+', onPress: () => updateSettings({ alertThreshold: 40 }) },
      { text: '60 — Very High+', onPress: () => updateSettings({ alertThreshold: 60 }) },
      { text: '70 — Critical only', onPress: () => updateSettings({ alertThreshold: 70 }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSetDefaultSort = () => {
    Alert.alert('Default Sort Order', 'How should the Signals feed be sorted?', [
      { text: '↓ Highest Score first', onPress: () => updateSettings({ defaultSort: 'score_desc' }) },
      { text: '↑ Lowest Score first', onPress: () => updateSettings({ defaultSort: 'score_asc' }) },
      { text: 'A–Z Company name', onPress: () => updateSettings({ defaultSort: 'name_asc' }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={B.blue} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load profile</Text>
      </View>
    );
  }

  const initials = (profile.full_name ? profile.full_name[0] : profile.email[0]).toUpperCase();
  const sortLabel = { score_desc: '↓ Highest Score', score_asc: '↑ Lowest Score', name_asc: 'A–Z Name' }[settings.defaultSort];

  const notifItems: { key: keyof NotificationPrefs; icon: string; label: string }[] = [
    { key: 'ceo_changed', icon: '👔', label: 'CEO Changed' },
    { key: 'management_changed', icon: '👥', label: 'Management Changed' },
    { key: 'status_changed', icon: '⚠️', label: 'Company Status Changed' },
    { key: 'ownership_changed', icon: '🔄', label: 'Ownership Changed' },
    { key: 'financial_report_filed', icon: '📊', label: 'Financial Report Filed' },
    { key: 'employee_count_changed', icon: '👥', label: 'Employee Count Changed' },
    { key: 'address_changed', icon: '📍', label: 'Address Changed' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Logo header */}
      <View style={styles.pageHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.logoPill}>
            <Image source={require('../../assets/boyden-logo.png')} style={styles.logo} resizeMode="contain" />
          </View>
          <View style={styles.headerDivider} />
          <Text style={styles.headerTagline}>Profile</Text>
        </View>
      </View>

      {/* Profile card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.userName}>{profile.full_name || 'User'}</Text>
        <Text style={styles.userEmail}>{profile.email}</Text>
        <View style={styles.tierBadge}>
          <Text style={styles.tierText}>
            {profile.subscription_tier === 'premium' ? '⭐  Premium' : 'Free Plan'}
          </Text>
        </View>
      </View>

      {/* Feed Settings */}
      <View style={styles.section}>
        <SectionHeader title="Feed Settings" />
        <View style={styles.card}>
          <SettingRow icon="↕️" title="Default Sort Order" desc={sortLabel} onPress={handleSetDefaultSort} />
          <Divider />
          <SettingRow icon="🎯" title="Alert Threshold" desc={`Notify when score > ${settings.alertThreshold}`} onPress={handleSetThreshold} />
        </View>
      </View>

      {/* Notification Preferences */}
      <View style={styles.section}>
        <SectionHeader title="Notify me when..." />
        <View style={styles.card}>
          {notifItems.map((item, index) => (
            <React.Fragment key={item.key}>
              <SettingRow
                icon={item.icon}
                title={item.label}
                right={
                  <Switch
                    value={settings.notificationPrefs[item.key]}
                    onValueChange={(val) => updateNotifPref(item.key, val)}
                    trackColor={{ false: B.border, true: B.blueMuted }}
                    thumbColor={settings.notificationPrefs[item.key] ? B.blue : '#ccc'}
                    ios_backgroundColor={B.border}
                  />
                }
              />
              {index < notifItems.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </View>
      </View>

      {/* Push notifications */}
      <View style={styles.section}>
        <SectionHeader title="Push Notifications" />
        <View style={styles.card}>
          <SettingRow icon="🔔" title="Enable Push Notifications" desc="Register this device for alerts" onPress={handleEnableNotifications} />
        </View>
      </View>

      {/* Data & Sync */}
      <View style={styles.section}>
        <SectionHeader title="Data & Sync" />
        <View style={styles.card}>
          <SettingRow
            icon="🔄"
            title={refreshing ? 'Refreshing...' : 'Refresh All Watched Companies'}
            desc="Re-check all companies for changes now"
            onPress={handleRefreshAll}
            disabled={refreshing}
            right={refreshing ? <ActivityIndicator size="small" color={B.blue} /> : undefined}
          />
        </View>
      </View>

      {/* Account info */}
      <View style={styles.section}>
        <SectionHeader title="Account" />
        <View style={styles.card}>
          <SettingRow icon="📧" title="Email" desc={profile.email} />
          <Divider />
          <SettingRow
            icon="📅"
            title="Member Since"
            desc={new Date(profile.created_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}
          />
          <Divider />
          <SettingRow icon="🏷️" title="Plan" desc={profile.subscription_tier === 'premium' ? 'Premium' : 'Free'} />
          <Divider />
          <SettingRow icon="📱" title="App Version" desc="1.0.0" />
        </View>
      </View>

      {/* Sign out */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Image source={require('../../assets/boyden-logo.png')} style={styles.footerLogo} resizeMode="contain" />
        <Text style={styles.footerText}>Danish Company Intelligence Platform</Text>
      </View>

    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: B.bg },
  content: { paddingBottom: 56 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: B.bg },
  errorText: { color: B.textMuted, fontSize: 15 },

  pageHeader: {
    backgroundColor: B.bgNavy, paddingHorizontal: B.pad, paddingTop: 18, paddingBottom: 14,
    borderBottomWidth: 0, flexDirection: 'row', alignItems: 'center',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerDivider: { width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.2)' },
  headerTagline: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  logoPill: { backgroundColor: '#FFFFFF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  logo: { height: 22, width: 100 },

  profileCard: {
    backgroundColor: B.bgCard, alignItems: 'center', padding: B.padLg,
    borderBottomWidth: 1, borderBottomColor: B.border,
  },
  avatar: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: B.blue,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#fff' },
  userName: { fontSize: 19, fontWeight: '700', color: B.textPrimary, marginBottom: 4 },
  userEmail: { fontSize: 13, color: B.textMuted, marginBottom: 10 },
  tierBadge: {
    backgroundColor: B.bgCardAlt, paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: B.radiusFull, borderWidth: 1, borderColor: B.border,
  },
  tierText: { fontSize: 12, fontWeight: '600', color: B.textSecondary },

  section: { marginTop: 22, paddingHorizontal: B.pad },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: B.textMuted,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },

  card: {
    backgroundColor: B.bgCard, borderRadius: B.radius,
    borderWidth: 1, borderColor: B.border, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },

  settingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: B.pad,
  },
  rowDisabled: { opacity: 0.5 },
  settingIcon: { fontSize: 17, width: 26, textAlign: 'center', marginRight: 12 },
  settingInfo: { flex: 1 },
  settingTitle: { fontSize: 14, color: B.textPrimary, fontWeight: '600' },
  settingDesc: { fontSize: 12, color: B.textMuted, marginTop: 2 },
  settingArrow: { fontSize: 20, color: B.border, marginLeft: 8 },

  divider: { height: 1, backgroundColor: B.border, marginLeft: 54 },

  signOutBtn: {
    borderRadius: B.radiusSm, padding: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: B.riskCritical, backgroundColor: '#FEF2F2',
  },
  signOutBtnText: { color: B.riskCritical, fontSize: 15, fontWeight: '700' },

  footer: { alignItems: 'center', paddingTop: 32 },
  footerLogo: { height: 18, width: 72, marginBottom: 6, opacity: 0.35 },
  footerText: { fontSize: 11, color: B.textMuted },
});