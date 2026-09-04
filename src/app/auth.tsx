import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import { MinTouchTarget, Fonts } from '@/constants/theme';
import { authErrorKey, useIdentity } from '@/context/AuthContext';
import { AuthError } from '@/domain/identity/types';
import { useSession } from '@/context/SessionContext';
import { useTheme } from '@/hooks/use-theme';

/**
 * Sign in / create account.
 *
 * This is an offer, never a wall: it is reached from the brand promise, from
 * Profile, or after a completed seed, and every path out of it keeps the reader
 * in the app as a guest. Guest data carries over — an account adds devices, it
 * does not unlock the product.
 */
export default function AuthScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useTheme();
  const { completeOnboarding } = useSession();
  const { createAccount, signIn, isLocalOnly } = useIdentity();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignIn, setIsSignIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Signing up with an address that already has an account is a fork in the
  // road, not a failure: the offer is to sign into it, and the copy says what
  // happens to what is on this device.
  const [collision, setCollision] = useState(false);

  const dismiss = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const handleAuth = async (mode: 'signIn' | 'signUp' = isSignIn ? 'signIn' : 'signUp') => {
    if (!email || !password) {
      setError(t('auth.errorEmpty'));
      return;
    }

    setLoading(true);
    setError('');
    setCollision(false);

    try {
      // Creating an account links the anonymous identity rather than replacing
      // it, so everything read so far comes along.
      if (mode === 'signIn') {
        await signIn(email, password);
      } else {
        await createAccount(email, password);
      }
      // Someone with an account has already made these choices once; do not
      // send them back through onboarding.
      completeOnboarding();
      dismiss();
    } catch (err) {
      if (mode === 'signUp' && err instanceof AuthError && err.code === 'emailInUse') {
        setCollision(true);
      } else {
        setError(t(authErrorKey(err)));
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Takes the fork: the same credentials, down the sign-in path.
   *
   * The mode is passed rather than read from state — `setIsSignIn` has not
   * applied yet at this point, so reading it would run the sign-up path again.
   */
  const signInToExisting = () => {
    setCollision(false);
    setIsSignIn(true);
    void handleAuth('signIn');
  };

  /** Latin credentials sit in an LTR-isolated monospace slot inside the RTL
   *  form, so an address never reflows around its punctuation. */
  const fieldStyle = {
    minHeight: MinTouchTarget + 8,
    color: theme.textPrimary,
    fontFamily: Fonts.mono,
    fontSize: 15,
    writingDirection: 'ltr' as const,
    textAlign: 'left' as const,
    outlineWidth: 2,
    outlineColor: theme.brand,
    outlineOffset: 2,
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <View className="flex-row items-center px-5" style={{ height: MinTouchTarget + 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={dismiss}
          className="items-center justify-center"
          style={{ width: MinTouchTarget, height: MinTouchTarget, marginStart: -10 }}>
          <Icon name="close" size={22} />
        </Pressable>
        <Text variant="label" className="flex-1 text-center" style={{ marginEnd: MinTouchTarget }}>
          {isSignIn ? t('auth.title') : t('auth.signUpTitle')}
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="min-w-0 flex-1">
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 18 }}>
          <Text variant="titleLg" className="mb-2">
            {isSignIn ? t('auth.welcomeBack') : t('auth.signUpTitle')}
          </Text>
          <Text variant="bodySm" color="secondary" className="mb-2">
            {isSignIn ? t('auth.subtitle') : t('auth.signUpSubtitle')}
          </Text>
          {/* Stated before the action, not discovered after it: signing in
              brings this device's reading with it. */}
          <Text variant="caption" color="secondary" className="mb-6">
            {t('auth.carryOver')}
          </Text>

          {isLocalOnly ? (
            <View className="mb-4 flex-row items-start gap-2 rounded-input border border-hairline bg-sun-tint p-4">
              <Icon name="alert" size={18} color="sunInk" />
              <Text variant="bodySm" className="min-w-0 flex-1">
                {t('auth.unavailable')}
              </Text>
            </View>
          ) : null}

          {collision ? (
            <View className="mb-4 rounded-input border border-hairline bg-card p-4">
              <Text variant="label" className="mb-1">
                {t('auth.existingAccountTitle')}
              </Text>
              <Text variant="bodySm" color="secondary" className="mb-3">
                {t('auth.existingAccountBody')}
              </Text>
              <Button
                variant="secondary"
                label={t('auth.existingAccountAction')}
                onPress={signInToExisting}
              />
            </View>
          ) : null}

          {error ? (
            <View
              accessibilityLiveRegion="polite"
              className="mb-4 flex-row items-start gap-2 rounded-input border border-error bg-error-tint p-4">
              <Icon name="alert" size={18} color="errorInk" />
              <Text variant="bodySm" color="error" className="min-w-0 flex-1">
                {error}
              </Text>
            </View>
          ) : null}

          <Text variant="label" className="mb-2">
            {t('auth.email')}
          </Text>
          <TextInput
            className="mb-4 rounded-input border border-hairline bg-card px-5 py-4"
            style={fieldStyle}
            placeholder="you@example.com"
            placeholderTextColor={theme.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />

          <Text variant="label" className="mb-2">
            {t('auth.password')}
          </Text>
          <TextInput
            className="mb-6 rounded-input border border-hairline bg-card px-5 py-4"
            style={fieldStyle}
            placeholder="••••••••"
            placeholderTextColor={theme.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Button
            label={isSignIn ? t('auth.signIn') : t('auth.signUp')}
            loading={loading}
            onPress={() => handleAuth()}
            className="mb-3"
          />
          <Button
            variant="ghost"
            label={isSignIn ? t('auth.switchToSignUp') : t('auth.switchToSignIn')}
            onPress={() => setIsSignIn((current) => !current)}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* The way out is a real, equally reachable action. */}
      <View className="px-6 pb-6">
        <Button variant="ghost" label={t('auth.continueAsGuest')} onPress={dismiss} />
      </View>
    </SafeAreaView>
  );
}
