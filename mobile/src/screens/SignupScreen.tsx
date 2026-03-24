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

export default function SignupScreen({navigation}: any) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSignup = async () => {
    if (!username.trim() || !email.trim() || !password.trim()) {
      Alert.alert('त्रुटि', 'सबै फिल्डहरू आवश्यक छन्।');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('त्रुटि', 'Password मेल खाएन।');
      return;
    }
    if (password.length < 6) {
      Alert.alert('त्रुटि', 'Password कम्तीमा ६ अक्षर हुनु पर्छ।');
      return;
    }
    setLoading(true);
    try {
      const response = await authAPI.signup({
        username: username.trim(),
        email: email.trim(),
        password: password,
      });
      await AsyncStorage.setItem('token', response.data.token);
      await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
      navigation.replace('Chat');
    } catch (error: any) {
      const data = error.response?.data;
      const msg =
        data?.username?.[0] ||
        data?.email?.[0] ||
        data?.password?.[0] ||
        data?.error ||
        'दर्ता असफल भयो। पुन: प्रयास गर्नुहोस्।';
      Alert.alert('दर्ता त्रुटि', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor="#6d28d9" />
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
          <Text style={styles.tagline}>नयाँ खाता बनाउनुहोस्</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>दर्ता गर्नुहोस्</Text>
          <Text style={styles.cardSubtitle}>
            नयाँ खाता बनाएर सुरु गर्नुहोस्
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <View style={styles.inputWrapper}>
              <Icon name="person-outline" size={18} color="#9ca3af" style={{marginRight: 8}} />
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="username छान्नुहोस्"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrapper}>
              <Icon name="mail-outline" size={18} color="#9ca3af" style={{marginRight: 8}} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="email लेख्नुहोस्"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
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
                placeholder="password लेख्नुहोस्"
                placeholderTextColor="#9ca3af"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Icon name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#9ca3af" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password पुष्टि गर्नुहोस्</Text>
            <View style={styles.inputWrapper}>
              <Icon name="shield-checkmark-outline" size={18} color="#9ca3af" style={{marginRight: 8}} />
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="password पुन: लेख्नुहोस्"
                placeholderTextColor="#9ca3af"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.signupBtn, loading && styles.btnDisabled]}
            onPress={handleSignup}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.signupBtnText}>दर्ता गर्नुहोस्</Text>
            )}
          </TouchableOpacity>

          <View style={styles.loginRow}>
            <Text style={styles.loginText}>पहिले नै खाता छ? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>लगइन गर्नुहोस्</Text>
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
    backgroundColor: '#6d28d9',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoImg: {
    width: 100,
    height: 100,
    marginBottom: 8,
  },
  brand: {
    fontSize: 30,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 13,
    color: '#ddd6fe',
    marginTop: 4,
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
    marginBottom: 14,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
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
    height: 50,
    fontSize: 15,
    color: '#111827',
  },
  eyeIcon: {
    fontSize: 18,
    paddingLeft: 8,
  },
  signupBtn: {
    backgroundColor: '#7c3aed',
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#7c3aed',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  signupBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  loginText: {
    fontSize: 14,
    color: '#6b7280',
  },
  loginLink: {
    fontSize: 14,
    color: '#7c3aed',
    fontWeight: '700',
  },
});
