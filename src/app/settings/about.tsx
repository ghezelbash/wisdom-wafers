import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import { MinTouchTarget } from '@/constants/theme';
import { localizeDigits } from '@/lib/format';
import { appVariant, appVersion, buildNumber } from '@/platform/app-info';

/**
 * What a beta tester, and later a store reviewer, has to be able to find.
 *
 * A build with no privacy policy, no terms, no support address, no version and
 * no statement of how to delete an account cannot be distributed — Play asks
 * for every one of them, and a tester who hits a bug has nowhere to write.
 * None of it existed.
 *
 * Two things here are load-bearing rather than decorative:
 *
 *  - **The version and the build number, together.** Three internal APKs share
 *    `1.0.0`. "Which build were you on?" is the first question a crash report
 *    has to answer, and a tester can only answer it from a screen.
 *  - **The deletion disclosure, next to the way to do it.** The requirement is
 *    that deletion is described *and* reachable from inside the app; a policy
 *    page that mentions it while the app hides it satisfies neither.
 *
 * The two policy URLs are the one thing here that is not yet real. They are
 * declared in one place, and `about.test.ts` fails while they still point at a
 * placeholder host — so this cannot ship half-done without the build going red.
 */

/** Replace both when the pages are published; the test enforces that they are. */
export const LEGAL_URLS = {
  privacy: 'https://dananeh.app/privacy',
  terms: 'https://dananeh.app/terms',
};

export const SUPPORT_EMAIL = 'support@dananeh.app';

function Row({
  label,
  value,
  onPress,
  testID,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  testID?: string;
}) {
  const Container = onPress ? Pressable : View;

  return (
    <Container
      accessibilityRole={onPress ? 'link' : undefined}
      testID={testID}
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-hairline px-4"
      style={{ minHeight: MinTouchTarget + 8 }}>
      <Text variant="bodySm" className="min-w-0 flex-1">
        {label}
      </Text>
      <Text variant="bodySm" color={onPress ? 'brand' : 'secondary'} ltr={!onPress}>
        {value}
      </Text>
      {onPress ? <Icon name="chevronBack" size={17} color="brand" /> : null}
    </Container>
  );
}

export default function AboutScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const open = (url: string) => {
    void Linking.openURL(url).catch(() => {
      // A device with no browser is not a reason to take the screen down.
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <View className="flex-row items-center px-5" style={{ height: MinTouchTarget + 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          className="items-center justify-center"
          style={{ width: MinTouchTarget, height: MinTouchTarget, marginStart: -10 }}>
          <Icon name="chevronBack" size={22} />
        </Pressable>
        <Text variant="label" className="flex-1 text-center" style={{ marginEnd: MinTouchTarget }}>
          {t('about.title')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Which build this is. Latin digits inside an LTR run: a version is a
            technical string, not prose. */}
        <View className="mb-6 overflow-hidden rounded-card border border-hairline bg-card">
          <Row label={t('about.version')} value={appVersion()} />
          <Row label={t('about.build')} value={buildNumber()} />
          <Row label={t('about.environment')} value={appVariant()} />
        </View>

        <Text variant="caption" weight="bold" color="secondary" className="mb-2 px-1">
          {t('about.legalTitle')}
        </Text>
        <View className="mb-6 overflow-hidden rounded-card border border-hairline bg-card">
          <Row
            testID="about-privacy"
            label={t('about.privacy')}
            value={t('about.openLink')}
            onPress={() => open(LEGAL_URLS.privacy)}
          />
          <Row
            testID="about-terms"
            label={t('about.terms')}
            value={t('about.openLink')}
            onPress={() => open(LEGAL_URLS.terms)}
          />
          <Row
            testID="about-support"
            label={t('about.support')}
            value={SUPPORT_EMAIL}
            onPress={() => open(`mailto:${SUPPORT_EMAIL}`)}
          />
        </View>

        <View className="mb-6 rounded-card border border-hairline bg-card p-4">
          <Text variant="bodySm" weight="bold" className="mb-2">
            {t('about.dataTitle')}
          </Text>
          <Text variant="bodySm" color="secondary">
            {t('about.dataBody')}
          </Text>
        </View>

        {/* Described and reachable, in the same place. */}
        <View className="mb-6 rounded-card border border-hairline bg-card p-4">
          <Text variant="bodySm" weight="bold" className="mb-2">
            {t('about.deletionTitle')}
          </Text>
          <Text variant="bodySm" color="secondary" className="mb-3">
            {t('about.deletionBody')}
          </Text>
          <Pressable
            accessibilityRole="button"
            testID="about-delete-account"
            onPress={() => router.push('/settings/delete-account')}
            style={{ minHeight: MinTouchTarget, justifyContent: 'center' }}>
            <Text variant="bodySm" weight="bold" color="brand">
              {t('about.deletionCta')}
            </Text>
          </Pressable>
        </View>

        <View className="rounded-card border border-hairline bg-brand-tint p-4">
          <Text variant="caption" weight="bold" color="brand" className="mb-2">
            {t('about.beta')} · {localizeDigits(appVersion(), i18n.language)}
          </Text>
          <Text variant="caption" color="secondary">
            {t('about.betaBody')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
