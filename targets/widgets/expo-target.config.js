/** @type {import('@bacons/apple-targets').Config} */
// Generated at prebuild by @bacons/apple-targets (macOS only). UNVERIFIED —
// this scaffold has not been built; expect to iterate once on a Mac.
module.exports = {
  type: 'widget',
  // not "EtudeWidgets": that is also the Swift module of modules/etude-widgets, and the
  // two .swiftmodules collide in the build products (the app then can't see the module)
  name: 'EtudeWidgetExtension',
  deploymentTarget: '16.4',
  colors: {
    $accent: '#B34A2E',
  },
  entitlements: {
    'com.apple.security.application-groups': ['group.com.benstreich.etude'],
  },
};
