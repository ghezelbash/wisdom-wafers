import React from 'react';

import AppTabs from '@/components/app-tabs';

/** No auth gate: the tabs are the app, and a guest gets all of it. */
export default function TabsLayout() {
  return <AppTabs />;
}
