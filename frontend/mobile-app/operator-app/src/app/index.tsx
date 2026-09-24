import { Redirect } from 'expo-router';
import DashboardHomeScreen from '@/features/dashboard/screens/DashboardHomeScreen';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';

export default function Index() {
  const { isLoggedIn } = useAuth();
  if (!isLoggedIn) {
    return <Redirect href="/login" />;
  }
  return <DashboardHomeScreen />;
}
