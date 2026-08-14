import {
  Controller,
  Get,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { ERROR_CODES } from '../../common/constants/error-codes.constants';
import { CurrentEmployeeId } from '../../common/decorators/current-employee-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { codedError } from '../../common/errors/coded-error';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import {
  API_DEFAULT_VERSION,
  API_PREFIX,
  API_VERSION_PREFIX,
} from '../../config/api.constants';
import { UserRole } from '../../generated/prisma/enums';
import { AccountPasswordService } from './account-password.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { DEFAULT_REFRESH_COOKIE_NAME } from './refresh-cookie.config';
import { RefreshTokenCookie } from './refresh-token.cookie';

/**
 * A stand-in for the eighteen modules that read the caller through the seam.
 *
 * **This controller is the acceptance test of the whole feature.** Its three
 * handlers are written exactly as every real controller in this application
 * writes them — `@CurrentUser() user: CurrentUser`, `@CurrentEmployeeId() id:
 * string` — and neither line has changed since Feature 026 and Feature 023 wrote
 * them against three headers. What changed is what fills them, and it is
 * invisible from here. That is what "no controller, service, repository, DTO or
 * test signature moves" means, checked rather than asserted.
 */
@Controller('seam')
class SeamProbeController {
  @Get('caller')
  caller(@CurrentUser() user: CurrentUser): CurrentUser {
    return user;
  }

  @Get('employee')
  employee(@CurrentEmployeeId() employeeId: string): { employeeId: string } {
    return { employeeId };
  }

  @Public()
  @Get('open')
  open(): { ok: true } {
    return { ok: true };
  }
}

const CALLER: CurrentUser = {
  userId: 'usr-1',
  employeeId: 'emp-1',
  role: UserRole.HR,
  administrativeAccess: true,
};

/** The body login and refresh answer with — no refresh token anywhere in it. */
const SESSION = {
  accessToken: 'new-access-token',
  tokenType: 'Bearer' as const,
  expiresIn: 900,
  user: {
    id: 'usr-1',
    email: 'maria.ionescu@company.com',
    role: UserRole.HR,
    employeeId: 'emp-1',
    administrativeAccess: true,
  },
};

const ISSUED_REFRESH_TOKEN = 'i'.repeat(64);

/**
 * What `AuthService.login` and `.refresh` now return: the body, plus the two
 * values the controller needs in order to write the cookie.
 */
const ISSUED = {
  session: SESSION,
  refreshToken: ISSUED_REFRESH_TOKEN,
  refreshTokenExpiresAt: new Date(Date.now() + 604_800_000),
};

const VALID_TOKEN = 'a-valid-access-token';
const REFRESH_TOKEN = 'r'.repeat(64);

/** A refresh cookie on a request, as a browser would send it. */
const refreshCookie = (token: string): string =>
  `${DEFAULT_REFRESH_COOKIE_NAME}=${token}`;

/** The `Set-Cookie` entries a response carried, as a plain array. */
const setCookies = (response: request.Response): string[] => {
  const header: unknown = response.headers['set-cookie'];

  if (header === undefined) {
    return [];
  }

  return Array.isArray(header) ? (header as string[]) : [String(header)];
};

/** The one `Set-Cookie` naming the refresh cookie, or `undefined`. */
const refreshSetCookie = (response: request.Response): string | undefined =>
  setCookies(response).find((cookie) =>
    cookie.startsWith(`${DEFAULT_REFRESH_COOKIE_NAME}=`),
  );

describe('auth routing', () => {
  let app: INestApplication;

  /** The four password routes Feature 036 added, stubbed. See the providers. */
  const passwords = {
    activate: jest.fn().mockResolvedValue(undefined),
    forgotPassword: jest.fn().mockResolvedValue(undefined),
    resetPassword: jest.fn().mockResolvedValue(undefined),
    changePassword: jest.fn().mockResolvedValue(undefined),
  };

  const auth = {
    login: jest.fn().mockResolvedValue(ISSUED),
    refresh: jest.fn().mockResolvedValue(ISSUED),
    logout: jest.fn().mockResolvedValue(undefined),
    describeSelf: jest.fn().mockResolvedValue(SESSION.user),
    // Refuses exactly as the real service does, code included — otherwise this
    // spec would assert an envelope the running application does not produce.
    authenticate: jest.fn((token: string) => {
      if (token !== VALID_TOKEN) {
        throw new UnauthorizedException(
          codedError(
            ERROR_CODES.AUTH_UNAUTHENTICATED,
            'Invalid or expired access token',
          ),
        );
      }

      return Promise.resolve(CALLER);
    }),
  };

  const bearer = { authorization: `Bearer ${VALID_TOKEN}` };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController, SeamProbeController],
      providers: [
        { provide: AuthService, useValue: auth },
        // Feature 036 put four more routes on this controller — activate,
        // forgot-password, reset-password and change-password — so it now takes
        // a second collaborator. It is stubbed rather than exercised here: what
        // those four *do* is `account-password.service.spec.ts` and
        // `account-lifecycle/routing.spec.ts`, and this file is about the guard,
        // the header parsing and the identity seam.
        { provide: AccountPasswordService, useValue: passwords },
        // The real cookie writer (Feature 040), against an empty
        // `ConfigService` — so what is asserted below is the *default* cookie
        // every deployment gets when it configures nothing, rather than a set of
        // attributes invented by this spec. `refresh-cookie.config.spec.ts`
        // covers what each variable changes.
        { provide: ConfigService, useValue: new ConfigService({}) },
        RefreshTokenCookie,
        // The guard as the application registers it, so what is exercised here
        // is the wiring the server actually has.
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();

    // `configureApp` registers this globally; the routes below cannot read a
    // cookie without it, which is precisely what a request with no parser looks
    // like — so a spec that forgot it would fail with 401s rather than silently
    // testing nothing.
    app.use(cookieParser());

    app.setGlobalPrefix(API_PREFIX);
    app.enableVersioning({
      type: VersioningType.URI,
      prefix: API_VERSION_PREFIX,
      defaultVersion: API_DEFAULT_VERSION,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/login', () => {
    const login = () => request(app.getHttpServer()).post('/api/v1/auth/login');

    it('answers 200 with a session, not the 201 a POST defaults to', async () => {
      await login()
        .send({ email: 'maria.ionescu@company.com', password: 'a password' })
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toMatchObject({
            accessToken: SESSION.accessToken,
            tokenType: 'Bearer',
            expiresIn: 900,
          });
        });
    });

    /**
     * **Feature 040, in one assertion.** The access token is in the body where
     * it has always been, and the refresh token is not in the body at all — it
     * is in a cookie a script cannot read.
     */
    it('puts the refresh token in an HttpOnly cookie and not in the body', async () => {
      const response = await login()
        .send({ email: 'maria.ionescu@company.com', password: 'a password' })
        .expect(200);

      expect(response.body.data.accessToken).toBe(SESSION.accessToken);
      expect(response.body.data).not.toHaveProperty('refreshToken');
      expect(JSON.stringify(response.body)).not.toContain(ISSUED_REFRESH_TOKEN);

      const cookie = refreshSetCookie(response);

      expect(cookie).toContain(
        `${DEFAULT_REFRESH_COOKIE_NAME}=${ISSUED_REFRESH_TOKEN}`,
      );
      expect(cookie).toContain('HttpOnly');
    });

    /**
     * The default attributes, spelled out. `Path` keeps the credential off
     * every other route, `SameSite=Lax` is what stops another site causing a
     * refresh, and `Max-Age` is the token's own lifetime rather than a second
     * reading of `JWT_REFRESH_TTL`.
     *
     * `Secure` is **absent** here, and that is the development default rather
     * than an omission: set against `http://localhost` it would produce a cookie
     * the browser stores and never sends back. `NODE_ENV=production` turns it
     * on, which is asserted in `refresh-cookie.config.spec.ts`.
     */
    it('scopes the cookie to the auth routes and expires it with the token', async () => {
      const response = await login()
        .send({ email: 'maria.ionescu@company.com', password: 'a password' })
        .expect(200);

      const cookie = refreshSetCookie(response) ?? '';

      expect(cookie).toContain('Path=/api/v1/auth');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).not.toContain('Secure');
      expect(cookie).toMatch(/Max-Age=6047\d\d/);
    });

    /**
     * The envelope is the interceptor's, and `@Res({ passthrough: true })` is
     * what keeps it that way — without the passthrough the handler would own the
     * response, the wrapper would never run, and a `POST` would answer `201`.
     */
    it('still answers through the envelope with the cookie set', async () => {
      const response = await login()
        .send({ email: 'maria.ionescu@company.com', password: 'a password' })
        .expect(200);

      expect(response.body).toEqual({ success: true, data: SESSION });
    });

    /** The endpoint that issues a token cannot require one. */
    it('needs no access token of its own', async () => {
      await login()
        .send({ email: 'maria.ionescu@company.com', password: 'a password' })
        .expect(200);

      expect(auth.authenticate).not.toHaveBeenCalled();
    });

    /**
     * The address is folded before the lookup because `POST /users` folded it
     * before storing — a login typed with capitals must find the same row.
     */
    it('trims and lower-cases the address before the lookup', async () => {
      await login()
        .send({
          email: '  Maria.Ionescu@Company.com  ',
          password: 'a password',
        })
        .expect(200);

      expect(auth.login).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'maria.ionescu@company.com' }),
        expect.anything(),
      );
    });

    /** Leading and trailing spaces are legitimate characters in a passphrase. */
    it('does not trim the password', async () => {
      await login()
        .send({ email: 'maria.ionescu@company.com', password: '  spaced  ' })
        .expect(200);

      expect(auth.login).toHaveBeenCalledWith(
        expect.objectContaining({ password: '  spaced  ' }),
        expect.anything(),
      );
    });

    it('rejects an address that is not one', async () => {
      await login()
        .send({ email: 'not-an-address', password: 'x' })
        .expect(400);

      expect(auth.login).not.toHaveBeenCalled();
    });

    it('rejects a missing password', async () => {
      await login().send({ email: 'maria.ionescu@company.com' }).expect(400);

      expect(auth.login).not.toHaveBeenCalled();
    });

    /**
     * Without this bound a public, unauthenticated endpoint would hand a
     * megabyte of attacker-supplied text to a deliberately slow hash function,
     * once per request.
     */
    it('rejects a password longer than bcrypt could ever have hashed', async () => {
      await login()
        .send({
          email: 'maria.ionescu@company.com',
          password: 'x'.repeat(1000),
        })
        .expect(400);

      expect(auth.login).not.toHaveBeenCalled();
    });

    it('rejects a body field it does not offer, rather than ignoring it', async () => {
      await login()
        .send({
          email: 'maria.ionescu@company.com',
          password: 'a password',
          role: 'SUPERADMIN',
        })
        .expect(400);
    });

    it('passes the client’s self-description to the service', async () => {
      await login()
        .set('user-agent', 'Mozilla/5.0 (a browser)')
        .send({ email: 'maria.ionescu@company.com', password: 'a password' })
        .expect(200);

      expect(auth.login).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userAgent: 'Mozilla/5.0 (a browser)' }),
      );
    });
  });

  describe('POST /auth/refresh', () => {
    const refresh = () =>
      request(app.getHttpServer()).post('/api/v1/auth/refresh');

    /**
     * `@Public()` at the authentication level only: this endpoint is protected
     * by a *different* credential. Requiring an access token as well would make
     * a session unrecoverable in the exact situation refresh exists for.
     *
     * As of Feature 040 that credential is the cookie, and the request carries
     * no body at all.
     */
    it('authenticates with the refresh cookie rather than an access token', async () => {
      await refresh().set('Cookie', refreshCookie(REFRESH_TOKEN)).expect(200);

      expect(auth.authenticate).not.toHaveBeenCalled();
      expect(auth.refresh).toHaveBeenCalledWith(
        REFRESH_TOKEN,
        expect.anything(),
      );
    });

    /** The successor replaces the cookie, so the client holds nothing to update. */
    it('writes the new token back as a fresh cookie', async () => {
      const response = await refresh()
        .set('Cookie', refreshCookie(REFRESH_TOKEN))
        .expect(200);

      expect(refreshSetCookie(response)).toContain(
        `${DEFAULT_REFRESH_COOKIE_NAME}=${ISSUED_REFRESH_TOKEN}`,
      );
      expect(response.body.data).not.toHaveProperty('refreshToken');
    });

    /**
     * The bounds and the trim used to be `RefreshDto`'s and are now
     * `RefreshTokenCookie.read`'s, because the `ValidationPipe` never sees a
     * cookie. A copy-paste artefact is still not part of the credential.
     */
    it('trims the cookie, so a stray space is not a revoked session', async () => {
      await refresh()
        .set('Cookie', refreshCookie(`  ${REFRESH_TOKEN}  `))
        .expect(200);

      expect(auth.refresh).toHaveBeenCalledWith(
        REFRESH_TOKEN,
        expect.anything(),
      );
    });

    /**
     * **The existing code, not a new one.** A browser holding no cookie sends no
     * header, so there is nothing for a missing-field `400` to describe; the
     * answer is the `401` an unusable refresh token has always produced.
     */
    it('answers the existing coded 401 when no cookie is sent', async () => {
      await refresh()
        .expect(401)
        .expect(({ body }) => {
          expect(body.errorCode).toBe('AUTH_REFRESH_TOKEN_INVALID');
        });

      expect(auth.refresh).not.toHaveBeenCalled();
    });

    /**
     * A cookie is whatever the client wrote under that name, so the shape check
     * survives the move — it is what keeps an anonymous caller from pushing an
     * arbitrary string into a SHA-256 and a JWT parse.
     */
    it.each([
      ['far too short', 'short'],
      ['far too long', 'x'.repeat(2000)],
    ])('refuses a cookie value %s to be a token', async (_case, value) => {
      await refresh()
        .set('Cookie', refreshCookie(value))
        .expect(401)
        .expect(({ body }) => {
          expect(body.errorCode).toBe('AUTH_REFRESH_TOKEN_INVALID');
        });

      expect(auth.refresh).not.toHaveBeenCalled();
    });

    /** The cookie is the only source. Neither the URL nor a body is read. */
    it('reads the token from nowhere but the cookie', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/auth/refresh?refreshToken=${REFRESH_TOKEN}`)
        .send({ refreshToken: REFRESH_TOKEN })
        .expect(401);

      expect(auth.refresh).not.toHaveBeenCalled();
    });

    /**
     * A spent token has just revoked every session the account had, so the
     * cookie in the browser is a credential that can never work again. Leaving
     * it there would put a dead token on every subsequent request for a week.
     */
    it('clears the cookie when the token is refused', async () => {
      auth.refresh.mockRejectedValueOnce(
        new UnauthorizedException(
          codedError(
            ERROR_CODES.AUTH_REFRESH_TOKEN_REUSED,
            'This session has been ended for security reasons',
          ),
        ),
      );

      const response = await refresh()
        .set('Cookie', refreshCookie(REFRESH_TOKEN))
        .expect(401);

      expect(response.body.errorCode).toBe('AUTH_REFRESH_TOKEN_REUSED');
      expect(refreshSetCookie(response)).toContain(
        `${DEFAULT_REFRESH_COOKIE_NAME}=;`,
      );
    });

    /**
     * The other half of that rule, and the reason it is not "clear on any
     * error": a `429` or a `500` says nothing about the token, and signing
     * somebody out because their refresh landed during an incident turns a blip
     * into a support ticket.
     */
    it('leaves the cookie alone when the failure is not about the token', async () => {
      auth.refresh.mockRejectedValueOnce(new Error('the database blinked'));

      const response = await refresh()
        .set('Cookie', refreshCookie(REFRESH_TOKEN))
        .expect(500);

      expect(refreshSetCookie(response)).toBeUndefined();
    });
  });

  describe('POST /auth/logout', () => {
    const logout = () =>
      request(app.getHttpServer()).post('/api/v1/auth/logout');

    /** Both credentials: the access token proves who, the cookie proves what. */
    it('requires an access token as well as the refresh cookie', async () => {
      await logout().set('Cookie', refreshCookie(REFRESH_TOKEN)).expect(401);

      expect(auth.logout).not.toHaveBeenCalled();
    });

    it('revokes the cookie’s token for the authenticated caller', async () => {
      const response = await logout()
        .set(bearer)
        .set('Cookie', refreshCookie(REFRESH_TOKEN))
        .expect(200);

      expect(response.body).toEqual({ success: true, data: null });
      expect(auth.logout).toHaveBeenCalledWith(CALLER, REFRESH_TOKEN);
      expect(refreshSetCookie(response)).toContain(
        `${DEFAULT_REFRESH_COOKIE_NAME}=;`,
      );
    });

    /**
     * The cookie must be cleared with the attributes it was set with — a cookie
     * is identified by name **and** path, so a `Set-Cookie` at `/` would leave
     * the real one exactly where it was while claiming to have removed it.
     */
    it('clears the cookie at the path it was scoped to', async () => {
      const response = await logout()
        .set(bearer)
        .set('Cookie', refreshCookie(REFRESH_TOKEN))
        .expect(200);

      expect(refreshSetCookie(response)).toContain('Path=/api/v1/auth');
      expect(refreshSetCookie(response)).toContain('HttpOnly');
    });

    /**
     * **The one behaviour Feature 040 changed here**, and deliberately: a
     * logout naming no session used to be a `400` from the `ValidationPipe`.
     * There is no cookie equivalent of a missing field, and answering `400`
     * would mean a client whose cookie had already expired could not sign out
     * cleanly — which is exactly when it wants to. The route has always been
     * idempotent and silent about what it found.
     */
    it('still clears the cookie and answers 200 when none was sent', async () => {
      const response = await logout().set(bearer).expect(200);

      expect(response.body).toEqual({ success: true, data: null });
      expect(auth.logout).not.toHaveBeenCalled();
      expect(refreshSetCookie(response)).toContain(
        `${DEFAULT_REFRESH_COOKIE_NAME}=;`,
      );
    });
  });

  describe('GET /auth/me', () => {
    it('answers with the caller’s own account', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(bearer)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toEqual(SESSION.user);
          expect(body.data.passwordHash).toBeUndefined();
        });
    });

    it('requires a token', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });
  });

  /**
   * The guard, at the level it operates on. Everything here is about *whether
   * the caller is known* — never about what they may do, which is the
   * authorization enforcement feature.
   */
  describe('the global guard', () => {
    it('refuses a request with no Authorization header, naming what to send', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toContain('Bearer');
        });
    });

    it.each([
      ['a bare token with no scheme', VALID_TOKEN],
      ['the wrong scheme', `Basic ${VALID_TOKEN}`],
      ['a scheme with nothing after it', 'Bearer'],
      ['more than two parts', `Bearer ${VALID_TOKEN} extra`],
    ])('refuses %s', async (_case, header) => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .set({ authorization: header })
        .expect(401);
    });

    /** RFC 7235 makes the scheme a case-insensitive token, and clients differ. */
    it('accepts the scheme in any case', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .set({ authorization: `bearer ${VALID_TOKEN}` })
        .expect(200);
    });

    it('refuses a token the service does not recognise', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .set({ authorization: 'Bearer forged' })
        .expect(401);
    });

    it('lets a @Public() route through untouched', async () => {
      await request(app.getHttpServer()).get('/api/v1/seam/open').expect(200);

      expect(auth.authenticate).not.toHaveBeenCalled();
    });
  });

  /**
   * The seam, end to end. `@CurrentUser()` and `@CurrentEmployeeId()` have the
   * signatures Features 026 and 023 gave them; only their source changed.
   */
  describe('the identity seam', () => {
    it('resolves @CurrentUser() to the authenticated caller', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .set(bearer)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toEqual(CALLER);
        });
    });

    it('resolves @CurrentEmployeeId() to the same caller’s employment record', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/employee')
        .set(bearer)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toEqual({ employeeId: 'emp-1' });
        });
    });

    /**
     * A caller cannot claim administrative access independently of their role:
     * the value is derived where the role is read, and there is no longer any
     * channel through which it could be sent.
     */
    it('ignores an administrative-access header entirely', async () => {
      auth.authenticate.mockResolvedValueOnce({
        ...CALLER,
        role: UserRole.USER,
        administrativeAccess: false,
      });

      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .set({ ...bearer, 'x-administrative-access': 'true' })
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.administrativeAccess).toBe(false);
        });
    });

    /**
     * The one response code Feature 032 changed. A super-admin created to
     * administer the system is authenticated perfectly well and has no
     * employment record, so this is `403` rather than the `400` that used to
     * name a missing header.
     */
    it('answers 403 when the account has no employment record', async () => {
      auth.authenticate.mockResolvedValueOnce({ ...CALLER, employeeId: null });

      await request(app.getHttpServer())
        .get('/api/v1/seam/employee')
        .set(bearer)
        .expect(403);
    });

    /**
     * The identity headers Features 023 and 026 used are read nowhere. Sending
     * all three, with no token, gets a `401` — which is the whole feature in one
     * assertion.
     */
    it('reads none of the three headers it replaced', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .set({
          'x-user-id': 'usr-9',
          'x-user-role': 'SUPERADMIN',
          'x-employee-id': 'emp-9',
        })
        .expect(401);
    });
  });

  /**
   * The error codes as a client actually receives them (Feature 033).
   *
   * `auth.service.spec.ts` asserts which branch produces which code; this
   * asserts that the code survives the trip through `AllExceptionsFilter` and
   * lands on the envelope — which is the only thing a frontend can key a
   * translation on.
   */
  describe('the error envelope', () => {
    it('carries AUTH_UNAUTHENTICATED when no token is presented', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .expect(401)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            success: false,
            statusCode: 401,
            errorCode: 'AUTH_UNAUTHENTICATED',
          });
          expect(typeof body.message).toBe('string');
        });
    });

    it('carries AUTH_UNAUTHENTICATED for a token the service refuses', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .set({ authorization: 'Bearer forged' })
        .expect(401)
        .expect(({ body }) => {
          expect(body.errorCode).toBe('AUTH_UNAUTHENTICATED');
        });
    });

    /** A `403`: nothing is wrong with the credential, only with the account. */
    it('carries AUTH_NO_EMPLOYEE_RECORD when the account has no employment record', async () => {
      auth.authenticate.mockResolvedValueOnce({ ...CALLER, employeeId: null });

      await request(app.getHttpServer())
        .get('/api/v1/seam/employee')
        .set(bearer)
        .expect(403)
        .expect(({ body }) => {
          expect(body.errorCode).toBe('AUTH_NO_EMPLOYEE_RECORD');
        });
    });

    /**
     * The `ValidationPipe`'s failure gains one code for the whole request while
     * keeping every per-field sentence, so a form can still put each message
     * under its input and a heading can be translated from the code.
     */
    it('carries VALIDATION_ERROR and every field message for a rejected body', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-address', password: '' })
        .expect(400)
        .expect(({ body }) => {
          expect(body.errorCode).toBe('VALIDATION_ERROR');
          expect(Array.isArray(body.message)).toBe(true);
          expect(body.message.length).toBeGreaterThan(1);
        });
    });

    it('never emits params for a code that carries none', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .expect(401)
        .expect(({ body }) => {
          expect(body).not.toHaveProperty('params');
        });
    });

    /**
     * The regression that matters most: a route throwing a plain, uncoded
     * exception — which is every module except auth — still produces a valid
     * envelope, with no `errorCode` key for a client to trip over.
     */
    it('leaves the code off an uncoded failure, such as an unmatched route', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/nothing-here')
        .set(bearer)
        .expect(404)
        .expect(({ body }) => {
          expect(body).toMatchObject({ success: false, statusCode: 404 });
          expect(body).not.toHaveProperty('errorCode');
        });
    });
  });
});
