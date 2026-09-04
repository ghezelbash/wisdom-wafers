#!/usr/bin/env node
/**
 * What the Android build actually contains.
 *
 * `expo prebuild` succeeding proves the config plugins ran; it does not prove
 * the icons landed, that RTL is enabled, or that a reflection the app calls
 * "on this device only" is excluded from cloud backup. Those are read out of
 * the generated project here.
 *
 * Run against a prebuild you already have, or let it make one in a temp dir:
 *   node scripts/check-android-native.mjs [path-to-android-dir]
 *
 * `APP_VARIANT` says which identity to expect; it defaults to staging, which is
 * what the internal beta ships.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VARIANT = process.env.APP_VARIANT === 'development'
  ? 'development'
  : process.env.APP_VARIANT === 'production'
    ? 'production'
    : 'staging';

const IDENTITY = {
  development: { package: 'com.dananeh.app.dev', scheme: 'dananeh-dev' },
  staging: { package: 'com.dananeh.app.staging', scheme: 'dananeh-staging' },
  production: { package: 'com.dananeh.app', scheme: 'dananeh' },
}[VARIANT];

const failures = [];
const check = (name, run) => {
  try {
    const note = run();
    console.log(`  ✓ ${name}${note ? ` — ${note}` : ''}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  ✗ ${name} — ${error.message}`);
  }
};

let androidDir = process.argv[2];
let workspace;

if (!androidDir) {
  console.log(`Prebuilding ${VARIANT} into a temporary workspace…\n`);
  workspace = mkdtempSync(join(tmpdir(), 'dananeh-prebuild-'));

  for (const entry of readdirSync(process.cwd())) {
    if (['node_modules', '.git', 'android', 'ios', '.expo', 'dist'].includes(entry)) continue;
    cpSync(join(process.cwd(), entry), join(workspace, entry), { recursive: true });
  }
  // The prebuild needs the module graph; link rather than reinstall.
  cpSync(join(process.cwd(), 'node_modules'), join(workspace, 'node_modules'), {
    recursive: true,
    verbatimSymlinks: true,
  });

  execFileSync('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install', '--clean'], {
    cwd: workspace,
    stdio: 'inherit',
    env: { ...process.env, APP_VARIANT: VARIANT, EXPO_PUBLIC_ENV_NAME: VARIANT,
      EXPO_PUBLIC_FIREBASE_API_KEY: 'AIzaSyPrebuildCheckPlaceholderNotARealKey',
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'example-project',
      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'example-project.appspot.com',
      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
      EXPO_PUBLIC_FIREBASE_APP_ID: '1:000000000000:android:0000' },
  });
  androidDir = join(workspace, 'android');
}

const res = join(androidDir, 'app', 'src', 'main', 'res');
const read = (path) => readFileSync(join(androidDir, path), 'utf8');
const manifest = read('app/src/main/AndroidManifest.xml');

console.log('\nLauncher icon');
check('adaptive icon foreground and background exist', () => {
  const densities = readdirSync(res).filter((d) => d.startsWith('mipmap-') && d !== 'mipmap-anydpi-v26');
  if (!densities.length) throw new Error('no mipmap densities generated');

  for (const density of densities) {
    const files = readdirSync(join(res, density));
    if (!files.some((f) => f.startsWith('ic_launcher_foreground'))) {
      throw new Error(`${density} has no foreground`);
    }
  }
  return `${densities.length} densities`;
});

check('adaptive icon is declared for API 26+', () => {
  const path = join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml');
  if (!existsSync(path)) throw new Error('no mipmap-anydpi-v26/ic_launcher.xml');
  const xml = readFileSync(path, 'utf8');
  if (!xml.includes('<foreground') || !xml.includes('<background')) {
    throw new Error('adaptive icon is missing a layer');
  }
  return 'foreground + background';
});

check('monochrome icon is declared, for themed launchers', () => {
  const path = join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml');
  const xml = readFileSync(path, 'utf8');
  if (!xml.includes('<monochrome')) throw new Error('no <monochrome> layer');
  return 'themed icons supported';
});

console.log('\nSplash and notification');
check('splash screen is generated for light and dark', () => {
  const values = readFileSync(join(res, 'values', 'colors.xml'), 'utf8');
  if (!values.includes('splashscreen_background')) throw new Error('no splash background colour');

  const night = join(res, 'values-night', 'colors.xml');
  if (!existsSync(night)) throw new Error('no values-night — dark splash missing');
  return 'light + dark';
});

check('notification icon is generated', () => {
  const drawables = readdirSync(res).filter((d) => d.startsWith('drawable'));
  const found = drawables.some((d) =>
    readdirSync(join(res, d)).some((f) => f.startsWith('notification_icon'))
  );
  if (!found) throw new Error('no notification_icon drawable');
  return 'present';
});

console.log('\nManifest');
check('right-to-left layout is enabled', () => {
  if (!/android:supportsRtl="true"/.test(manifest)) {
    throw new Error('supportsRtl is not true — the whole app is laid out mirrored');
  }
});

check('notification permission is declared for Android 13+', () => {
  if (!manifest.includes('android.permission.POST_NOTIFICATIONS')) {
    throw new Error('POST_NOTIFICATIONS is not declared; the ask silently no-ops');
  }
});

check('the deep-link scheme is the one for this variant', () => {
  if (!manifest.includes(`android:scheme="${IDENTITY.scheme}"`)) {
    throw new Error(`${IDENTITY.scheme} missing — a deep link could open the wrong build`);
  }
  return IDENTITY.scheme;
});

/**
 * Reflections are "on this device only". Android's default auto-backup would
 * copy the database into the reader's Google account, which is a different
 * promise from the one the app makes.
 */
check('cloud auto-backup is off, so reflections stay on the device', () => {
  if (/android:allowBackup="true"/.test(manifest)) {
    throw new Error('allowBackup is true — private reflections would reach cloud backup');
  }
  if (!/android:allowBackup="false"/.test(manifest)) {
    throw new Error('allowBackup is not declared; the platform default is true');
  }
});

console.log('\nPackaging');
check('the package name matches the variant', () => {
  const gradle = read('app/build.gradle');
  if (!gradle.includes(IDENTITY.package)) {
    throw new Error(`applicationId is not ${IDENTITY.package}`);
  }
  return IDENTITY.package;
});

if (workspace) rmSync(workspace, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} native check(s) failed:`);
  for (const failure of failures) console.error(`  · ${failure}`);
  process.exit(1);
}
console.log('\nAll Android native checks passed.');
