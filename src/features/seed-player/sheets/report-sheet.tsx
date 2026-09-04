import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/Text';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { track } from '@/platform/analytics';

import { AnswerOption } from '../answer-option';
import type { ReportCategory } from '@/domain/progress/events';

// The same five the schema and the rules accept — the sheet cannot offer a
// category the server would reject.
const REASONS: readonly ReportCategory[] = [
  'factual',
  'sources',
  'language',
  'inappropriate',
  'technical',
];

/** Five categories, an optional note, and a stated turnaround — reports are
 *  read by people, and the sheet says so. */
export function ReportSheet({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (category: ReportCategory, detail: string) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [reason, setReason] = useState<ReportCategory | null>(null);
  const [detail, setDetail] = useState('');
  const [sent, setSent] = useState(false);

  const submit = () => {
    if (!reason) return;
    // The category is data; the reader's own words are not.
    track('content_reported', { seed_id: 'redacted', category: reason });
    onSubmit(reason, detail);
    setSent(true);
  };

  const close = () => {
    onClose();
    // Reset only after the sheet is gone, so the confirmation stays readable.
    setTimeout(() => {
      setSent(false);
      setReason(null);
      setDetail('');
    }, 300);
  };

  return (
    <Sheet visible={visible} onClose={close} accessibilityLabel={t('common.close')}>
      <View className="p-5">
        {sent ? (
          <View accessibilityLiveRegion="polite">
            <Text variant="titleMd" className="mb-2">
              {t('report.sentTitle')}
            </Text>
            <Text variant="bodySm" color="secondary" className="mb-5">
              {t('report.sentBody')}
            </Text>
            <Button label={t('common.close')} onPress={close} />
          </View>
        ) : (
          <>
            <Text variant="titleMd" className="mb-2">
              {t('report.title')}
            </Text>
            <Text variant="caption" color="secondary" className="mb-4">
              {t('report.note')}
            </Text>

            <View className="mb-4 gap-2">
              {REASONS.map((id) => (
                <AnswerOption
                  key={id}
                  text={t(`report.reasons.${id}`)}
                  state={reason === id ? 'selected' : 'idle'}
                  onPress={() => setReason(id)}
                />
              ))}
            </View>

            <TextInput
              multiline
              value={detail}
              onChangeText={setDetail}
              placeholder={t('report.detail')}
              placeholderTextColor={theme.textSecondary}
              className="mb-4 rounded-input border border-hairline bg-canvas p-4"
              style={{
                minHeight: 88,
                color: theme.textPrimary,
                fontFamily: Fonts.sans,
                fontSize: 15,
                lineHeight: 26,
                textAlignVertical: 'top',
                outlineWidth: 2,
                outlineColor: theme.brand,
                outlineOffset: 2,
              }}
            />

            <Button label={t('report.submit')} disabled={!reason} onPress={submit} />
          </>
        )}
      </View>
    </Sheet>
  );
}
