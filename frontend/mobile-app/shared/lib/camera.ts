import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { Alert } from 'react-native';
import { translate } from './language-context';

export interface LocationTag {
  latitude: number;
  longitude: number;
  timestamp: string;
  address?: string | null;
}

export async function getDeviceLocationTag(): Promise<LocationTag | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    let pos = await Location.getLastKnownPositionAsync();
    if (!pos) {
      pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    }
    if (!pos) return null;

    let address: string | null = null;
    try {
      // The street address is a nice-to-have: never hold the photo up for it.
      const geocoded = await withTimeout(
        Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        1200,
        [],
      );
      if (geocoded && geocoded.length > 0) {
        const item = geocoded[0];
        const placeParts = [
          item.district || item.street || item.name,
          item.city || item.subregion,
          item.country,
        ].filter(Boolean);
        if (placeParts.length > 0) {
          address = placeParts.join(', ');
        }
      }
    } catch (_) {}

    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      timestamp: new Date().toISOString(),
      address,
    };
  } catch (e) {
    // Silently fall back if GPS location is unavailable on device/simulator
    return null;
  }
}

/** Resolves to `fallback` if `p` has not settled within `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

export interface CapturedPhoto {
  id?: string;
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  location?: LocationTag | null;
  geotag?: LocationTag | null;
  /** Already on the server (kept in saved drafts so a reopen doesn't upload it twice). */
  uploaded?: boolean;
}

/**
 * Resize + compress a photo so it's safe to upload.
 * Gallery photos from modern phones can be 5–10 MB. We cap them at 1280px wide
 * and 0.7 JPEG quality → typical output is 150–400 KB, well under nginx's limit.
 */
async function compressPhoto(uri: string, location?: Promise<LocationTag | null>): Promise<CapturedPhoto> {
  const [result, loc] = await Promise.all([
    ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1280 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
    ),
    // Started before the camera opened, so it is normally ready by now; cap
    // the wait so a slow GPS never delays the photo appearing.
    withTimeout(location ?? getDeviceLocationTag(), 1500, null),
  ]);
  return { uri: result.uri, mimeType: 'image/jpeg', fileName: 'photo.jpg', location: loc };
}

/** Compress + geotag a photo taken by the in-app camera. */
export function preparePhoto(uri: string, location?: Promise<LocationTag | null>): Promise<CapturedPhoto> {
  return compressPhoto(uri, location);
}

async function toPhoto(result: ImagePicker.ImagePickerResult, location?: Promise<LocationTag | null>): Promise<CapturedPhoto | null> {
  if (result.canceled || !result.assets?.length) return null;
  const a = result.assets[0];
  return compressPhoto(a.uri, location);
}

export async function capturePhoto(): Promise<CapturedPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new Error(translate('err_camera_permission', 'Camera permission is required to take trip photos.'));
  }

  // Look up the location while the driver lines up the shot.
  const location = getDeviceLocationTag();
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: 'images',
    quality: 1,
    exif: false,
  });

  return toPhoto(result, location);
}

export async function pickFromGallery(): Promise<CapturedPhoto | null> {
  const location = getDeviceLocationTag();
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    quality: 1,
    exif: false,
  });

  return toPhoto(result, location);
}

export interface CapturedMedia {
  uri: string;
  type: 'image' | 'video';
  mimeType?: string | null;
  fileName?: string | null;
  location?: LocationTag | null;
}

export async function captureVideo(): Promise<CapturedMedia | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new Error(translate('err_video_permission', 'Camera permission is required to record videos.'));
  }

  const [result, loc] = await Promise.all([
    ImagePicker.launchCameraAsync({
      mediaTypes: 'videos',
      videoMaxDuration: 30,
    }),
    getDeviceLocationTag(),
  ]);

  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    type: 'video',
    mimeType: asset.mimeType ?? 'video/mp4',
    fileName: asset.fileName ?? 'delay-video.mp4',
    location: loc,
  };
}

/**
 * Pick an existing video from the driver's device gallery.
 */
export async function pickVideoFromGallery(): Promise<CapturedMedia | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error(translate('err_gallery_permission', 'Gallery permission is required to select videos.'));
  }

  const [result, loc] = await Promise.all([
    ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'videos',
    }),
    getDeviceLocationTag(),
  ]);

  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    type: 'video',
    mimeType: asset.mimeType ?? 'video/mp4',
    fileName: asset.fileName ?? 'delay-video.mp4',
    location: loc,
  };
}

/**
 * Open the camera straight away (no "camera or gallery?" question). If the
 * camera can't be used — permission denied, no camera — offer the gallery
 * instead of failing. Screens offer the gallery directly on long-press.
 */
export async function takePhoto(): Promise<CapturedPhoto | null> {
  try {
    return await capturePhoto();
  } catch (err: any) {
    return new Promise((resolve) => {
      Alert.alert(
        translate('err_camera_title', 'Camera'),
        `${err?.message ?? translate('err_camera_permission', 'Camera permission is required to take trip photos.')}`,
        [
          { text: translate('action_pick_gallery', 'Choose from Gallery'), onPress: () => { pickFromGallery().then(resolve).catch(() => resolve(null)); } },
          { text: translate('action_cancel', 'Cancel'), style: 'cancel', onPress: () => resolve(null) },
        ],
        { cancelable: true, onDismiss: () => resolve(null) },
      );
    });
  }
}

/**
 * Ask the driver whether to take a photo or pick one from their gallery.
 */
export async function choosePhoto(): Promise<CapturedPhoto | null> {
  return new Promise((resolve, reject) => {
    Alert.alert(
      translate('dialog_attach_photo', 'Attach Photo'),
      translate('dialog_take_or_gallery', 'Take a photo now or choose an existing photo from your gallery.'),
      [
        {
          text: translate('action_take_photo', 'Take Photo 📷'),
          onPress: () => {
            capturePhoto().then(resolve).catch(reject);
          },
        },
        {
          text: translate('action_pick_gallery', 'Choose from Gallery 🖼️'),
          onPress: () => {
            pickFromGallery().then(resolve).catch(reject);
          },
        },
        { text: translate('action_cancel', 'Cancel'), style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

/**
 * Ask the driver whether to take a photo, record a video, or pick from gallery.
 */
export async function chooseMedia(): Promise<CapturedMedia | null> {
  return new Promise((resolve, reject) => {
    Alert.alert(
      translate('dialog_add_evidence', 'Add Evidence'),
      translate('dialog_add_evidence_desc', 'Take a photo, record a video, or choose from gallery.'),
      [
        {
          text: translate('action_take_photo', 'Take Photo 📷'),
          onPress: () => {
            capturePhoto()
              .then((p) => resolve(p ? { uri: p.uri, type: 'image', mimeType: p.mimeType, fileName: p.fileName } : null))
              .catch(reject);
          },
        },
        {
          text: translate('action_record_video', 'Record Video 🎥'),
          onPress: () => {
            captureVideo().then(resolve).catch(reject);
          },
        },
        {
          text: translate('action_pick_gallery', 'Choose from Gallery 🖼️'),
          onPress: () => {
            ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.All,
              quality: 0.8,
            })
              .then((res) => {
                if (res.canceled || !res.assets?.length) return resolve(null);
                const a = res.assets[0];
                if (a.type === 'video') {
                  resolve({ uri: a.uri, type: 'video', mimeType: a.mimeType ?? 'video/mp4', fileName: 'delay-video.mp4' });
                } else {
                  compressPhoto(a.uri).then((p) => resolve({ uri: p.uri, type: 'image', mimeType: p.mimeType, fileName: p.fileName }));
                }
              })
              .catch(reject);
          },
        },
        { text: translate('action_cancel', 'Cancel'), style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}
