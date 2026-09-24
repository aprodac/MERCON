import React from 'react';
import { Modal } from 'react-native';
import { CargoPhotoPreviewScreen } from '../screens/CargoPhotoPreviewScreen';

export interface GeotagPhotoModalProps {
  visible: boolean;
  onClose: () => void;
  photo: {
    uri: string;
    title?: string;
    location?: {
      latitude: number;
      longitude: number;
      timestamp?: string | null;
      address?: string | null;
    } | null;
  } | null;
}

export const GeotagPhotoModal: React.FC<GeotagPhotoModalProps> = ({
  visible,
  onClose,
  photo,
}) => {
  if (!photo) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
    >
      <CargoPhotoPreviewScreen
        photoUri={photo.uri}
        latitude={photo.location?.latitude}
        longitude={photo.location?.longitude}
        timestamp={photo.location?.timestamp ?? undefined}
        fullAddress={photo.location?.address ?? undefined}
        onClose={onClose}
      />
    </Modal>
  );
};
