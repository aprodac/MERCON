import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkSignedLink } from '../fileLinks';
import { driverPhotoLink, driverSender } from './sender';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const BASE = 'https://dev.mercon.tech';

describe('driverPhotoLink', () => {
  it('turns an inline photo into a full signed /api/media link', () => {
    const link = driverPhotoLink(`${BASE}/`, { id: ID, avatar_url: PNG })!;
    const m = /^https:\/\/dev\.mercon\.tech\/api\/media\/s\/(\d+)\/([A-Za-z0-9_-]+)\/(driver-[0-9a-f-]{36}-[0-9a-f]{12})$/.exec(link);
    assert.ok(m, link);
    assert.equal(checkSignedLink(m[1], m[2], m[3]), 'ok');
  });

  it('signs an uploaded photo file', () => {
    const link = driverPhotoLink(BASE, { id: ID, avatar_url: '/uploads/abc.jpg' })!;
    assert.match(link, /^https:\/\/dev\.mercon\.tech\/uploads\/s\/\d+\/[A-Za-z0-9_-]+\/abc\.jpg$/);
  });

  it('keeps a full https link and gives up without a photo or an https address', () => {
    assert.equal(driverPhotoLink(BASE, { id: ID, avatar_url: 'https://cdn.example/a.png' }), 'https://cdn.example/a.png');
    assert.equal(driverPhotoLink(BASE, { id: ID, avatar_url: null }), null);
    assert.equal(driverPhotoLink('http://localhost:3000', { id: ID, avatar_url: PNG }), null);
    assert.equal(driverPhotoLink(null, { id: ID, avatar_url: '/uploads/abc.jpg' }), null);
  });

  it('names the sender', () => {
    assert.deepEqual(driverSender(BASE, { id: ID, avatar_url: null }, 'Faisal Omar'), { id: ID, name: 'Faisal Omar', image: null });
  });
});
