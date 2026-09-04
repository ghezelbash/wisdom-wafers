import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { readFileSync } from 'fs';
import { join } from 'path';

let env: RulesTestEnvironment;

const UID = 'reader-1';
const OTHER = 'reader-2';
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dananeh',
    storage: {
      rules: readFileSync(join(__dirname, '../../storage.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(), 'content/seed-1/bundle.json'), png);
  });
});

describe('published content', () => {
  it('is readable without an account — a bundle is public', async () => {
    await assertSucceeds(getBytes(ref(env.unauthenticatedContext().storage(), 'content/seed-1/bundle.json')));
  });

  it('is never writable from a client, signed in or not', async () => {
    await assertFails(
      uploadBytes(ref(env.authenticatedContext(UID).storage(), 'content/seed-1/bundle.json'), png)
    );
    await assertFails(
      deleteObject(ref(env.authenticatedContext(UID).storage(), 'content/seed-1/bundle.json'))
    );
  });
});

describe('user uploads', () => {
  const path = `quarantine/users/${UID}/avatar.png`;

  it('accepts a small image from its owner', async () => {
    await assertSucceeds(
      uploadBytes(ref(env.authenticatedContext(UID).storage(), path), png, {
        contentType: 'image/png',
      })
    );
  });

  it('rejects a type that can carry script or execute', async () => {
    const storage = env.authenticatedContext(UID).storage();
    // SVG is an image by name and a script host in practice.
    await assertFails(
      uploadBytes(ref(storage, `quarantine/users/${UID}/x.svg`), png, {
        contentType: 'image/svg+xml',
      })
    );
    await assertFails(
      uploadBytes(ref(storage, `quarantine/users/${UID}/x.html`), png, {
        contentType: 'text/html',
      })
    );
  });

  it('rejects an oversized upload', async () => {
    const large = new Uint8Array(6 * 1024 * 1024);
    await assertFails(
      uploadBytes(ref(env.authenticatedContext(UID).storage(), path), large, {
        contentType: 'image/png',
      })
    );
  });

  it('keeps one reader out of another reader\'s quarantine', async () => {
    await assertFails(
      uploadBytes(ref(env.authenticatedContext(OTHER).storage(), path), png, {
        contentType: 'image/png',
      })
    );
    await assertFails(getBytes(ref(env.authenticatedContext(OTHER).storage(), path)));
  });

  it('rejects an anonymous upload entirely', async () => {
    await assertFails(
      uploadBytes(ref(env.unauthenticatedContext().storage(), path), png, {
        contentType: 'image/png',
      })
    );
  });
});

describe('anything else', () => {
  it('is denied by default', async () => {
    await assertFails(
      uploadBytes(ref(env.authenticatedContext(UID).storage(), 'scratch/file.png'), png)
    );
    await assertFails(getBytes(ref(env.authenticatedContext(UID).storage(), 'scratch/file.png')));
  });
});
