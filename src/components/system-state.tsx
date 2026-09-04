import React from 'react';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/Text';

export interface SystemStateAction {
  label: string;
  onPress: () => void;
}

/**
 * A failure, an empty result, or a wait — drawn the same way everywhere.
 *
 * Every failure names what still works and offers a second action that is not
 * "retry": an offline reader who can only press retry is stuck. Identifiers
 * (error codes, versions, ids) are LTR-isolated in monospace so they can be
 * read aloud or copied.
 */
export function SystemState({
  icon = 'info',
  tone = 'neutral',
  title,
  body,
  facts,
  primary,
  secondary,
}: {
  icon?: IconName;
  tone?: 'neutral' | 'error';
  title: string;
  body: string;
  /** Label / value pairs; values render as isolated Latin when technical. */
  facts?: { label: string; value: string; mono?: boolean }[];
  primary?: SystemStateAction;
  secondary?: SystemStateAction;
}) {
  return (
    <View className="flex-1 justify-center px-6">
      <View
        className={`mb-6 h-14 w-14 items-center justify-center rounded-card ${
          tone === 'error' ? 'bg-error-tint' : 'bg-brand-tint'
        }`}>
        <Icon name={icon} size={26} color={tone === 'error' ? 'errorInk' : 'brand'} />
      </View>

      <Text variant="titleLg" className="mb-3">
        {title}
      </Text>
      <Text variant="body" color="secondary" className="mb-6">
        {body}
      </Text>

      {facts?.length ? (
        <View className="mb-7 gap-2 rounded-card border border-hairline bg-card p-4">
          {facts.map((fact) => (
            <View key={fact.label} className="flex-row items-center gap-3">
              <Text variant="caption" color="secondary">
                {fact.label}
              </Text>
              <Text variant="caption" weight="bold" mono={fact.mono} ltr={fact.mono}>
                {fact.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {primary ? <Button label={primary.label} onPress={primary.onPress} className="mb-2" /> : null}
      {/* The second action is never another retry. */}
      {secondary ? (
        <Button variant="secondary" size="lg" label={secondary.label} onPress={secondary.onPress} />
      ) : null}
    </View>
  );
}
