import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, ScrollView,
} from 'react-native';
import { supabase } from '../services/supabase';
import { B } from '../theme';

export default function SignUpScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success' | ''>('');

  const handleSignUp = async () => {
    const cleanEmail = email.trim();
    setMessage(''); setMessageType('');
    if (!cleanEmail || !password || !confirmPassword) { setMessage('Please fill in all fields'); setMessageType('error'); return; }
    if (password !== confirmPassword) { setMessage('Passwords do not match'); setMessageType('error'); return; }
    if (password.length < 6) { setMessage('Password must be at least 6 characters'); setMessageType('error'); return; }
    if (!cleanEmail.endsWith('@boyden.com') && !cleanEmail.endsWith('@boyden.dk')) {
      setMessage('Access is restricted to Boyden email addresses only.');
      setMessageType('error');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password });
      if (error) {
        const msg = error.message.includes('restricted') || error.message.includes('Boyden')
          ? 'Access is restricted to Boyden email addresses only.'
          : error.message;
        setMessage(msg);
        setMessageType('error');
        return;
      }
      setMessage('Account created! Check your inbox if email confirmation is enabled.');
      setMessageType('success');
      setTimeout(() => navigation.goBack(), 1500);
    } catch (error: any) {
      setMessage(error?.message || 'Something went wrong');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <View style={styles.logoWrap}>
          <Image source={require('../../assets/boyden-logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.tagline}>Company Intelligence Platform</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create account</Text>
          <Text style={styles.cardSub}>Start monitoring Danish companies</Text>

          <Text style={styles.inputLabel}>Email</Text>
          <TextInput
            style={styles.input} placeholder="you@boyden.com" placeholderTextColor={B.textMuted}
            value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
            keyboardType="email-address" editable={!loading}
          />

          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            style={styles.input} placeholder="Min. 6 characters" placeholderTextColor={B.textMuted}
            value={password} onChangeText={setPassword} secureTextEntry editable={!loading}
          />

          <Text style={styles.inputLabel}>Confirm Password</Text>
          <TextInput
            style={styles.input} placeholder="Repeat password" placeholderTextColor={B.textMuted}
            value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry editable={!loading}
          />

          {!!message && (
            <View style={[styles.msgBox, messageType === 'error' ? styles.msgError : styles.msgSuccess]}>
              <Text style={[styles.msgText, messageType === 'error' ? styles.msgTextError : styles.msgTextSuccess]}>
                {message}
              </Text>
            </View>
          )}

          <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleSignUp} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create Account</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('Login')} disabled={loading}>
            <Text style={styles.linkText}>
              Already have an account?{'  '}
              <Text style={styles.linkTextBold}>Sign in</Text>
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
    backgroundColor: B.bgInput, borderRadius: B.radiusSm, padding: 13, marginBottom: 16,
    fontSize: 15, borderWidth: 1, borderColor: B.border, color: B.textPrimary,
  },
  msgBox: { marginBottom: 14, paddingVertical: 10, paddingHorizontal: 12, borderRadius: B.radiusSm, borderWidth: 1 },
  msgError: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  msgSuccess: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  msgText: { fontSize: 13, textAlign: 'center', fontWeight: '500' },
  msgTextError: { color: B.riskCritical },
  msgTextSuccess: { color: B.success },
  btn: { backgroundColor: B.blue, borderRadius: B.radiusSm, padding: 14, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  linkBtn: { marginTop: 18, alignItems: 'center' },
  linkText: { color: B.textMuted, fontSize: 14 },
  linkTextBold: { color: B.blue, fontWeight: '700' },
  footer: { color: B.textMuted, fontSize: 11, textAlign: 'center', marginTop: 28 },
});
