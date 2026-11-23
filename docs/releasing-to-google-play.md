# Releasing a new version to Google Play

This is how to ship a new Android version of the Ripple app. You build an **Android App Bundle
(`.aab`)** in the cloud with EAS, then upload it in the Google Play Console.

- App package: `com.ripple.caseapp`
- Play Console account: **team@rippletech.store**

## Before you start

You need:

1. **The team Google login** — sign-in details for `team@rippletech.store`. Ask the team for
   them. Never commit passwords or put them in this repo.
2. **Access to the Expo/EAS account that owns this project.** The username and password are in the team passwords doc. Log in once on your machine:

   ```bash
   npx eas-cli@latest login
   ```

3. The repo cloned, on an up-to-date `main`, with `npm install` done.

## 1. Bump the version

Open `app.json` and change `expo.version` (the version users see in the store), e.g.
`1.0.0` → `1.0.1`. Commit the change.

You do **not** touch the Android `versionCode`. EAS stores it remotely and bumps it on every
production build (`autoIncrement` in `eas.json`). Google Play rejects a bundle whose version code
was already uploaded, which is why you always build with the `production` profile below.

## 2. Run the checks

```bash
npm test
npx tsc --noEmit
npx expo lint
```

Fix anything that fails before building.

## 3. Build the `.aab`

```bash
npx eas-cli@latest build --platform android --profile production
```

The build runs on EAS servers and usually takes 10–20 minutes. When it finishes, the CLI prints a
link to the build page on expo.dev. Open it and click **Download** to get the `.aab` file.
(You can also find past builds at expo.dev → the Ripple project → Builds.)

## 4. Upload it in the Play Console

Menu labels in the Play Console change from time to time, so they may look slightly different.

1. Go to https://play.google.com/console and sign in as **team@rippletech.store**.
2. Select the **Ripple** app.
3. Open **Test and release** and pick a track:
   - **Internal testing** — recommended first, so the team can install it before the public does.
   - **Production** — the public release.
4. Click **Create new release**.
5. Upload the `.aab` you downloaded. The release name fills in automatically from the version.
6. Write the **release notes** ("What's new in this version").
7. Click **Next**, read any warnings, then **Save and publish** (or **Send for review**).

## 5. After uploading

- Google reviews the release; this can take a few hours to a few days. Check progress under
  **Publishing overview**.
- When testers are happy with an internal testing release, promote that same release to
  Production instead of building again.

## Troubleshooting

- **"Version code has already been used"** — the bundle wasn't built with the `production`
  profile. Rebuild with the command in step 3.
- **Signing key / upload certificate mismatch** — EAS manages the Android upload keystore for
  this project. Don't generate a new one. Inspect it with `npx eas-cli@latest credentials`, and ask
  the team before changing anything there.
- **Privacy policy missing** — the app uses Bluetooth, so Play requires one:
  https://www.rippletech.store/privacy
- **Store listing images** — in `assets/store/` (`play-icon-512.png`,
  `feature-graphic-1024x500.png`).

## Later: automate the upload

`eas submit` can upload the build to Play for you (`npx eas-cli@latest submit --platform android`),
but it needs a Google Play service-account key configured in `eas.json`. Until that's set up, use
the manual upload above.
