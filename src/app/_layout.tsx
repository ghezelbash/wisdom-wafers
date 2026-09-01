import '../../global.css';
import '../i18n';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useFonts } from 'expo-font';
import { AuthProvider } from '@/context/AuthContext';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  
  const [fontsLoaded] = useFonts({
    'YekanBakh-Light': require('../../assets/fonts/YekanBakhFaNum-Light.ttf'),
    'YekanBakh-Regular': require('../../assets/fonts/YekanBakhFaNum-Regular.ttf'),
    'YekanBakh-SemiBold': require('../../assets/fonts/YekanBakhFaNum-SemiBold.ttf'),
    'YekanBakh-Bold': require('../../assets/fonts/YekanBakhFaNum-Bold.ttf'),
    'YekanBakh-ExtraBold': require('../../assets/fonts/YekanBakhFaNum-ExtraBold.ttf'),
    'YekanBakh-Black': require('../../assets/fonts/YekanBakhFaNum-Black.ttf'),
  });

  if (!fontsLoaded) {
    return null; // Or return a custom loading view. Expo Splash Screen keeps hiding anyway until we are ready
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="lesson" />
          <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );
}
