import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/**
 * The separator between metadata items («۶ دقیقه • مقدماتی»).
 *
 * It is a drawn 4pt element, never the middot character: in Yekan Bakh U+00B7
 * is glyph-identical to ۰, so «۶ دقیقه · مقدماتی» reads as «۶ دقیقه ۰ مقدماتی»
 * and «۳۴ دقیقه» becomes ۳۴۰. Drawing it also keeps the screen-reader string
 * clean, which is why it carries no accessible role.
 */
export function MetaDot({ size = 4 }: { size?: number }) {
  const theme = useTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.textSecondary,
        alignSelf: 'center',
        flexShrink: 0,
      }}
    />
  );
}
