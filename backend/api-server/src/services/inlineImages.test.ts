import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { checkSignedLink } from './fileLinks';
import { inlineImageLink, isInlineImage, linkInlineImage } from './inlineImages';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const LINK = /^\/api\/media\/s\/(\d+)\/([A-Za-z0-9_-]+)\/((vehicle|driver|customer)-[0-9a-f-]{36}-[0-9a-f]{12})$/;

describe('inline image links', () => {
  test('an inline picture becomes a signed link that checks out', () => {
    const link = inlineImageLink('vehicle', ID, PNG)!;
    const m = LINK.exec(link);
    assert.ok(m, link);
    assert.equal(checkSignedLink(m[1], m[2], m[3]), 'ok');
    assert.ok(m[3].startsWith(`vehicle-${ID}-`));
  });

  test('the link is the same within the hour and different for another picture', () => {
    const now = Date.UTC(2026, 9, 5, 10, 5);
    assert.equal(inlineImageLink('driver', ID, PNG, now), inlineImageLink('driver', ID, PNG, now + 20 * 60_000));
    assert.notEqual(inlineImageLink('driver', ID, PNG, now), inlineImageLink('driver', ID, PNG.replace('A60e6kg', 'A60e6kh'), now));
  });

  test('a link with another name, or after it expired, is refused', () => {
    const m = LINK.exec(inlineImageLink('customer', ID, PNG)!)!;
    assert.equal(checkSignedLink(m[1], m[2], m[3].replace('customer', 'driver')), 'invalid');
    assert.equal(checkSignedLink(m[1], m[2], m[3], (Number(m[1]) + 1) * 1000), 'expired');
  });

  test('upload paths, empty values and rows without id are left as they are', () => {
    assert.equal(inlineImageLink('vehicle', ID, '/uploads/truck.jpg'), '/uploads/truck.jpg');
    assert.equal(inlineImageLink('vehicle', ID, null), null);
    assert.equal(inlineImageLink('vehicle', null, PNG), PNG);
    assert.equal(isInlineImage('https://x/y.png'), false);
  });

  test('linkInlineImage changes only the kind\'s own field, in place', () => {
    const driver = { id: ID, avatar_url: PNG, name: 'A' };
    linkInlineImage(driver, 'driver');
    assert.match(driver.avatar_url, LINK);
    const customer = { id: ID, logo_url: '/uploads/logo.png' };
    linkInlineImage(customer, 'customer');
    assert.equal(customer.logo_url, '/uploads/logo.png');
    assert.equal(linkInlineImage(null, 'vehicle'), null);
  });
});
