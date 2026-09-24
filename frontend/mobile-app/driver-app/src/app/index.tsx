import { Redirect } from 'expo-router';
import HomeScreen from '@/screens/HomeScreen';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';

export default function Index() {
  const { isLoggedIn } = useAuth();
  if (!isLoggedIn) {
    return <Redirect href="/login" />;
  }
  return <HomeScreen />;
}
