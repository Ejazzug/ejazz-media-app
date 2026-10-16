const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const MINIFY_PROPERTY = 'android.enableMinifyInReleaseBuilds';

function ensureMinifyEnabled(properties) {
  const existing = properties.find(
    (property) => property.type === 'property' && property.key === MINIFY_PROPERTY,
  );
  if (existing) {
    existing.value = 'true';
  } else {
    properties.push({ type: 'property', key: MINIFY_PROPERTY, value: 'true' });
  }
  return properties;
}

function useOptimizedProguardRules(contents) {
  const optimized = 'getDefaultProguardFile("proguard-android-optimize.txt")';
  if (contents.includes(optimized)) return contents;

  const standard = 'getDefaultProguardFile("proguard-android.txt")';
  if (!contents.includes(standard)) {
    throw new Error('EJazz R8 plugin could not find the release ProGuard file setting.');
  }
  return contents.replace(standard, optimized);
}

module.exports = function withEjazzR8Optimization(config) {
  config = withGradleProperties(config, (modConfig) => {
    modConfig.modResults = ensureMinifyEnabled(modConfig.modResults);
    return modConfig;
  });

  return withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = useOptimizedProguardRules(modConfig.modResults.contents);
    return modConfig;
  });
};

module.exports.ensureMinifyEnabled = ensureMinifyEnabled;
module.exports.useOptimizedProguardRules = useOptimizedProguardRules;
