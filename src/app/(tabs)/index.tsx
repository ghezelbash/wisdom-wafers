import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { I18nManager } from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'fa' ? 'en' : 'fa';
    i18n.changeLanguage(nextLang);
    const isRtl = nextLang === 'fa';
    I18nManager.forceRTL(isRtl);
    // Note: React Native requires a reload to apply RTL changes
  };

  return (
    <View className="flex-1 items-center justify-center bg-surface-light dark:bg-surface-dark p-4">
      <Text className="text-3xl font-extrabold text-gray-900 dark:text-white mb-6">
        {t('welcome')}
      </Text>
      
      <View className="w-full bg-brand-50 dark:bg-brand-500/20 p-8 rounded-4xl mb-6 shadow-sm">
        <Text className="text-2xl font-bold text-brand-600 dark:text-brand-100 mb-3">
          {t('daily_recommendations')}
        </Text>
        <Text className="text-lg text-brand-600/80 dark:text-brand-200 font-semibold">
          Your byte-sized knowledge for today is ready!
        </Text>
      </View>

      <TouchableOpacity 
        className="bg-brand-500 py-4 px-8 rounded-full w-full items-center mb-4 shadow-sm"
        onPress={() => router.push('/lesson/mock-id')}
      >
        <Text className="text-white font-bold text-xl">{t('resume_learning')}</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        className="mt-8 border border-gray-300 dark:border-gray-700 py-2 px-4 rounded-full"
        onPress={toggleLanguage}
      >
        <Text className="text-gray-600 dark:text-gray-400">
          {i18n.language === 'fa' ? 'Switch to English' : 'تغییر به فارسی'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
