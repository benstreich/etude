/** @type {import('@bacons/apple-targets').Config} */
// Generated at prebuild by @bacons/apple-targets (macOS only). UNVERIFIED —
// this scaffold has not been built; expect to iterate once on a Mac.
module.exports = {
  type: 'widget',
  name: 'EtudeWidgets',
  deploymentTarget: '16.4',
  colors: {
    $accent: '#B34A2E',
  },
  entitlements: {
    'com.apple.security.application-groups': ['group.com.benstreich.etude'],
  },
};
