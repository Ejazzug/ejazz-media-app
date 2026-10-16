const fs = require('node:fs/promises');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const REQUIRED_CONFIG_CHANGES = [
  'orientation',
  'screenSize',
  'screenLayout',
  'smallestScreenSize',
];

function transformAndroidManifest(manifest) {
  const application = manifest.application?.[0];
  if (!application) {
    throw new Error('EJazz PiP plugin could not find the Android application manifest.');
  }

  application.$['android:resizeableActivity'] = 'true';
  const activity = application.activity?.find((entry) => {
    const name = entry.$?.['android:name'] || '';
    return name === '.MainActivity' || name.endsWith('.MainActivity');
  });
  if (!activity) {
    throw new Error('EJazz PiP plugin could not find the Android MainActivity.');
  }

  delete activity.$['android:screenOrientation'];
  activity.$['android:resizeableActivity'] = 'true';
  activity.$['android:supportsPictureInPicture'] = 'true';

  const configChanges = new Set(
    (activity.$['android:configChanges'] || '').split('|').filter(Boolean),
  );
  REQUIRED_CONFIG_CHANGES.forEach((change) => configChanges.add(change));
  activity.$['android:configChanges'] = [...configChanges].join('|');

  return manifest;
}

function configureManifest(config) {
  return withAndroidManifest(config, (modConfig) => {
    modConfig.modResults.manifest = transformAndroidManifest(modConfig.modResults.manifest);
    return modConfig;
  });
}

function registerNativeModule(source) {
  const registration = 'add(EjazzPictureInPicturePackage())';
  if (source.includes(registration)) return source;

  const marker = 'PackageList(this).packages.apply {';
  if (!source.includes(marker)) {
    throw new Error('EJazz PiP plugin could not find the React Native package registration block.');
  }
  return source.replace(marker, `${marker}\n          ${registration}`);
}

function removeLegacySystemBarColors(source) {
  return source.replace(
    /^[ \t]*<item name="android:(?:statusBarColor|navigationBarColor)">[^<]*<\/item>[ \t]*\r?\n?/gm,
    '',
  );
}

function withPictureInPictureNativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const packageDirectory = path.join(
        projectRoot,
        'android/app/src/main/java/com/ejazzug/ejazzmedia',
      );
      const templatePath = path.join(
        projectRoot,
        'plugins/native/EjazzPictureInPicturePackage.kt',
      );
      const applicationPath = path.join(
        projectRoot,
        'android/app/src/main/java/com/ejazzug/ejazzmedia/MainApplication.kt',
      );

      await fs.mkdir(packageDirectory, { recursive: true });
      const template = await fs.readFile(templatePath, 'utf8');
      await fs.writeFile(
        path.join(packageDirectory, 'EjazzPictureInPicturePackage.kt'),
        template,
      );
      const applicationSource = await fs.readFile(applicationPath, 'utf8');
      const registeredSource = registerNativeModule(applicationSource);
      if (registeredSource !== applicationSource) {
        await fs.writeFile(applicationPath, registeredSource);
      }

      const stylesPath = path.join(
        projectRoot,
        'android/app/src/main/res/values/styles.xml',
      );
      const stylesSource = await fs.readFile(stylesPath, 'utf8');
      const modernStyles = removeLegacySystemBarColors(stylesSource);
      if (modernStyles !== stylesSource) {
        await fs.writeFile(stylesPath, modernStyles);
      }
      return modConfig;
    },
  ]);
}

module.exports = function withEjazzPictureInPicture(config) {
  return withPictureInPictureNativeFiles(configureManifest(config));
};

module.exports.configureManifest = configureManifest;
module.exports.registerNativeModule = registerNativeModule;
module.exports.removeLegacySystemBarColors = removeLegacySystemBarColors;
module.exports.transformAndroidManifest = transformAndroidManifest;
