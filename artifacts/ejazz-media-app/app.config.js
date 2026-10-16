const baseConfig = require('./app.config.base.json');

module.exports = () => {
  const expo = structuredClone(baseConfig.expo);

  return {
    ...expo,
    plugins: [
      ...(expo.plugins || []),
      './plugins/withEjazzBackgroundMetadata',
      './plugins/withEjazzPictureInPicture',
    ],
    android: {
      ...expo.android,
      googleServicesFile: './google-services.json',
    },
  };
};