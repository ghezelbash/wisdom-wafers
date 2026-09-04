import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { join } from 'path';

export const PROJECT_ID = 'demo-dananeh';

export async function makeTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(join(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8181,
    },
  });
}

/** A signed-in reader with no staff claims — the ordinary case. */
export const reader = (env: RulesTestEnvironment, uid = 'reader-1') =>
  env.authenticatedContext(uid).firestore();

/** Staff contexts carry the custom claim the rules check. */
export const staff = (env: RulesTestEnvironment, role: string, uid = `${role}-1`) =>
  env.authenticatedContext(uid, { [role]: true }).firestore();

export const anonymous = (env: RulesTestEnvironment) => env.unauthenticatedContext().firestore();
