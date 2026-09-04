import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Text } from '@/components/Text';
import type { EnvIssue } from '@/platform/env';

/**
 * The build is not the build it says it is.
 *
 * Deliberately unlocalised and technical: the only person who can ever see this
 * is whoever assembled the binary, and what they need is the exact variable
 * name, not a reassuring sentence. It replaces the app rather than warning
 * inside it — a staging build that cannot reach staging has nothing true to
 * show, and quietly degrading to a device-local identity is precisely how the
 * original misconfiguration went unnoticed.
 */
export function MisconfiguredEnvironment({ issues }: { issues: EnvIssue[] }) {
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View className="mb-4 flex-row items-center gap-2">
          <Icon name="alert" size={22} color="errorInk" />
          <Text variant="titleMd" color="error">
            Build misconfigured
          </Text>
        </View>

        <Text variant="bodySm" color="secondary" className="mb-5">
          This binary declares an environment it is not configured for, so it has
          been stopped rather than started on a device-local identity. Fix the
          EAS environment for this build profile and rebuild.
        </Text>

        {issues.map((issue) => (
          <View
            key={`${issue.key}:${issue.problem}`}
            className="mb-3 rounded-card border border-error bg-error-tint p-4">
            <Text variant="label" color="error" ltr mono className="mb-1">
              {issue.key}
            </Text>
            <Text variant="caption" color="secondary" ltr>
              {issue.detail}
            </Text>
          </View>
        ))}

        <Text variant="caption" color="secondary" ltr mono className="mt-2">
          docs/runbooks/environments.md
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
