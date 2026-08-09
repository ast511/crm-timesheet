import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Express } from 'express';

/** Environment variable holding this deployment's proxy topology. */
export const TRUST_PROXY_KEY = 'TRUST_PROXY';

/** The Express application setting the value above is written to. */
export const TRUST_PROXY_SETTING = 'trust proxy';

/** Presets Express understands by name, alongside addresses and subnets. */
export const TRUST_PROXY_PRESETS = ['loopback', 'linklocal', 'uniquelocal'];

/** A hop count: "trust exactly this many proxies in front of me". */
const HOP_COUNT_PATTERN = /^\d+$/;

/**
 * An address or CIDR block, loosely.
 *
 * Hex digits, dots, colons and an optional prefix length cover IPv4, IPv6 and
 * both in CIDR form. It is deliberately not a full address grammar — Express
 * parses these itself and will complain about a malformed one — but it is tight
 * enough to reject the mistakes an operator actually makes: `localhost`, `yes`,
 * a hostname, a URL.
 */
const ADDRESS_OR_SUBNET_PATTERN = /^[0-9a-fA-F.:]+(\/\d{1,3})?$/;

const TRUST_PROXY_SEPARATOR = ',';

/**
 * What Express's `trust proxy` setting accepts, as this project exposes it.
 *
 * `false` — trust nothing. `true` — trust every hop. A number — trust that many
 * hops. A list — trust these addresses, subnets or presets.
 */
export type TrustProxySetting = boolean | number | string[];

/**
 * Whether the backend should believe `X-Forwarded-For`, and how far.
 *
 * ## Why this variable exists at all
 *
 * `request.ip` is the address the rate limiter counts against (Feature 034) and
 * the address recorded beside every issued refresh token (Feature 032). Express
 * derives it from the socket unless `trust proxy` is set, and **both ways of
 * getting this wrong are serious**:
 *
 * - **Set to `false` behind a proxy** — every request appears to come from the
 *   load balancer, so the entire internet shares one rate-limit bucket. The
 *   first busy minute locks out the whole company, and the audit columns record
 *   the proxy's address for every session. A self-inflicted outage.
 * - **Set to `true` with no proxy in front** — `X-Forwarded-For` is a request
 *   header, which means the *caller* writes it. Anyone can present a fresh
 *   address on every request and the limiter counts each one separately, so the
 *   limit is not merely weakened, it is gone. Free to bypass with one header.
 *
 * There is no value that is safe in both topologies, which is exactly why this
 * is configuration rather than a default somebody could inherit by accident.
 *
 * ## What to set
 *
 * **Off is the default**, because a developer machine has no proxy and an
 * unconfigured deployment should fail in the direction that over-counts rather
 * than the one that can be bypassed. A shared bucket is visible immediately; a
 * spoofable one is invisible until it matters.
 *
 * **A hop count is the recommendation for a proxied deployment.** `TRUST_PROXY=1`
 * behind a single nginx, ALB or ingress means "the last entry in the chain was
 * written by my proxy; trust that one and no further", which stays correct even
 * when the proxy's own address changes — as it does on every managed load
 * balancer. `true` is accepted because a value Express accepts should not be one
 * this parser rejects, and it is logged as a warning wherever it is used: it is
 * only safe when nothing can reach the backend except the proxy.
 */
export function parseTrustProxy(
  rawValue: string | undefined,
): TrustProxySetting {
  const value = (rawValue ?? '').trim();

  // Unset, blank and an explicitly cleared placeholder are all "no proxy" — the
  // same reading `loadSmtpConfig` gives a blank variable, so a value commented
  // out and a value emptied mean the same thing.
  if (value === '' || value.toLowerCase() === 'false') {
    return false;
  }

  if (value.toLowerCase() === 'true') {
    return true;
  }

  if (HOP_COUNT_PATTERN.test(value)) {
    return Number(value);
  }

  return parseTrustProxyList(value);
}

/**
 * Splits an address list into its entries.
 *
 * Exported so `env.validation.ts` checks exactly the entries the application
 * will later hand to Express, rather than a second reading of the same string —
 * the arrangement `parseOrigins` and `IsOriginListConstraint` already use for
 * `CORS_ORIGINS`.
 */
export function parseTrustProxyList(rawValue: string): string[] {
  return rawValue
    .split(TRUST_PROXY_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Whether an entry is a preset, an address, or a subnet. */
export function isTrustProxyEntry(entry: string): boolean {
  return (
    TRUST_PROXY_PRESETS.includes(entry.toLowerCase()) ||
    ADDRESS_OR_SUBNET_PATTERN.test(entry)
  );
}

/**
 * Applies the setting to the underlying Express instance.
 *
 * Called from `configureApp`, so the e2e suite and every spec that boots through
 * it resolve `request.ip` exactly as the running server does. Doing it in
 * `main.ts` instead would have left the tests measuring a different address from
 * the one production counts, which is the whole class of bug `configureApp`
 * exists to prevent.
 */
export function applyTrustProxy(
  app: INestApplication,
  configService: ConfigService,
): TrustProxySetting {
  const setting = parseTrustProxy(configService.get<string>(TRUST_PROXY_KEY));

  if (setting === true) {
    Logger.warn(
      `${TRUST_PROXY_KEY} is "true", so every X-Forwarded-For header is believed. ` +
        'That is only safe when nothing can reach this backend except the proxy — ' +
        'otherwise a caller can write their own address and defeat rate limiting. ' +
        'Prefer a hop count, such as TRUST_PROXY=1.',
      'TrustProxy',
    );
  }

  // `getInstance()` is untyped on the adapter interface, so the cast is what
  // names the platform this setting belongs to: `trust proxy` is Express's, and
  // the day this application runs on Fastify the compiler stops here rather than
  // silently doing nothing.
  const express = app.getHttpAdapter().getInstance() as Express;

  express.set(TRUST_PROXY_SETTING, setting);

  return setting;
}
