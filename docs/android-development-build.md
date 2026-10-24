# Android development build

Microsoft (Entra ID) sign-in on Android needs a fixed redirect URI that the
app itself owns. Expo Go cannot provide one (its URLs are
`exp://<host>:8081/--/…` and change with the network), so sign-in runs in a
**development build**: the app built locally with `expo-dev-client`. This
document sets that build up on Windows. Sign-in itself is described in
[entra-login.md](entra-login.md); what has been verified on a phone is in
[device-testing.md](device-testing.md).

Release builds (EAS, signing, store configuration) are **not implemented**.

| Setting | Value | Defined in |
|---|---|---|
| URL scheme | `roombookingdev` | `app.json` → `expo.scheme` |
| Android package | `io.github.kris7011.roombooking.dev` | `app.json` → `expo.android.package` |
| Redirect URI | `roombookingdev://auth` | `src/auth/auth-config.ts` |
| Dev client scheme | `exp+room-booking-mobile` | Added by `expo-dev-client` (opens a dev server URL) |

`makeRedirectUri` is called with `{ scheme: 'roombookingdev', path: 'auth', native: 'roombookingdev://auth' }`. In a development or release build on Android, expo-auth-session 58 returns `native` unchanged, so the result is exactly `roombookingdev://auth`. In Expo Go it returns an `exp://` URL instead. On web the app asks for no redirect URI at all, because the web build has no sign-in; `src/auth/redirect-uri.ts` keeps `expo-auth-session` out of the web bundle.

The matching Entra app registration (redirect URI `roombookingdev://auth` on
the *Mobile and desktop applications* platform, no client secret, the
`access_as_user` API permission) is described in
[entra-login.md](entra-login.md#manual-steps-in-the-microsoft-entra-admin-center).

## Preparing Windows (PowerShell)

Expo SDK 58 builds Android with Gradle 9.4.1, **JDK 17**, `compileSdk` 37, `targetSdk` 36, Build-Tools 37.0.0, NDK 27.1.12297006 and CMake **3.31.6**. On Windows, keep the project in a short path (for example `C:\rb`) to avoid native Ninja path-length errors. Android SDK Platform 36 is installed for the emulator image and `targetSdk`; Platform 37 is needed to compile. Run the steps in a new PowerShell window (no administrator rights needed unless `winget` asks).

1. **JDK 17** (Microsoft Build of OpenJDK) and `JAVA_HOME`:

   ```powershell
   winget install --id Microsoft.OpenJDK.17 --exact --accept-source-agreements --accept-package-agreements
   $jdk = Get-ChildItem "C:\Program Files\Microsoft" -Directory -Filter "jdk-17*" | Sort-Object Name -Descending | Select-Object -First 1
   [Environment]::SetEnvironmentVariable("JAVA_HOME", $jdk.FullName, "User")
   ```

2. **Android Studio**:

   ```powershell
   winget install --id Google.AndroidStudio --exact --accept-source-agreements --accept-package-agreements
   ```

   Open Android Studio once and finish the setup wizard (*Standard*). It installs the SDK in `%LOCALAPPDATA%\Android\Sdk`. Then *More Actions → SDK Manager → SDK Tools*, tick **Android SDK Command-line Tools (latest)** and click *Apply*.

3. **`ANDROID_HOME` and `Path`**, for your user:

   ```powershell
   $sdk = "$env:LOCALAPPDATA\Android\Sdk"
   [Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdk, "User")
   $parts = @(([Environment]::GetEnvironmentVariable("Path", "User") -split ";") | Where-Object { $_ })
   foreach ($dir in "$sdk\platform-tools", "$sdk\emulator", "$sdk\cmdline-tools\latest\bin") {
     if ($parts -notcontains $dir) { $parts += $dir }
   }
   [Environment]::SetEnvironmentVariable("Path", ($parts -join ";"), "User")

   # Use the new values in this window too (new windows get them automatically)
   $env:JAVA_HOME = [Environment]::GetEnvironmentVariable("JAVA_HOME", "User")
   $env:ANDROID_HOME = $sdk
   $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
   ```

4. **SDK packages**: Platform 36 and 37.0, ADB (`platform-tools`), Build-Tools, NDK, CMake and an emulator image. CMake 3.31.6 is required by `expo-build-properties` to work around Windows Ninja path-length failures:

   ```powershell
   sdkmanager --licenses   # answer y to each license
   sdkmanager --channel=3 "platform-tools" "platforms;android-36" "platforms;android-37.0" "build-tools;37.0.0" "ndk;27.1.12297006" "cmake;3.31.6" "emulator" "system-images;android-36;google_apis;x86_64"
   ```

5. **Emulator** (or connect a phone with USB debugging on instead). On Windows 11 Home, the emulator needs the *Windows Hypervisor Platform* feature (*Turn Windows features on or off*).

   ```powershell
   avdmanager create avd --name RoomBooking_API36 --package "system-images;android-36;google_apis;x86_64" --device "pixel_7"
   Start-Process emulator -ArgumentList "-avd", "RoomBooking_API36"
   ```

   `avdmanager list device` shows other device profiles.

6. **Check**:

   ```powershell
   java -version            # openjdk version "17.…"
   $env:JAVA_HOME           # C:\Program Files\Microsoft\jdk-17.…
   adb version              # Android Debug Bridge …
   adb devices              # emulator-5554   device
   sdkmanager --list_installed
   ```

## Building and running the development build

```powershell
git clone https://github.com/kris7011/room-booking-mobile.git C:\rb
cd C:\rb
npm ci
npm run android:dev-build    # npx expo run:android
```

`expo run:android` generates `android/` from `app.json` (Continuous Native Generation; the folder is gitignored, never edit it by hand), builds the debug APK with Gradle, installs it on the running emulator or phone and starts Metro. The first build downloads Gradle and its dependencies and can take 10–20 minutes. Gradle uses up to 2 GB of heap; on a low-memory machine, close other large applications first. With several devices attached, add `-- --device`.

The Metro terminal then shows:

```
[auth] Redirect URI: roombookingdev://auth
[auth] Microsoft login: https://login.microsoftonline.com/common/oauth2/v2.0/authorize (personal Microsoft accounts and work or school accounts)
```

These lines are written at start (and on every reload, `r`) in development only; they contain no client ID, code or token, and nothing else about sign-in is logged. In Expo Go the second line reads `[auth] Microsoft login unavailable: expo-go (…)`.

Later, as long as the native configuration has not changed, start Metro only and open the installed app: `npm start`, then press `a`. Run `npm run android:dev-build` again after changing `app.json`, a config plugin or a package with native code.

Live mode works as in Expo Go: `EXPO_PUBLIC_API_URL=http://10.0.2.2:5003` in `.env.local` for the emulator. The debug build allows plain HTTP; a release build would need HTTPS. For a physical phone, use `adb reverse` as described in [device-testing.md](device-testing.md#sign-in-against-a-local-api-over-usb), or switch targets with [`Set-ApiTarget.ps1`](api-targets.md).

## Testing deep links

With the development build installed and the app loaded from Metro (otherwise the dev launcher catches the link first):

```powershell
# Is roombookingdev:// registered for the app?
adb shell pm query-activities --components -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "roombookingdev://auth"
# Expected: io.github.kris7011.roombooking.dev/.MainActivity

# Open the redirect URI the way a browser would
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "roombookingdev://auth" io.github.kris7011.roombooking.dev
# Expected: Status: ok, Activity: io.github.kris7011.roombooking.dev/.MainActivity, and the app comes to the front

# The same without the package name, as Android resolves it for a browser
npx uri-scheme open "roombookingdev://auth" --android
```

Opened by hand like this, outside a sign-in, the link only brings the app to the front. During a sign-in, `expo-auth-session` receives the same redirect and reads the authorization code from it. Invitation links (`roombookingdev://invitation?token=…`) are handled by the app itself, see [device-testing.md](device-testing.md#invitation-links).

## Expo Go demo, separately

Expo Go still runs the app, in demo mode without any backend and without sign-in. The booking flow only uses React Native core components and `react-native-safe-area-context`, both of which Expo Go includes:

```powershell
$env:EXPO_NO_DOTENV = "1"     # ignore .env.local, so the app uses demo data
npm run android:go            # or: npm run start:go and scan the QR code
Remove-Item Env:EXPO_NO_DOTENV
```

Run either the development build's Metro or Expo Go's, not both: both use port 8081.
