/**
 * Notification Service Extension (iOS). Runs for every push the backend marks
 * `mutableContent` and, when the push is from a driver, shows it as a message
 * from that driver: their photo and name instead of the Mercon icon (iOS
 * "Communication Notifications"). See NotificationService.swift.
 *
 * Built into ios/ by @bacons/apple-targets on `expo prebuild`; it needs its own
 * App ID (tech.mercon.operator.NotificationService), which Xcode's automatic
 * signing creates.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = () => ({
  type: 'notification-service',
  name: 'NotificationService',
  bundleIdentifier: '.NotificationService',
  // Same as the app (Expo SDK 57's minimum).
  deploymentTarget: '16.4',
  frameworks: ['UserNotifications', 'Intents'],
});
