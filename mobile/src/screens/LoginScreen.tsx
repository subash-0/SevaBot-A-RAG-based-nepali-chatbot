import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {authAPI} from '../services/api';

export default function LoginScreen({navigation}: any) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('त्रुटि', 'username र password आवश्यक छ।');
      return;
    }
    setLoading(true);
    try {
      const response = await authAPI.login({
        username: username.trim(), 
        password: password 
      });
      await AsyncStorage.setItem('token', response.data.token);
      await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
      navigation.replace('Chat');
    } catch (error: any) {
      const msg =
        error.response?.data?.error ||
        error.response?.data?.non_field_errors?.[0] ||
        'लगइन असफल भयो। पुन: प्रयास गर्नुहोस्।';
      Alert.alert('लगइन त्रुटि', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Image 
            source={require('../../assets/logo.png')} 
            style={styles.logoImg} 
            resizeMode="contain" 
          />
          <Text style={styles.brand}>SevaBot</Text>
          <Text style={styles.tagline}>
            नेपाली कानुनी सहायक | RAG Chatbot
          </Text>
          <TouchableOpacity 
            style={styles.settingsBtn}
            onPress={() => navigation.navigate('Settings')}>
            <Icon name="settings-outline" size={14} color="#bfdbfe" style={{marginRight: 4}} />
            <Text style={styles.settingsIconText}>Server IP मिलाउनुहोस्</Text>
          </TouchableOpacity>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>लगइन गर्नुहोस्</Text>
          <Text style={styles.cardSubtitle}>आफ्नो खातामा प्रवेश गर्नुहोस्</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <View style={styles.inputWrapper}>
              <Icon name="person-outline" size={18} color="#9ca3af" style={{marginRight: 8}} />
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="आफ्नो username लेख्नुहोस्"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
 
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Icon name="lock-closed-outline" size={18} color="#9ca3af" style={{marginRight: 8}} />
              <TextInput
                style={[styles.input, {flex: 1}]}
                value={password}
                onChangeText={setPassword}
                placeholder="आफ्नो password लेख्नुहोस्"
                placeholderTextColor="#9ca3af"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Icon name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#9ca3af" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginBtnText}>लगइन गर्नुहोस्</Text>
            )}
          </TouchableOpacity>

          <View style={styles.signupRow}>
            <Text style={styles.signupText}>खाता छैन? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.signupLink}>दर्ता गर्नुहोस्</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1d4ed8',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoImg: {
    width: 120,
    height: 120,
    marginBottom: 8,
  },
  brand: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 13,
    color: '#bfdbfe',
    marginTop: 4,
    textAlign: 'center',
  },
  settingsBtn: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsIconText: {
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: '#f9fafb',
  },
  inputIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: 15,
    color: '#111827',
  },
  eyeIcon: {
    fontSize: 18,
    paddingLeft: 8,
  },
  loginBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#2563eb',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  loginBtnDisabled: {
    opacity: 0.7,
  },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  signupText: {
    fontSize: 14,
    color: '#6b7280',
  },
  signupLink: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '700',
  },
});
