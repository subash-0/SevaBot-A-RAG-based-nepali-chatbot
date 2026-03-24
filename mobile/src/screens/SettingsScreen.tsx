import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import {
  STORAGE_KEYS,
  DEFAULT_SERVER_IP,
  buildBaseURL,
  getServerIP,
} from '../services/api';
import { ArrowLeft } from 'lucide-react-native';

export default function SettingsScreen({ navigation }: any) {
  const [serverIP, setServerIP] = useState('');
  const [currentIP, setCurrentIP] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const ip = await getServerIP();
    setServerIP(ip);
    setCurrentIP(ip);
    const u = await AsyncStorage.getItem(STORAGE_KEYS.USER);
    if (u) setUser(JSON.parse(u));
  };

  const testConnection = async () => {
    const ip = serverIP.trim() || DEFAULT_SERVER_IP;
    setTesting(true);
    try {
      const base = buildBaseURL(ip).replace('/api', '');
      await axios.get(`${base}/`, { timeout: 5000 });
      Alert.alert('✅ सफल!', `${ip} मा सफलतापूर्वक जडान भयो।`);
    } catch (err: any) {
      if ([200, 301, 302, 400, 401, 403, 404].includes(err.response?.status)) {
        Alert.alert('✅ Server सक्रिय छ!', `${ip} मा server चलिरहेको छ।`);
      } else {
        Alert.alert(
          '❌ जडान असफल',
          `${ip} मा पुग्न सकिएन।\n\n• Backend चलिरहेको छ?\n• IP/Port ठिक छ?\n• Network OK?`,
        );
      }
    } finally {
      setTesting(false);
    }
  };

  const saveSettings = async () => {
    const ip = serverIP.trim() || DEFAULT_SERVER_IP;
    setSaving(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SERVER_IP, ip);
      setCurrentIP(ip);
      Alert.alert('✅ सुरक्षित भयो', `Server IP "${ip}" मा अपडेट गरियो।`);
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = () => {
    setServerIP(DEFAULT_SERVER_IP);
  };

  const handleLogout = async () => {
    Alert.alert('लगआउट', 'के तपाईं लगआउट गर्न चाहनुहुन्छ?', [
      { text: 'रद्द', style: 'cancel' },
      {
        text: 'लगआउट',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
          await AsyncStorage.removeItem(STORAGE_KEYS.USER);
          navigation.replace('Login');
        },
      },
    ]);
  };

  const resetOnboarding = async () => {
    await AsyncStorage.removeItem(STORAGE_KEYS.ONBOARDING_DONE);
    Alert.alert('रिसेट', 'अर्को पटक खोल्दा Onboarding देखाइनेछ।');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1e1b4b" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>⚙️ सेटिङ</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* User info card */}
        {user && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>👤 खाता जानकारी</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoKey}>Username</Text>
              <Text style={styles.infoValue}>{user.username}</Text>
            </View>
            {user.email ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Email</Text>
                <Text style={styles.infoValue}>{user.email}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Server IP card */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>🌐 Backend Server</Text>
          <Text style={styles.currentLabel}>
            हालको IP: <Text style={styles.currentValue}>{currentIP}</Text>
          </Text>

          <Text style={styles.fieldLabel}>नयाँ IP : Port</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.ipInput}
              value={serverIP}
              onChangeText={setServerIP}
              placeholder={DEFAULT_SERVER_IP}
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.testBtn, testing && styles.btnDisabled]}
              onPress={testConnection}
              disabled={testing}
            >
              {testing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.testBtnText}>🔗 Test</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.btnDisabled]}
              onPress={saveSettings}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>💾 सुरक्षित</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.resetBtn} onPress={resetToDefault}>
              <Text style={styles.resetBtnText}>↺ Default</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.hintBox}>
            <Text style={styles.hintTitle}>💡 IP कसरी थाहा पाउने?</Text>
            <Text style={styles.hintText}>
              🤖 Android Emulator →{' '}
              <Text style={styles.code}>10.0.2.2:8000</Text>
              {'\n'}
              📱 Physical Device → Computer को LAN IP
              {'\n'}
              Windows: <Text style={styles.code}>ipconfig</Text> → IPv4 Address
              {'\n'}
              Mac/Linux: <Text style={styles.code}>ifconfig</Text> → inet addr
            </Text>
          </View>
        </View>

        {/* Danger zone */}
        <View style={[styles.card, styles.dangerCard]}>
          <Text style={styles.sectionLabel}>⚠️ अन्य विकल्पहरू</Text>
          <TouchableOpacity style={styles.dangerBtn} onPress={resetOnboarding}>
            <Text style={styles.dangerBtnText}>
              🔄 Onboarding रिसेट गर्नुहोस्
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dangerBtn, styles.logoutBtn]}
            onPress={handleLogout}
          >
            <Text style={[styles.dangerBtnText, styles.logoutText]}>
              🚪 लगआउट गर्नुहोस्
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>
          SevaBot Mobile v1.0 · React Native 0.84
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1b4b',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 44,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  dangerCard: {
    borderWidth: 1,
    borderColor: '#fecdd3',
    backgroundColor: '#fff5f5',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#374151',
    marginBottom: 14,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoKey: {
    fontSize: 14,
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  currentLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 14,
  },
  currentValue: {
    fontWeight: '700',
    color: '#2563eb',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  inputRow: {
    marginBottom: 14,
  },
  ipInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  testBtn: {
    flex: 1,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  resetBtn: {
    paddingHorizontal: 14,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  hintBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  hintTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e40af',
    marginBottom: 6,
  },
  hintText: {
    fontSize: 12,
    color: '#374151',
    lineHeight: 20,
  },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: '#dbeafe',
    color: '#1e40af',
  },
  dangerBtn: {
    backgroundColor: '#fff1f2',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  dangerBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#be123c',
  },
  logoutBtn: {
    backgroundColor: '#450a0a',
    borderColor: '#7f1d1d',
    marginBottom: 0,
  },
  logoutText: {
    color: '#fca5a5',
  },
  version: {
    textAlign: 'center',
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 8,
  },
});
