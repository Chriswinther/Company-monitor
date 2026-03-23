import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, ScrollView,
} from 'react-native';
import { supabase } from '../services/supabase';
import { B } from '../theme';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success' | ''>('');

  const handleLogin = async () => {
    const cleanEmail = email.trim().toLowerCase();
    setMessage(''); setMessageType('');
    if (!cleanEmail || !password) { setMessage('Please fill in all fields'); setMessageType('error'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (error) { setMessage(error.message || 'Login failed'); setMessageType('error'); return; }
      if (!data?.session) { setMessage('Login failed: no session returned'); setMessageType('error'); return; }
      setMessage('Login successful'); setMessageType('success');
    } catch (error: any) {
      setMessage(error?.message || 'Something went wrong'); setMessageType('error');
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Logo area */}
        <View style={styles.logoWrap}>
          <Image source={require('../../assets/boyden-logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.tagline}>Company Intelligence Platform</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in</Text>
          <Text style={styles.cardSub}>Welcome back</Text>

          <Text style={styles.inputLabel}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@company.com"
            placeholderTextColor={B.textMuted}
            value={email}
            onChangeText={(t) => { setEmail(t); setMessage(''); setMessageType(''); }}
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address" editable={!loading}
          />

          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={B.textMuted}
            value={password}
            onChangeText={(t) => { setPassword(t); setMessage(''); setMessageType(''); }}
            secureTextEntry editable={!loading}
          />

          {!!message && (
            <View style={[styles.msgBox, messageType === 'error' ? styles.msgError : styles.msgSuccess]}>
              <Text style={[styles.msgText, messageType === 'error' ? styles.msgTextError : styles.msgTextSuccess]}>
                {message}
              </Text>
            </View>
          )}

          <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign In</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('SignUp')} disabled={loading}>
            <Text style={styles.linkText}>
              Don't have an account?{'  '}
              <Text style={styles.linkTextBold}>Create account</Text>
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Powered by Boyden · Danish Company Intelligence</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: B.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: B.padLg },

  logoWrap: { alignItems: 'center', marginBottom: 36 },
  logo: { height: 40, width: 160, marginBottom: 10 },
  tagline: { color: B.textMuted, fontSize: 13, fontWeight: '500', letterSpacing: 0.3 },

  card: {
    backgroundColor: B.bgCard, borderRadius: B.radiusLg, padding: B.padLg,
    borderWidth: 1, borderColor: B.border,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  cardTitle: { color: B.textPrimary, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  cardSub: { color: B.textMuted, fontSize: 14, marginBottom: 24 },

  inputLabel: { color: B.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: B.bgInput, borderRadius: B.radiusSm, padding: 13,
    marginBottom: 16, fontSize: 15, borderWidth: 1, borderColor: B.border,
    color: B.textPrimary,
  },

  msgBox: { marginBottom: 14, paddingVertical: 10, paddingHorizontal: 12, borderRadius: B.radiusSm, borderWidth: 1 },
  msgError: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  msgSuccess: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  msgText: { fontSize: 13, textAlign: 'center', fontWeight: '500' },
  msgTextError: { color: B.riskCritical },
  msgTextSuccess: { color: B.success },

  btn: {
    backgroundColor: B.blue, borderRadius: B.radiusSm, padding: 14,
    alignItems: 'center', marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  linkBtn: { marginTop: 18, alignItems: 'center' },
  linkText: { color: B.textMuted, fontSize: 14 },
  linkTextBold: { color: B.blue, fontWeight: '700' },

  footer: { color: B.textMuted, fontSize: 11, textAlign: 'center', marginTop: 28 },
});