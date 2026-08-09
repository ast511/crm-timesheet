import {
  isTrustProxyEntry,
  parseTrustProxy,
  parseTrustProxyList,
} from './trust-proxy.config';

/**
 * The setting that decides what `request.ip` resolves to, and therefore who the
 * rate limiter counts a request against.
 *
 * What is asserted here is the parsing rather than the effect — that a value an
 * operator writes becomes the value Express is handed. The *effect*, that a
 * forwarded address is believed when this is on and ignored when it is off, is
 * asserted end to end over HTTP in `modules/rate-limiting/routing.spec.ts`,
 * because it is only observable there.
 */
describe('parseTrustProxy', () => {
  /**
   * Off is the default, and an unset variable, a blank one and an explicitly
   * cleared one all have to mean it. A deployment that has not thought about
   * proxies must fail in the direction that over-counts rather than the one that
   * can be bypassed with a header.
   */
  it.each([undefined, '', '   ', 'false', 'FALSE', ' false '])(
    'reads %p as trusting no proxy',
    (raw) => {
      expect(parseTrustProxy(raw)).toBe(false);
    },
  );

  it.each(['true', 'TRUE', ' true '])(
    'reads %p as trusting every hop',
    (raw) => {
      expect(parseTrustProxy(raw)).toBe(true);
    },
  );

  /** The recommended shape: "trust this many proxies and no further". */
  it('reads a hop count as a number', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy(' 2 ')).toBe(2);
  });

  /**
   * Zero is a number Express accepts and it means "trust nothing", which is the
   * same thing `false` means. It is passed through as written rather than folded
   * into `false`, so what the operator configured is what the setting shows.
   */
  it('passes a zero hop count through as a number', () => {
    expect(parseTrustProxy('0')).toBe(0);
  });

  it('reads a single address as a one-entry list', () => {
    expect(parseTrustProxy('10.0.0.1')).toEqual(['10.0.0.1']);
  });

  it('reads a list of addresses, subnets and presets', () => {
    expect(parseTrustProxy('loopback, 10.0.0.0/8 ,::1')).toEqual([
      'loopback',
      '10.0.0.0/8',
      '::1',
    ]);
  });

  it('drops blank entries from a list', () => {
    expect(parseTrustProxyList('10.0.0.1,,  ,10.0.0.2')).toEqual([
      '10.0.0.1',
      '10.0.0.2',
    ]);
  });
});

describe('isTrustProxyEntry', () => {
  it.each(['loopback', 'linklocal', 'uniquelocal', 'LOOPBACK'])(
    'accepts the preset %p',
    (entry) => {
      expect(isTrustProxyEntry(entry)).toBe(true);
    },
  );

  it.each(['127.0.0.1', '10.0.0.0/8', '::1', 'fd00::/8', '192.168.1.1'])(
    'accepts %p',
    (entry) => {
      expect(isTrustProxyEntry(entry)).toBe(true);
    },
  );

  /**
   * The mistakes an operator actually makes. Express treats an unrecognised
   * value as a hostname to resolve rather than refusing it, so a typo here would
   * otherwise become a backend that resolves client addresses in a way nobody
   * intended — and, since that address is what the limiter counts, a limiter
   * that does not work.
   */
  it.each(['localhost', 'yes', 'on', 'http://proxy', 'my-proxy.internal'])(
    'rejects %p',
    (entry) => {
      expect(isTrustProxyEntry(entry)).toBe(false);
    },
  );
});
