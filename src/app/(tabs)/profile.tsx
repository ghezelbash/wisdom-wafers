import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { auth } from '@/firebase';
import { signOut } from 'firebase/auth';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const handleSignOut = () => {
    signOut(auth);
  };

  return (
    <View className="flex-1 items-center justify-center bg-surface-light dark:bg-surface-dark p-4">
      <Text className="text-3xl font-extrabold text-gray-900 dark:text-white mb-6">
        {t('profile')}
      </Text>
      <View className="bg-white dark:bg-gray-900 p-8 rounded-4xl shadow-sm w-full mb-6">
        <Text className="text-gray-600 dark:text-gray-300 text-center font-semibold text-lg mb-4">
          Logged in as:
        </Text>
        <Text className="text-brand-600 dark:text-brand-400 text-center font-bold text-xl">
          {user?.email}
        </Text>
      </View>

      <TouchableOpacity 
        className="bg-red-50 dark:bg-red-900/30 border-2 border-red-100 dark:border-red-800/50 py-4 px-8 rounded-full w-full items-center shadow-sm"
        onPress={handleSignOut}
      >
        <Text className="text-red-600 dark:text-red-400 font-bold text-xl">Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}
