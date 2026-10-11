# asbagentapp

Turns every ASBData agent store into its own **Android app**, fully automatically.

- The app is a Capacitor app with a Flutter-style (Material 3) interface: animated splash screen,
  3-slide onboarding, bottom navigation, bottom sheets, smooth transitions.
- **Everything the app shows comes from the agent's Store Settings**: business name, tagline, logo,
  brand colours, hero / sign-in pictures, and every text block (hero, about, how it works, services,
  FAQ, call-to-action, footer, sign-in quotes), plus contact details and social links.
- It contains **only what the agent's customers see on the store website**: buying data, paying, signing in,
  orders, wallet/refunds and password change. There is nothing about agents, plans or the agent dashboard in it.
- GitHub Actions builds a signed `.apk` per store and publishes it. The website's **Download App** button
  downloads it, and **Save Store Settings** on the website starts a rebuild.

```
Agent saves store settings ─► website calls GitHub (workflow_dispatch, input: subdomain)
                                    │
                                    ▼
              .github/workflows/build.yml  (ubuntu runner)
   1. scripts/prepare.mjs      reads the store from the API, bakes www/config.json, icon + splash images
   2. npx cap add android      creates the Android project (appId com.asbdata.<subdomain>)
   3. capacitor-assets         generates icons + splash from the store logo and brand colour
   4. scripts/patch-android    signs with YOUR key, bumps the version
   5. gradlew assembleRelease  builds the APK
   6. gh release upload        attaches <subdomain>.apk to the one "latest" release
                                    │
                                    ▼
   https://github.com/somboy015c/asbagentapp/releases/latest/download/<subdomain>.apk
```

## One-time setup

### 1. Put this project on GitHub
Create the repository `somboy015c/asbagentapp` and push everything in this folder to its `main` branch.
(Actions must be enabled for the repository.)

### 2. Create the signing key (do this once, keep the file safe)
Every build must be signed with the **same** key, otherwise Android refuses to update an installed app.
On any computer with Java installed:

```bash
keytool -genkeypair -v -keystore asbdata-release.keystore -alias asbdata \
        -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 asbdata-release.keystore > keystore.b64        # on macOS: base64 -i asbdata-release.keystore -o keystore.b64
```

In the repository: **Settings > Secrets and variables > Actions > New repository secret**, add four secrets:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the whole contents of `keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password you typed |
| `ANDROID_KEY_ALIAS` | `asbdata` (the alias above) |
| `ANDROID_KEY_PASSWORD` | the key password you typed |

**Back up `asbdata-release.keystore` and the passwords somewhere safe.** If they are lost, installed apps can
never be updated; users would have to uninstall and reinstall.

### 3. (Optional) Repository variables
**Settings > Secrets and variables > Actions > Variables.** Defaults are fine for your setup:

| Variable | Default |
|---|---|
| `API_BASE` | `https://api.asbdataghana.com/api/v1` |
| `STORE_BASE_DOMAIN` | `asbdataghana.com` (the part after the store name, e.g. smekart.**asbdataghana.com**) |
| `RELEASE_TAG` | `agent-apps` |
| `PAYMENT_INLINE` | `true` (payment page inline in the app; `false` = always the secure window) |

### 4. Let the website start builds
Create a GitHub **fine-grained personal access token**: Settings > Developer settings > Personal access tokens >
Fine-grained tokens. Repository access: only `asbagentapp`. Permission: **Actions: Read and write**.
Put it in the website's `asbdata-backend/.env` (the website side was added in an earlier update):

```
GITHUB_APP_BUILD_TOKEN=github_pat_xxxxxxxx
GITHUB_APP_REPO=somboy015c/asbagentapp
GITHUB_APP_WORKFLOW=build.yml
GITHUB_APP_REF=main
GITHUB_APP_INPUT=subdomain
```
then `php artisan config:clear`.

### 5. Deploy the website changes that came with this project
The app needs two small backend changes (included in the update zip):
- `config/cors.php` allows the app's origin (`https://localhost`). **Without this the app cannot talk to the API.**
- `StorefrontController` also returns the store's full `domain`.

### 6. Add your onboarding pictures
Put `slide-1.png`, `slide-2.png`, `slide-3.png` in `app/assets/onboarding/` (about 1000x1000 px). Until then the
coloured placeholders are shown. Commit and push. Pictures are shared by every store's app.

### 7. First build
**Actions > Build agent app > Run workflow > subdomain `smekart`** (use a real, live store). After ~6 to 10
minutes the file appears at
`https://github.com/somboy015c/asbagentapp/releases/latest/download/smekart.apk`.
Install it on an Android phone (allow "install unknown apps" for the browser) and check the checklist below.

## What is in the app

| Screen | What it does |
|---|---|
| Splash | Store logo tile + name + tagline on the brand colour (matches the native splash) |
| Onboarding | 3 swipeable slides; words from the store's hero / services / call-to-action text; shown once |
| Home | Hero, networks, about + features, how it works, services, FAQ, call-to-action, contact + socials, all from store settings |
| Buy | Network tabs, bundle grid, recipient number, checkout sheet (guest or signed in), Payaza / Korapay choice |
| Payment | A payment screen built for it: our header and footer around the gateway's page shown **inline** (no browser), confirms by itself, success animation; cancelled payments get a "Complete payment" button and the website emails the same link |
| Orders | Account orders, or the orders placed on this phone for guests; tap for details; unpaid orders can be paid |
| Sign in / Register / Forgot password | Customer accounts of this store only (the API scopes accounts by store), with the store's own sign-in picture and quote |
| Account (signed in) | Profile, wallet balance, refund history, change password, sign out; the same things the store website's customer dashboard offers |

Colours, name, logo, icon and splash are baked in at build time; **text and pictures also refresh from the
API every time the app opens**, so a change appears immediately; the rebuild (started by saving store settings)
is what updates the app name, icon, splash and colours.

## What still leaves the app (honest list)
- **Payment pages** (Payaza / Korapay) are shown inline on the app's own payment screen. Korapay documents that its
  checkout can be shown in an iframe; Payaza does not say, so **test each gateway once**. If a gateway refuses to
  load inline, the screen has a "Page not loading? Open in a secure window" link (in-app Chrome window), and
  setting the repository variable `PAYMENT_INLINE=false` makes every payment use that window.
- **Email links** (verify email, reset password) open in the phone's browser, because they are links inside emails.
- Call, WhatsApp and email buttons hand over to the phone's own apps.

## Day-to-day
- Build any store by hand: Actions > Build agent app > Run workflow.
- Everything else is automatic (Save Store Settings, plan upgrade, admin plan change).
- Change the look of **all** apps: edit `app/css/app.css` or the screens in `app/js/`, push, then rebuild stores
  (each store's app updates when it is next built).
- Test the code without building: `node tests/smoke.mjs` (also runs on every push).

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| Build stops at "Check the signing secrets" | Add the four secrets (step 2). |
| `No live store called ...` | The agent isn't approved or the store isn't live yet. |
| App opens but shows no bundles / "Could not reach the server" | The CORS update (step 5) isn't deployed, or the phone is offline. |
| `Could not find buildTypes` / `versionCode` | Capacitor changed its Android template; the build fails on purpose. Update `scripts/patch-android.mjs`. |
| "App not installed" on update | The APK was signed with a different key than the installed app (key changed). |
| Download App gives 404 | No build has run for that store yet, or the release is no longer the "latest" (don't create other releases in this repository). |

## Limits
- Android only (an iOS build needs a Mac runner and Apple developer signing).
- The build cannot be tested by the person who wrote it without GitHub's runners: run step 7 and use the
  checklist (splash, onboarding, buy a small bundle with each gateway, cancel a payment, sign in, refund history).
