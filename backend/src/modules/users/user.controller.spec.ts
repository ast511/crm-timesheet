import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../generated/prisma/enums';
import { UserQueryDto } from './dto/user-query.dto';
import { UserController } from './user.controller';
import { UserService } from './user.service';

/**
 * The controller owns no logic *except the access check*, so what is worth
 * pinning is exactly those two things: each route reaches the matching service
 * method with the arguments it was given, and each route refuses a caller who
 * may not administer accounts.
 *
 * The second half is why every test here passes a caller. Feature 036 put
 * `assertAccountAdministrator` on all seven routes, and the refusal it produces
 * is the boundary that stops HR granting itself `ADMIN` — so "every route, not
 * most of them" is asserted below by enumerating them rather than by trusting a
 * reader to spot a missing line.
 */
describe('UserController', () => {
  const query = new UserQueryDto();
  const page = { items: [], meta: {} };
  const user = { id: 'usr-1' };

  const caller = (role: UserRole): CurrentUser => ({
    userId: 'usr-caller',
    employeeId: 'emp-caller',
    role,
    administrativeAccess: role !== UserRole.USER,
  });

  const ADMIN = caller(UserRole.ADMIN);

  let controller: UserController;
  let service: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    resendActivation: jest.Mock;
    activate: jest.Mock;
    deactivate: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue(page),
      findOne: jest.fn().mockResolvedValue(user),
      create: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(user),
      remove: jest.fn().mockResolvedValue(undefined),
      resendActivation: jest.fn().mockResolvedValue(undefined),
      activate: jest.fn().mockResolvedValue(user),
      deactivate: jest.fn().mockResolvedValue(user),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: service }],
    }).compile();

    controller = moduleRef.get(UserController);
  });

  describe('delegation', () => {
    it('passes the query straight through to the service', async () => {
      await expect(controller.findAll(ADMIN, query)).resolves.toBe(page);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });

    it('reads one user by id', async () => {
      await expect(controller.findOne(ADMIN, 'usr-1')).resolves.toBe(user);
      expect(service.findOne).toHaveBeenCalledWith('usr-1');
    });

    /** No password in the body: onboarding is an emailed link, not a secret. */
    it('creates from the validated body', async () => {
      const body = { email: 'ana.pop@example.com', role: UserRole.USER };

      await expect(controller.create(ADMIN, body)).resolves.toBe(user);
      expect(service.create).toHaveBeenCalledWith(body);
    });

    it('updates with both the id and the body', async () => {
      const body = { role: UserRole.HR };

      await expect(controller.update(ADMIN, 'usr-1', body)).resolves.toBe(user);
      expect(service.update).toHaveBeenCalledWith('usr-1', body);
    });

    it('resends an activation link by id', async () => {
      await expect(
        controller.resendActivation(ADMIN, 'usr-1'),
      ).resolves.toBeUndefined();
      expect(service.resendActivation).toHaveBeenCalledWith('usr-1');
    });

    it('activates and deactivates by id', async () => {
      await expect(controller.activate(ADMIN, 'usr-1')).resolves.toBe(user);
      await expect(controller.deactivate(ADMIN, 'usr-1')).resolves.toBe(user);

      expect(service.activate).toHaveBeenCalledWith('usr-1');
      expect(service.deactivate).toHaveBeenCalledWith('usr-1');
    });

    it('returns nothing from a delete, leaving the envelope to supply null', async () => {
      await expect(controller.remove(ADMIN, 'usr-1')).resolves.toBeUndefined();
      expect(service.remove).toHaveBeenCalledWith('usr-1');
    });
  });

  /**
   * The boundary, route by route.
   *
   * **HR is the case that matters.** It is on `ADMINISTRATIVE_ROLES`, so the
   * obvious wrong implementation — reaching for `isAdministrativeRole`, the
   * helper this project already had — would let HR through everywhere below and
   * therefore let HR set its own role to `ADMIN`. A `USER` is tested beside it
   * because it is the other caller who must never reach these routes.
   */
  describe('account administration is ADMIN and SUPERADMIN only', () => {
    /**
     * Each entry is `async` deliberately. `assertAccountAdministrator` throws
     * *synchronously* from a handler that is not itself `async`, so a plain
     * arrow would throw at the call site rather than return a rejected promise
     * — and `rejects.toBeInstanceOf` would never see it. Wrapping in `async`
     * turns the synchronous throw into the rejection these assertions read,
     * without changing what the controller does.
     */
    const routes: [string, (who: CurrentUser) => Promise<unknown>][] = [
      ['findAll', async (who) => controller.findAll(who, query)],
      ['findOne', async (who) => controller.findOne(who, 'usr-1')],
      [
        'create',
        async (who) =>
          controller.create(who, {
            email: 'new@example.com',
            role: UserRole.USER,
          }),
      ],
      [
        'update',
        async (who) =>
          controller.update(who, 'usr-1', { role: UserRole.ADMIN }),
      ],
      [
        'resendActivation',
        async (who) => controller.resendActivation(who, 'usr-1'),
      ],
      ['activate', async (who) => controller.activate(who, 'usr-1')],
      ['deactivate', async (who) => controller.deactivate(who, 'usr-1')],
      ['remove', async (who) => controller.remove(who, 'usr-1')],
    ];

    it.each(routes)('admits an ADMIN on %s', async (_name, call) => {
      await expect(call(caller(UserRole.ADMIN))).resolves.not.toThrow();
    });

    it.each(routes)('admits a SUPERADMIN on %s', async (_name, call) => {
      await expect(call(caller(UserRole.SUPERADMIN))).resolves.not.toThrow();
    });

    it.each(routes)('refuses HR on %s', async (_name, call) => {
      await expect(call(caller(UserRole.HR))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it.each(routes)(
      'refuses an ordinary employee on %s',
      async (_name, call) => {
        await expect(call(caller(UserRole.USER))).rejects.toBeInstanceOf(
          ForbiddenException,
        );
      },
    );

    /** Refused *before* the service is reached — nothing is read or written. */
    it('never reaches the service for a refused caller', () => {
      expect(() => controller.deactivate(caller(UserRole.HR), 'usr-1')).toThrow(
        ForbiddenException,
      );

      expect(service.deactivate).not.toHaveBeenCalled();
    });

    /** The code says "no such thing to grant", not "ask for this permission". */
    it('carries AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED', () => {
      expect(() => controller.findAll(caller(UserRole.HR), query)).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: 'AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED',
          }) as unknown,
        }) as unknown as Error,
      );
    });
  });
});
