import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/Text';
import { MinTouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Four tabs. Search is a pushed screen from Home and Explore, never a fifth
 *  tab, and the player lives outside the tabs entirely. */
const TAB_ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  index: { active: 'home', inactive: 'homeOutline' },
  explore: { active: 'search', inactive: 'search' },
  garden: { active: 'garden', inactive: 'garden' },
  profile: { active: 'person', inactive: 'person' },
};

/**
 * The bar is 76pt border-box plus the home-indicator inset — content-box plus
 * padding silently adds 11pt. Tab changes are instant: only the icon's fill
 * state animates, never the screen.
 */
function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-row items-start border-t border-hairline bg-card"
      style={{ height: 76 + insets.bottom, paddingTop: 11, paddingBottom: insets.bottom }}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const label = typeof options.title === 'string' ? options.title : route.name;
        const icons = TAB_ICONS[route.name] ?? TAB_ICONS.index;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            testID={`tab-${route.name}`}
            className="flex-1 items-center gap-[5px]"
            // The icon, the gap and an 11pt label come to 42 — two short of the
            // floor. The bar has 65pt of room above the inset, so the target
            // grows downwards and nothing moves.
            style={{ minHeight: MinTouchTarget }}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            }}>
            <Icon
              name={focused ? icons.active : icons.inactive}
              size={23}
              color={focused ? 'brand' : 'textSecondary'}
            />
            <Text
              variant="caption"
              weight={focused ? 'bold' : 'semibold'}
              color={focused ? 'brand' : 'secondary'}
              style={{ fontSize: 11, lineHeight: 14 }}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function AppTabs() {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.canvas },
        // Tabs keep their scroll position and change with no transition.
        animation: Platform.OS === 'web' ? 'none' : undefined,
      }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="explore" options={{ title: t('tabs.explore') }} />
      <Tabs.Screen name="garden" options={{ title: t('tabs.garden') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
