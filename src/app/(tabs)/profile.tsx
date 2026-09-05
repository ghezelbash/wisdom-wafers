import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { BrandMark, Icon } from '@/components/icon';
import { MetaDot } from '@/components/meta-dot';
import { Text } from '@/components/Text';
import { BottomTabInset, MinTouchTarget } from '@/constants/theme';
import { useIdentity } from '@/context/AuthContext';
import { useCatalog } from '@/context/CatalogContext';
import { useSession } from '@/context/SessionContext';
import { usedBytes } from '@/lib/catalog-store';
import { formatMegabytes } from '@/lib/format-bytes';
import { appVersion } from '@/platform/app-info';
import { localizeDigits } from '@/lib/format';

function SettingsRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const Row = onPress ? Pressable : View;
  return (
    <Row
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-hairline px-4"
      style={{ minHeight: MinTouchTarget + 8 }}>
      <Text variant="bodySm" className="min-w-0 flex-1">
        {label}
      </Text>
      <Text variant="bodySm" color="secondary">
        {value}
      </Text>
      <Icon name="chevronBack" size={17} color="textSecondary" />
    </Row>
  );
}

/** Profile — an account offer, never a wall. */
export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { identity, isGuest, signOut } = useIdentity();
  const { session } = useSession();
  const { snapshot } = useCatalog();

  const paceLabel = session.pace ? t(`onboarding.pace.${session.pace}`) : t('profile.paceNone');

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="px-5 pb-[18px] pt-2">
        <Text variant="titleLg" className="mb-1">
          {t('profile.title')}
        </Text>
        <View className="flex-row items-center gap-[7px]">
          {!isGuest ? (
            <Text variant="caption" color="secondary" ltr>
              {identity?.email}
            </Text>
          ) : (
            <>
              <Text variant="caption" color="secondary">
                {t('profile.guest')}
              </Text>
              <MetaDot />
              <Text variant="caption" color="secondary">
                {t('profile.guestData')}
              </Text>
            </>
          )}
        </View>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: BottomTabInset + 24 }}>
        {isGuest ? (
          <Pressable
            accessibilityRole="button"
            testID="profile-create-account"
            onPress={() => router.push('/auth')}
            className="mb-5 flex-row items-center gap-[13px] rounded-[20px] bg-brand-tint p-4">
            <BrandMark size={40} />
            <View className="min-w-0 flex-1">
              <Text variant="bodySm" weight="bold">
                {t('profile.upgradeTitle')}
              </Text>
              <Text variant="caption" color="secondary">
                {t('profile.upgradeBody')}
              </Text>
            </View>
            <Icon name="chevronBack" size={17} color="brand" />
          </Pressable>
        ) : null}

        <Text variant="caption" weight="bold" color="secondary" className="mb-2 px-1">
          {t('profile.settings')}
        </Text>
        <View className="overflow-hidden rounded-card border border-hairline bg-card">
          <SettingsRow
            label={t('profile.interests')}
            value={t('profile.interestsValue', {
              count: localizeDigits(session.interests.length, i18n.language),
            })}
          />
          <SettingsRow label={t('profile.pace')} value={paceLabel} />
          <SettingsRow label={t('profile.language')} value={t('profile.languageValue')} />
          <SettingsRow
            label={t('profile.notifications')}
            value={
              session.notificationsEnabled
                ? (session.reminderTime ?? '')
                : t('profile.paceNone')
            }
            onPress={() => router.push('/settings/notifications')}
          />
          <SettingsRow
            label={t('profile.storage')}
            value={formatMegabytes(usedBytes(snapshot), i18n.language)}
            onPress={() => router.push('/settings/storage')}
          />
          {/* Version, build, the two policies, the support address and how to
              delete an account — none of which a tester could find before. */}
          <SettingsRow
            label={t('profile.about')}
            value={appVersion()}
            onPress={() => router.push('/settings/about')}
          />
        </View>

        {!isGuest ? (
          <>
            <Button
              variant="destructive"
              label={t('auth.signOut')}
              onPress={() => signOut()}
              className="mt-6"
            />
            <Pressable
              accessibilityRole="button"
              testID="profile-delete-account"
              onPress={() => router.push('/settings/delete-account')}
              className="mt-3 items-center justify-center"
              style={{ minHeight: MinTouchTarget }}>
              <Text variant="caption" weight="bold" color="error">
                {t('profile.deleteAccount')}
              </Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
