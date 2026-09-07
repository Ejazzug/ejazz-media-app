const baseConfig = require('./app.config.base.json');
const { writeGoogleServicesJson } = require('./scripts/firebase-config.cjs');

module.exports = () => {
  const expo = structuredClone(baseConfig.expo);
  const googleServicesFile = writeGoogleServicesJson({
    expectedPackageName: expo.android.package,
    required: process.env.EAS_BUILD === 'true',
  });

  return {
    ...expo,
    android: {
      ...expo.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};