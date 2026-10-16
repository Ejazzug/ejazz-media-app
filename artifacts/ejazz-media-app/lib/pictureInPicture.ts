import { NativeModules, Platform } from 'react-native';

type PictureInPictureNativeModule = {
  enter: () => Promise<boolean>;
};

const pictureInPictureModule = NativeModules.EjazzPictureInPicture as
  | PictureInPictureNativeModule
  | undefined;

export function canEnterPictureInPicture() {
  return (
    Platform.OS === 'android' &&
    Number(Platform.Version) >= 26 &&
    typeof pictureInPictureModule?.enter === 'function'
  );
}

export async function enterPictureInPicture() {
  if (!canEnterPictureInPicture() || !pictureInPictureModule) return false;
  return pictureInPictureModule.enter();
}
