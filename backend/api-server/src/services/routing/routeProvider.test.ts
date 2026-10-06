import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { getDrivingRoute, RoutingUnavailableError } from './routeProvider';

const RIYADH = { lat: 24.7136, lng: 46.6753 };
const JEDDAH = { lat: 21.4225, lng: 39.8262 };

const realFetch = globalThis.fetch;

/** Replace fetch for one test, capturing the URL the provider built. */
function stubFetch(handler: (url: string) => any) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: any) => {
    calls.push(String(url));
    return handler(String(url));
  }) as typeof fetch;
  return calls;
}

const okResponse = (body: any) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const OSRM_OK = {
  code: 'Ok',
  routes: [
    {
      distance: 848000,
      duration: 32400,
      geometry: { coordinates: [[46.6753, 24.7136], [43.0, 23.0], [39.8262, 21.4225]] },
    },
  ],
};

describe('getDrivingRoute', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('returns geometry, distance and duration from a good response', async () => {
    stubFetch(() => okResponse(OSRM_OK));
    const route = await getDrivingRoute(RIYADH, JEDDAH);

    assert.equal(route.distanceMeters, 848000);
    // OSRM's 9 h is car time (94 km/h); a truck is timed at no more than 80 km/h: 848 km → 10.6 h.
    assert.equal(route.durationSeconds, 38160);
    assert.equal(route.geometry.length, 3);
    assert.deepEqual(route.geometry[0], [46.6753, 24.7136]);
    assert.equal(route.provider, 'osrm');
  });

  it('sends coordinates in OSRM lng,lat order — reversed from ours', async () => {
    const calls = stubFetch(() => okResponse(OSRM_OK));
    await getDrivingRoute(RIYADH, JEDDAH);

    // lng,lat;lng,lat — getting this backwards routes to the wrong hemisphere.
    assert.match(calls[0], /\/route\/v1\/driving\/46\.6753,24\.7136;39\.8262,21\.4225/);
    assert.match(calls[0], /geometries=geojson/);
  });

  it('honours OSRM_BASE_URL so the provider can be swapped without an app release', async () => {
    const previous = process.env.OSRM_BASE_URL;
    process.env.OSRM_BASE_URL = 'http://osrm.internal:5000/';
    // The module reads the env var at load time, so re-import it fresh.
    delete require.cache[require.resolve('./routeProvider')];
    const { getDrivingRoute: freshGetRoute } = require('./routeProvider');

    const calls = stubFetch(() => okResponse(OSRM_OK));
    await freshGetRoute(RIYADH, JEDDAH);
    assert.match(calls[0], /^http:\/\/osrm\.internal:5000\/route\/v1\/driving\//);

    if (previous === undefined) delete process.env.OSRM_BASE_URL;
    else process.env.OSRM_BASE_URL = previous;
    delete require.cache[require.resolve('./routeProvider')];
  });

  it('keeps OSRM time when it is already slower than truck speed', async () => {
    stubFetch(() => okResponse({ code: 'Ok', routes: [{ distance: 10000, duration: 900, geometry: { coordinates: [[1, 2], [3, 4]] }, legs: [{ distance: 10000, duration: 900 }] }] }));
    const route = await getDrivingRoute(RIYADH, JEDDAH);
    assert.equal(route.durationSeconds, 900); // 40 km/h in town stays 40 km/h
    assert.equal(route.legs[0].durationSeconds, 900);
  });

  describe('with our own route server configured', () => {
    let fresh: typeof getDrivingRoute;
    const previous = process.env.OSRM_BASE_URL;
    beforeEach(() => {
      process.env.OSRM_BASE_URL = 'http://osrm:5000';
      delete require.cache[require.resolve('./routeProvider')];
      fresh = require('./routeProvider').getDrivingRoute;
    });
    afterEach(() => {
      if (previous === undefined) delete process.env.OSRM_BASE_URL;
      else process.env.OSRM_BASE_URL = previous;
      delete require.cache[require.resolve('./routeProvider')];
    });

    it('asks the public server when ours is unreachable', async () => {
      const calls = stubFetch((url) => {
        if (url.startsWith('http://osrm:5000')) throw new Error('getaddrinfo ENOTFOUND osrm');
        return okResponse(OSRM_OK);
      });
      const route = await fresh(RIYADH, JEDDAH);
      assert.equal(calls.length, 2);
      assert.match(calls[1], /^https:\/\/router\.project-osrm\.org\/route\/v1\/driving\//);
      assert.equal(route.provider, 'osrm-public');
    });

    it('asks the public server when ours answers 5xx', async () => {
      const calls = stubFetch((url) => (url.startsWith('http://osrm:5000') ? { ok: false, status: 503, json: async () => ({}) } : okResponse(OSRM_OK)));
      await fresh(RIYADH, JEDDAH);
      assert.equal(calls.length, 2);
    });

    it('does not fall back when ours says there is no road route', async () => {
      const calls = stubFetch(() => okResponse({ code: 'NoRoute', routes: [] }));
      // A fresh module load has its own error class, so match by name.
      await assert.rejects(() => fresh(RIYADH, JEDDAH), { name: 'RoutingUnavailableError' });
      assert.equal(calls.length, 1);
    });
  });

  it('rejects invalid coordinates before making a request', async () => {
    const calls = stubFetch(() => okResponse(OSRM_OK));
    await assert.rejects(
      () => getDrivingRoute({ lat: NaN, lng: 46 }, JEDDAH),
      RoutingUnavailableError,
    );
    await assert.rejects(
      () => getDrivingRoute({ lat: 91, lng: 46 }, JEDDAH),
      RoutingUnavailableError,
    );
    assert.equal(calls.length, 0, 'must not call the provider with bad input');
  });

  it('treats a provider error status as unavailable', async () => {
    stubFetch(() => ({ ok: false, status: 502, json: async () => ({}) }));
    await assert.rejects(() => getDrivingRoute(RIYADH, JEDDAH), RoutingUnavailableError);
  });

  it('treats a non-Ok OSRM code as unavailable', async () => {
    stubFetch(() => okResponse({ code: 'NoRoute', routes: [] }));
    await assert.rejects(() => getDrivingRoute(RIYADH, JEDDAH), RoutingUnavailableError);
  });

  it('treats an empty or missing geometry as unavailable rather than a blank route', async () => {
    stubFetch(() => okResponse({ code: 'Ok', routes: [{ distance: 1, duration: 1, geometry: { coordinates: [] } }] }));
    await assert.rejects(() => getDrivingRoute(RIYADH, JEDDAH), RoutingUnavailableError);

    stubFetch(() => okResponse({ code: 'Ok', routes: [{ distance: 1, duration: 1 }] }));
    await assert.rejects(() => getDrivingRoute(RIYADH, JEDDAH), RoutingUnavailableError);
  });

  it('converts a network failure into RoutingUnavailableError, not a raw throw', async () => {
    stubFetch(() => { throw new Error('ECONNREFUSED'); });
    await assert.rejects(() => getDrivingRoute(RIYADH, JEDDAH), RoutingUnavailableError);
  });

  it('defaults a missing distance or duration to 0 rather than NaN', async () => {
    stubFetch(() => okResponse({
      code: 'Ok',
      routes: [{ geometry: { coordinates: [[1, 2], [3, 4]] } }],
    }));
    const route = await getDrivingRoute(RIYADH, JEDDAH);
    assert.equal(route.distanceMeters, 0);
    assert.equal(route.durationSeconds, 0);
  });
});
