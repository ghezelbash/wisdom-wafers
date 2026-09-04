import Constants from 'expo-constants';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SystemState } from '@/components/system-state';
import i18n from '@/i18n';
import { getAnalyticsContext } from '@/platform/analytics';
import { reportError } from '@/platform/crash';

interface State {
  error: Error | null;
  /** Short, readable, copyable — the thing a reader can quote in a report. */
  incidentId: string;
}

/**
 * The fatal state, made real.
 *
 * A crash lands here instead of a white screen: it says the error was logged,
 * shows a copyable identifier and the version in an LTR monospace slot, and
 * offers restart plus reporting rather than a dead end.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, incidentId: '' };

  static getDerivedStateFromError(error: Error): State {
    const id = Math.random().toString(16).slice(2, 6) + '-' + Math.random().toString(16).slice(2, 6);
    return { error, incidentId: id };
  }

  componentDidCatch(error: Error) {
    // Route, seed, revision and online state — enough to reproduce, and nothing
    // the reader typed. The message and stack are scrubbed on the way out: an
    // exception message is the least controlled string in the app.
    reportError(error, { fatal: true, extra: { incident_id: this.state.incidentId } });

    if (__DEV__) {
      console.error('[fatal]', this.state.incidentId, getAnalyticsContext(), error);
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    const version = `${Constants.expoConfig?.version ?? '1.0.0'}`;

    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
        <SystemState
          icon="alert"
          tone="error"
          title={i18n.t('fatal.title')}
          body={i18n.t('fatal.body')}
          facts={[
            { label: i18n.t('fatal.idLabel'), value: this.state.incidentId, mono: true },
            { label: i18n.t('fatal.versionLabel'), value: version, mono: true },
          ]}
          primary={{
            label: i18n.t('fatal.restart'),
            onPress: () => this.setState({ error: null, incidentId: '' }),
          }}
        />
      </SafeAreaView>
    );
  }
}
