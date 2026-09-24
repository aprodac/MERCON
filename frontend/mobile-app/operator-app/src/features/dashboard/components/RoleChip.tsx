import React from 'react';
import { Text, TouchableOpacity, Alert } from 'react-native';
import { ShieldCheck, LogOut } from 'lucide-react-native';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';

interface RoleChipProps {
  role: string;
  className?: string;
}

export function RoleChip({ role, className }: RoleChipProps) {
  const { signOut } = useAuth();

  const handlePress = () => {
    Alert.alert(
      'Sign Out',
      `You are currently logged in as ${role}. Would you like to sign out?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
      ]
    );
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      className={`flex-row items-center gap-1.5 rounded-full bg-primary-light px-3 py-1.5 ${className ?? ''}`}
    >
      <ShieldCheck size={13} color="#E8450F" strokeWidth={2.2} />
      <Text className="text-xs font-semibold text-primary">{role}</Text>
      <LogOut size={11} color="#E8450F" strokeWidth={2} style={{ marginLeft: 2 }} />
    </TouchableOpacity>
  );
}
