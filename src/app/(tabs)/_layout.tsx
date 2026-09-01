import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import AppTabs from '@/components/app-tabs';
import { useAuth } from '@/context/AuthContext';

export default function TabsLayout() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      // Small timeout ensures navigation happens after render cycle
      setTimeout(() => {
        router.replace('/auth');
      }, 0);
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return null; // Or a loading spinner
  }

  return <AppTabs />;
}
