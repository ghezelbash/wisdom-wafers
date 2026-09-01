import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function ExploreScreen() {
  const { t } = useTranslation();

  return (
    <View className="flex-1 items-center justify-center bg-surface-light dark:bg-surface-dark p-4">
      <Text className="text-3xl font-extrabold text-gray-900 dark:text-white mb-6">
        {t('explore')}
      </Text>
      <View className="bg-white dark:bg-gray-900 p-8 rounded-4xl shadow-sm w-full">
        <Text className="text-gray-600 dark:text-gray-300 text-center font-semibold text-lg">
          Browse topics and courses here.
        </Text>
      </View>
    </View>
  );
}
