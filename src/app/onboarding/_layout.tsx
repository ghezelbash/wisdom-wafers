import { Stack } from 'expo-router';
import React from 'react';

/** First launch: four steps, all skippable, no account and no paywall. */
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
      }}
    />
  );
}
