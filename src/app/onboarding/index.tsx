import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/icon';
import { Button } from '@/components/button';
import { Text } from '@/components/Text';

/** 1 · Brand promise — one claim, one out. */
export default function BrandPromiseScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <View className="flex-1 justify-center px-6">
        <BrandMark size={88} />
        <Text variant="display" className="mb-5 mt-9">
          {t('onboarding.promise.title')}
        </Text>
        <Text variant="body" color="secondary">
          {t('onboarding.promise.body')}
        </Text>
      </View>

      <View className="px-6 pb-8">
        <Button
          label={t('onboarding.promise.cta')}
          onPress={() => router.push('/onboarding/interests')}
          className="mb-3"
        />
        {/* The out is a real option, not a dead link: an existing account can
            sign in before any of this. */}
        <Button
          variant="ghost"
          label={t('onboarding.promise.signIn')}
          onPress={() => router.push('/auth')}
        />
      </View>
    </SafeAreaView>
  );
}
