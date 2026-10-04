// The Android launcher label is the brand, "Étude". expo.name stays "etude":
// it also names the native projects, where an accent is asking for trouble.
// (iOS takes the same label from ios.infoPlist.CFBundleDisplayName.)
const { AndroidConfig, withStringsXml } = require('expo/config-plugins');

module.exports = function withAppLabel(config, label) {
  return withStringsXml(config, (c) => {
    c.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: 'app_name', translatable: 'false' }, _: label }],
      c.modResults
    );
    return c;
  });
};
