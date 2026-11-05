/**
 * @file Expo config plugin: makes MainActivity's window translucent, so the
 * Ask sheet opened by the beam floats over the app the user was in.
 *
 * Adds `android:windowIsTranslucent=true` and a transparent
 * `android:windowBackground` to `AppTheme` (the theme MainActivity switches to
 * after the splash) and to `Theme.App.SplashScreen` (the theme declared in the
 * manifest). The window manager decides whether an activity hides the app
 * below it from the manifest theme only, so `AppTheme` alone would give a
 * black backdrop behind `/ask`. Every non-ask screen must paint its own opaque
 * background.
 *
 * MainActivity's `launchMode="singleTask"` (so repeated beam taps reuse one
 * activity instead of stacking new ones) already comes from Expo's prebuild
 * template, so the manifest is not touched here.
 */
const { AndroidConfig, withAndroidStyles } = require('expo/config-plugins');

const TRANSLUCENT_ITEMS = {
  'android:windowIsTranslucent': 'true',
  'android:windowBackground': '@android:color/transparent',
};

/** Manifest theme written by expo-splash-screen; only patched if present. */
const SPLASH_THEME = { name: 'Theme.App.SplashScreen' };

/**
 * Applies the translucent window items to `AppTheme` and the splash theme in `styles.xml`.
 * @param {import('expo/config-plugins').ExpoConfig} config Expo config.
 * @returns {import('expo/config-plugins').ExpoConfig} Config with the styles mod registered.
 */
function withTranslucentActivity(config) {
  return withAndroidStyles(config, (mod) => {
    const { Styles } = AndroidConfig;
    const themes = [Styles.getAppThemeGroup()];
    if (Styles.getStyleParent(mod.modResults, SPLASH_THEME)) themes.push(SPLASH_THEME);
    for (const parent of themes) {
      for (const [name, value] of Object.entries(TRANSLUCENT_ITEMS)) {
        mod.modResults = Styles.assignStylesValue(mod.modResults, { add: true, name, value, parent });
      }
    }
    return mod;
  });
}

module.exports = withTranslucentActivity;
