/**
 * The emulators' own REST APIs.
 *
 * Used in place of `firebase-admin/storage` and `firebase-admin/auth` in the
 * Node suites. Both of those keep HTTP agents alive that `deleteApp` does not
 * drain, so a run that had finished sat there until the sockets idled out and
 * Jest reported it as a process that would not exit.
 *
 * Nothing is weakened by the swap: bytes really land in the Storage emulator
 * and accounts really exist in the Auth emulator. If anything the assertions
 * get stronger, because the Auth helper lets a test check that a record is
 * actually gone rather than only that deletion was requested.
 */

const STORAGE_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

/** Uploads an object, the way the publish pipeline's `putObject` would. */
export async function putObject(
  bucket: string,
  path: string,
  body: string,
  contentType = 'application/json'
): Promise<void> {
  const url =
    `http://${STORAGE_HOST}/upload/storage/v1/b/${encodeURIComponent(bucket)}/o` +
    `?uploadType=media&name=${encodeURIComponent(path)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });

  if (!response.ok) {
    throw new Error(`storage upload failed: ${response.status} ${await response.text()}`);
  }
}

const authUrl = (project: string, suffix: string) =>
  `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${project}${suffix}`;

const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

export interface EmulatorAccount {
  localId: string;
  email?: string;
}

/** Every account in the project. The listing endpoint is a POST, not a GET. */
export async function listAccounts(project: string): Promise<EmulatorAccount[]> {
  const response = await fetch(authUrl(project, '/accounts:query'), {
    method: 'POST',
    headers: OWNER,
    body: '{}',
  });
  if (!response.ok) throw new Error(`accounts:query failed: ${response.status}`);

  const data = (await response.json()) as { userInfo?: EmulatorAccount[] };
  return data.userInfo ?? [];
}

export const accountExists = async (project: string, uid: string): Promise<boolean> =>
  (await listAccounts(project)).some((account) => account.localId === uid);

/** Creates a password account and returns its uid. */
export async function createAccount(
  project: string,
  email: string,
  password: string
): Promise<string> {
  const response = await fetch(authUrl(project, '/accounts'), {
    method: 'POST',
    headers: OWNER,
    body: JSON.stringify({ email, password, emailVerified: false }),
  });
  if (!response.ok) throw new Error(`account create failed: ${response.status}`);

  return ((await response.json()) as { localId: string }).localId;
}

export async function deleteAccount(project: string, uid: string): Promise<void> {
  await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:delete`, {
    method: 'POST',
    headers: OWNER,
    body: JSON.stringify({ localId: uid }),
  });
}
