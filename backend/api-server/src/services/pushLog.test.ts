import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { delayMs, median, outcomeOf, plainReason, summarize, type DeliveryFacts } from './pushLog';
import { checkPushReceiptSignature, pushReceiptLink, receiptBase } from './pushReceipts';

const T0 = new Date('2026-10-06T10:00:00Z');
const at = (s: number) => new Date(T0.getTime() + s * 1000);
const row = (over: Partial<DeliveryFacts> = {}): DeliveryFacts => ({
  status: 'Sent', error_code: null, attempts: 1, received_at: null, createdAt: T0, ...over,
});

describe('push log outcome', () => {
  it('trusts the phone first, then Apple/Google', () => {
    assert.equal(outcomeOf(row({ received_at: at(2), status: 'Sent' })), 'arrived');
    assert.equal(outcomeOf(row({ status: 'Delivered' })), 'delivered');
    assert.equal(outcomeOf(row({ status: 'Sending' })), 'sending');
    assert.equal(outcomeOf(row({ status: 'Unknown' })), 'unknown');
  });

  it('says retrying while a retry is still coming, failed after', () => {
    assert.equal(outcomeOf(row({ status: 'Failed', error_code: 'ExpoUnreachable', attempts: 1 })), 'retrying');
    assert.equal(outcomeOf(row({ status: 'Failed', error_code: 'ExpoUnreachable', attempts: 3 })), 'failed');
    assert.equal(outcomeOf(row({ status: 'Failed', error_code: 'DeviceNotRegistered' })), 'failed');
  });

  it('explains failures in plain words', () => {
    assert.match(plainReason('DeviceNotRegistered')!, /uninstalled/);
    assert.equal(plainReason('SomethingNew', 'raw text'), 'raw text');
    assert.equal(plainReason(null), null);
  });

  it('measures delay from the alert to the phone and summarises a day', () => {
    assert.equal(delayMs(row({ received_at: at(3) })), 3000);
    assert.equal(delayMs(row()), null);
    assert.equal(median([5, 1, 3]), 3);
    assert.equal(median([]), null);
    const s = summarize([
      row({ received_at: at(2) }),
      row({ received_at: at(90) }),
      row({ status: 'Delivered' }),
      row({ status: 'Failed', error_code: 'DeviceNotRegistered' }),
      row({ status: 'Sending' }),
    ]);
    assert.deepEqual(s, { total: 5, arrived: 2, delivered: 1, sending: 1, failed: 1, slow: 1, typicalDelayMs: 46000 });
  });
});

describe('push receipt links', () => {
  const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
  it('are signed per delivery on the https address the phone uses', () => {
    const link = pushReceiptLink('https://mercon.tech/', ID)!;
    const m = /^https:\/\/mercon\.tech\/api\/push-receipts\/([0-9a-f-]{36})\/([A-Za-z0-9_-]+)$/.exec(link);
    assert.ok(m, link);
    assert.equal(checkPushReceiptSignature(m[1], m[2]), true);
    assert.equal(checkPushReceiptSignature('1f8fad5b-d9cb-469f-a165-70867728950e', m[2]), false);
    assert.equal(checkPushReceiptSignature(ID, 'nope'), false);
  });
  it('need an https address', () => {
    assert.equal(pushReceiptLink('http://localhost:3000', ID), null);
    assert.equal(receiptBase(null), null);
  });
});
