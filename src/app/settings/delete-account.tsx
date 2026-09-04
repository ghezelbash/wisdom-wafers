import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import { MinTouchTarget } from '@/constants/theme';
import { useIdentity } from '@/context/AuthContext';
import { useSession } from '@/context/SessionContext';
import { AccountDeletionError } from '@/domain/account/delete';
import { listProgress } from '@/lib/progress-store';

const DESTROYED = ['account', 'progress', 'reflections', 'downloads'] as const;

/**
 * Delete account.
 *
 * It names exactly what is destroyed, offers an export first, and its confirm
 * is destructive-styled rather than hidden behind a disabled control.
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { identity, deleteAccount } = useIdentity();
  const { reset } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  /**
   * The server goes first, always.
   *
   * Nothing on this device is touched until the deletion job reports it
   * finished — an empty app whose data is still on the server is worse than a
   * failure the reader can see and retry.
   */
  const confirmDelete = async () => {
    setDeleting(true);
    setError('');

    try {
      await deleteAccount();
      reset();
      router.replace('/(tabs)');
    } catch (err) {
      const reason = err instanceof AccountDeletionError ? err.reason : 'unknown';
      setError(
        t(
          {
            requiresRecentLogin: 'deleteAccount.failedRecentLogin',
            network: 'deleteAccount.failedNetwork',
            partial: 'deleteAccount.failedPartial',
            unknown: 'deleteAccount.failedUnknown',
          }[reason]
        )
      );
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  };

  const exportData = async () => {
    const progress = await listProgress();
    await Share.share({
      message: JSON.stringify({ email: identity?.email ?? null, progress }, null, 2),
    }).catch(() => {
      // A dismissed share sheet is not an error.
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <View className="flex-row items-center px-5" style={{ height: 56 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          className="items-center justify-center"
          style={{ width: MinTouchTarget, height: MinTouchTarget, marginStart: -10 }}>
          <Icon name="chevronBack" size={20} />
        </Pressable>
        <Text variant="label" className="min-w-0 flex-1">
          {t('deleteAccount.title')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8 }}>
        <Text variant="bodySm" color="secondary" className="mb-5">
          {t('deleteAccount.body')}
        </Text>

        <View className="mb-5 gap-3 rounded-card border border-hairline bg-card p-4">
          {DESTROYED.map((item) => (
            <View key={item} className="flex-row items-center gap-3">
              <Icon name="minus" size={16} color="errorInk" />
              <Text variant="bodySm" className="min-w-0 flex-1">
                {t(`deleteAccount.destroyed.${item}`)}
              </Text>
            </View>
          ))}
        </View>

        {/* The export is offered before the destructive action, not after. */}
        <View className="mb-6 rounded-card border border-hairline bg-card p-4">
          <Text variant="bodySm" weight="bold" className="mb-1">
            {t('deleteAccount.exportTitle')}
          </Text>
          <Text variant="caption" color="secondary" className="mb-3">
            {t('deleteAccount.exportBody')}
          </Text>
          <Button variant="secondary" label={t('deleteAccount.exportCta')} onPress={exportData} />
        </View>

        {error ? (
          <View
            accessibilityLiveRegion="polite"
            className="mb-4 flex-row items-start gap-2 rounded-card border border-error bg-error-tint p-4">
            <Icon name="alert" size={18} color="errorInk" />
            <Text variant="bodySm" color="error" className="min-w-0 flex-1">
              {error}
            </Text>
          </View>
        ) : null}

        {confirming ? (
          <View className="rounded-card border border-error bg-error-tint p-4">
            <Text variant="bodySm" weight="bold" color="error" className="mb-3">
              {t('deleteAccount.confirmTitle')}
            </Text>
            <Button
              variant="destructive"
              label={deleting ? t('deleteAccount.deleting') : t('deleteAccount.confirmCta')}
              loading={deleting}
              onPress={confirmDelete}
              className="mb-2"
            />
            <Button
              variant="secondary"
              label={t('deleteAccount.cancel')}
              onPress={() => setConfirming(false)}
            />
          </View>
        ) : (
          <Button
            variant="destructive"
            label={t('deleteAccount.startCta')}
            onPress={() => setConfirming(true)}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
