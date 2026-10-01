import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, computePhoneStatus, isBelowMinVersion, isRetryablePushError, type PhoneSnapshot } from './rules';

const NOW = new Date('2026-10-01T10:00:00Z');
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

const healthy = (over: Partial<PhoneSnapshot> = {}): PhoneSnapshot => ({
  isActive: true,
  token: 'ExponentPushToken[abc]',
  platform: 'ios',
  lastSeenAt: minsAgo(5),
  app_version: '1.1.0',
  notif_permission: 'granted',
  location_permission: 'while_using',
  location_services_on: true,
  battery_level: 0.8,
  low_power_mode: false,
  health_reported_at: minsAgo(5),
  ...over,
});

describe('compareVersions', () => {
  it('compares numerically, not as text', () => {
    assert.equal(compareVersions('1.10.0', '1.9.3'), 1);
    assert.equal(compareVersions('1.2', '1.2.0'), 0);
    assert.equal(compareVersions('1.0.0', '2.0.0'), -1);
  });
  it('treats a missing version as below any minimum, and no minimum as no check', () => {
    assert.equal(isBelowMinVersion(null, '1.0.0'), true);
    assert.equal(isBelowMinVersion('0.9.0', null), false);
    assert.equal(isBelowMinVersion('1.0.0', '1.0.0'), false);
  });
});

describe('computePhoneStatus', () => {
  it('is green for a healthy, recently seen phone', () => {
    const st = computePhoneStatus([healthy()], { now: NOW });
    assert.equal(st.level, 'green');
    assert.deepEqual(st.reasons, []);
  });

  it('is red with no device at all', () => {
    const st = computePhoneStatus([], { now: NOW });
    assert.equal(st.level, 'red');
    assert.match(st.reasons[0], /No phone registered/);
  });

  it('is red when notifications or location are denied', () => {
    assert.equal(computePhoneStatus([healthy({ notif_permission: 'denied', token: null })], { now: NOW }).level, 'red');
    assert.equal(computePhoneStatus([healthy({ location_permission: 'denied' })], { now: NOW }).level, 'red');
  });

  it('goes amber after 2 h unseen and red after 24 h', () => {
    assert.equal(computePhoneStatus([healthy({ lastSeenAt: minsAgo(3 * 60) })], { now: NOW }).level, 'amber');
    assert.equal(computePhoneStatus([healthy({ lastSeenAt: minsAgo(25 * 60) })], { now: NOW }).level, 'red');
  });

  it('flags battery saver, low battery and GPS off as amber', () => {
    assert.equal(computePhoneStatus([healthy({ low_power_mode: true })], { now: NOW }).level, 'amber');
    assert.equal(computePhoneStatus([healthy({ battery_level: 0.1 })], { now: NOW }).level, 'amber');
    assert.equal(computePhoneStatus([healthy({ location_services_on: false })], { now: NOW }).level, 'amber');
  });

  it('treats an old build (no health report) as amber, and below the minimum as red', () => {
    const old = healthy({ health_reported_at: null, app_version: null, notif_permission: null, location_permission: null });
    assert.equal(computePhoneStatus([old], { now: NOW }).level, 'amber');
    assert.equal(computePhoneStatus([old], { now: NOW, minVersion: '1.1.0' }).level, 'red');
    assert.equal(computePhoneStatus([healthy({ app_version: '1.0.0' })], { now: NOW, minVersion: '1.1.0' }).level, 'red');
  });

  it('flags "not the latest" as amber only', () => {
    const st = computePhoneStatus([healthy({ app_version: '1.0.0' })], { now: NOW, latestVersion: '1.1.0' });
    assert.equal(st.level, 'amber');
    assert.match(st.reasons[0], /not the latest/);
  });

  it('uses the most recently seen active device and ignores inactive ones', () => {
    const oldPhone = healthy({ lastSeenAt: minsAgo(30 * 24 * 60), notif_permission: 'denied' });
    const retired = healthy({ isActive: false, lastSeenAt: minsAgo(1), location_permission: 'denied' });
    const st = computePhoneStatus([oldPhone, healthy(), retired], { now: NOW });
    assert.equal(st.level, 'green');
  });
});

describe('isRetryablePushError', () => {
  it('retries only Expo-side failures', () => {
    assert.equal(isRetryablePushError('ExpoUnreachable'), true);
    assert.equal(isRetryablePushError('DeviceNotRegistered'), false);
    assert.equal(isRetryablePushError('InvalidCredentials'), false);
  });
});
