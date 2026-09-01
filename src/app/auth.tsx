import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/firebase';
import { useAuth } from '@/context/AuthContext';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { user, isLoading } = useAuth();
  
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, router]);

  const handleAuth = async () => {
    if (!email || !password) {
      setError(t('auth_error_empty'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      // On success, redirect to tabs
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-surface-light dark:bg-surface-dark justify-center px-6"
    >
      <View className="items-center mb-10">
        <Text className="text-4xl font-black text-brand-600 dark:text-brand-400 mb-2">
          {t('welcome')}
        </Text>
        <Text className="text-lg text-gray-500 dark:text-gray-400">
          {isLogin ? t('auth_login_subtitle') : t('auth_signup_subtitle')}
        </Text>
      </View>

      <View className="bg-white dark:bg-gray-900 p-6 rounded-4xl shadow-sm border border-gray-100 dark:border-gray-800">
        {error ? (
          <View className="bg-red-50 dark:bg-red-900/30 p-4 rounded-2xl mb-4 border border-red-200 dark:border-red-800/50">
            <Text className="text-red-600 dark:text-red-400 text-center">{error}</Text>
          </View>
        ) : null}

        <View className="mb-4">
          <Text className="text-gray-700 dark:text-gray-300 font-bold mb-2 ml-2">
            {t('auth_email')}
          </Text>
          <TextInput
            className="bg-surface-light dark:bg-black px-5 py-4 rounded-3xl text-gray-900 dark:text-white border border-gray-200 dark:border-gray-800"
            placeholder="you@example.com"
            placeholderTextColor="#9ca3af"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View className="mb-6">
          <Text className="text-gray-700 dark:text-gray-300 font-bold mb-2 ml-2">
            {t('auth_password')}
          </Text>
          <TextInput
            className="bg-surface-light dark:bg-black px-5 py-4 rounded-3xl text-gray-900 dark:text-white border border-gray-200 dark:border-gray-800"
            placeholder="••••••••"
            placeholderTextColor="#9ca3af"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity 
          className="bg-brand-500 py-4 rounded-3xl items-center shadow-sm mb-4"
          onPress={handleAuth}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-extrabold text-lg">
              {isLogin ? t('auth_login_btn') : t('auth_signup_btn')}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          className="py-3 items-center"
          onPress={() => setIsLogin(!isLogin)}
        >
          <Text className="text-brand-600 dark:text-brand-400 font-bold">
            {isLogin ? t('auth_switch_to_signup') : t('auth_switch_to_login')}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
