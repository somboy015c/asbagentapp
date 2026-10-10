// Runs after `cap add android` + `cap sync`. Three small edits to the generated Android project:
//   1. signs the release build with the repository's keystore (same key every time, so installs can be updated)
//   2. gives it a version that goes up with every build (Android refuses to "update" to an equal or lower one)
//   3. makes the keyboard resize the screen, so form fields are never hidden behind it
// Every edit is checked: if Capacitor ever changes the generated files, the build FAILS here
// instead of quietly producing an unsigned or mis-versioned APK.

import { readFileSync, writeFileSync } from 'node:fs';

const info = JSON.parse(readFileSync('build-info.json', 'utf8'));
const keystoreB64 = process.env.ANDROID_KEYSTORE_BASE64;
if (!keystoreB64) throw new Error('ANDROID_KEYSTORE_BASE64 is not set.');

writeFileSync('android/app/release.keystore', Buffer.from(keystoreB64, 'base64'));

const gradleFile = 'android/app/build.gradle';
let gradle = readFileSync(gradleFile, 'utf8');

const versionCode = Number(process.env.VERSION_CODE) || Math.floor(Date.now() / 60000);
if (!/versionCode\s+\d+/.test(gradle) || !/versionName\s+"[^"]*"/.test(gradle)) {
  throw new Error('Could not find versionCode/versionName in android/app/build.gradle - Capacitor\'s template changed.');
}
gradle = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${info.versionName}"`);

const signingBlock = `signingConfigs {
        release {
            storeFile file("release.keystore")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
    `;

const buildTypes = /buildTypes\s*\{\s*release\s*\{/;
if (!buildTypes.test(gradle)) {
  throw new Error('Could not find buildTypes { release { in android/app/build.gradle - Capacitor\'s template changed.');
}
gradle = gradle.replace(buildTypes, (match) => `${signingBlock}${match}\n            signingConfig signingConfigs.release`);
writeFileSync(gradleFile, gradle);

const manifestFile = 'android/app/src/main/AndroidManifest.xml';
let manifest = readFileSync(manifestFile, 'utf8');
if (!manifest.includes('windowSoftInputMode')) {
  if (!manifest.includes('<activity')) throw new Error('No <activity> in AndroidManifest.xml.');
  manifest = manifest.replace('<activity', '<activity\n            android:windowSoftInputMode="adjustResize"');
  writeFileSync(manifestFile, manifest);
}

console.log(`Android build ready: ${info.appName} ${info.versionName} (versionCode ${versionCode}).`);
