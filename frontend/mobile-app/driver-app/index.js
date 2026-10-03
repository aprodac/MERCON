// The trip location service must be registered before the app renders —
// including when Android/iOS wakes the app only to deliver a location in the
// background — so it is imported here, ahead of the router.
import './src/services/tripLocationTask';
import 'expo-router/entry';
