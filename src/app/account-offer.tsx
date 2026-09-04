import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { BrandMark, Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import { useSession } from '@/context/SessionContext';

const POINTS = ['carriesOver', 'noSubscription', 'deletable'] as const;

/**
 * The account offer, made once after a completion.
 *
 * It states that guest data carries over, and there is no paywall in the MVP —
 * an account adds devices, it does not unlock anything.
 */
export default function AccountOfferScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { update } = useSession();

  const dismiss = () => {
    update({ accountOfferSeen: true });
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <View className="flex-1 justify-center px-6">
        <BrandMark size={56} />
        <Text variant="titleLg" className="mb-3 mt-6">
          {t('account.title')}
        </Text>
        <Text variant="body" color="secondary" className="mb-7">
          {t('account.body')}
        </Text>

        <View className="gap-3">
          {POINTS.map((point) => (
            <View key={point} className="flex-row items-center gap-3">
              <Icon name="check" size={18} color="brand" />
              <Text variant="bodySm" className="min-w-0 flex-1">
                {t(`account.points.${point}`)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className="px-6 pb-8">
        <Button
          label={t('account.email')}
          className="mb-2"
          onPress={() => {
            update({ accountOfferSeen: true });
            router.replace('/auth');
          }}
        />
        <Button variant="ghost" label={t('account.later')} onPress={dismiss} />
      </View>
    </SafeAreaView>
  );
}
