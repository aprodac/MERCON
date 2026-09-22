import React from 'react';
import { Image, Text, View, TouchableOpacity, Alert } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { NotificationButton } from './NotificationButton';
import { useAuth } from '@/lib/auth-context';

interface AppHeaderProps {
  logoSource: number;
  logoSize?: number;
  greeting: string;
  userName: string;
  role?: string | null;
  unreadNotifications: number;
  onNotificationPress?: () => void;
  className?: string;
}

export function AppHeader({
  logoSource, logoSize = 48, greeting, userName, role, unreadNotifications, onNotificationPress, className,
}: AppHeaderProps) {
  const { signOut } = useAuth();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out and return to the login screen?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <View className={`flex-row items-center justify-between ${className ?? ''}`}>
      <View className="flex-row items-center gap-3">
        <Image
          source={logoSource}
          resizeMode="contain"
          className="rounded-xl"
          style={{ width: logoSize, height: logoSize }}
        />
        <View>
          <View className="flex-row items-center gap-1.5">
            <Text className="text-xs text-gray-500">{greeting}</Text>
            {role ? (
              <View className="rounded-full bg-[#FFF0EB] px-2 py-0.5 border border-[#FA634E]/20">
                <Text className="text-[10px] font-extrabold text-[#FA634E] uppercase tracking-wider">
                  {role}
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="text-lg font-extrabold text-gray-900">{userName}</Text>
        </View>
      </View>

      <View className="flex-row items-center gap-2">
        <NotificationButton unreadCount={unreadNotifications} onPress={onNotificationPress} />
        <TouchableOpacity
          onPress={handleSignOut}
          activeOpacity={0.8}
          className="h-10 w-10 items-center justify-center rounded-full bg-gray-100"
        >
          <LogOut size={18} color="#FA634E" strokeWidth={2.2} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
