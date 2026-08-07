import { Test, TestingModule } from '@nestjs/testing';

import {
  NotificationCategory,
  NotificationType,
} from '../../generated/prisma/enums';
import { EventAudienceKind } from '../notification-delivery/notification-delivery.repository';
import { NotificationDispatcher } from '../notification-delivery/notification-dispatcher.service';
import {
  TIMESHEET_EVENTS,
  TimesheetNotificationService,
  TimesheetSubject,
} from './timesheet-notification.service';

const SUBJECT: TimesheetSubject = {
  employeeId: 'emp-1',
  employeeCode: 'EMP-0001',
  firstName: 'Ion',
  lastName: 'Popescu',
  month: 9,
  year: 2026,
};

describe('TimesheetNotificationService', () => {
  let service: TimesheetNotificationService;
  let dispatcher: { executeEvent: jest.Mock };

  /** The event the last announcement handed to the delivery engine. */
  const announced = () =>
    dispatcher.executeEvent.mock.calls.at(-1)?.[0] as {
      key: string;
      subject: string;
      message: string;
      category: NotificationCategory;
      severity: NotificationType;
      sendEmail: boolean;
      sendNotification: boolean;
      audience: { kind: EventAudienceKind; employeeId?: string };
    };

  beforeEach(async () => {
    dispatcher = { executeEvent: jest.fn().mockResolvedValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TimesheetNotificationService,
        { provide: NotificationDispatcher, useValue: dispatcher },
      ],
    }).compile();

    service = moduleRef.get(TimesheetNotificationService);
  });

  /**
   * The rule every payload obeys: a recipient with several months in flight has
   * to be able to tell from the message alone which one changed.
   */
  describe('every announcement identifies which timesheet it is about', () => {
    it('names the period on a submission, with whose month it is', async () => {
      await service.announceSubmitted(SUBJECT);

      expect(announced().subject).toContain('September 2026');
      expect(announced().subject).toContain('EMP-0001');
      expect(announced().message).toContain('Popescu Ion');
    });

    it('names the period on an approval', async () => {
      await service.announceApproved(SUBJECT);

      expect(announced().subject).toContain('September 2026');
    });

    it('names the period and the reason on a rejection', async () => {
      await service.announceRejected(SUBJECT, 'The 14th is missing.');

      expect(announced().subject).toContain('September 2026');
      expect(announced().message).toContain('The 14th is missing.');
    });

    it('names the period and what changed on a staleness notice', async () => {
      await service.announceStale(SUBJECT, 'an approved leave request');

      expect(announced().subject).toContain('September 2026');
      // Capitalised because it opens the sentence, which is the one thing the
      // wording does to the reason it is given.
      expect(announced().message).toContain(
        'An approved leave request changed',
      );
    });
  });

  describe('who each event is addressed to', () => {
    // One piece of work that one administrator picks up. Three personal copies
    // would leave two of them chasing a month a colleague already approved.
    it('sends a submission to the administrative workspace, not to a list of people', async () => {
      await service.announceSubmitted(SUBJECT);

      expect(announced().audience).toEqual({
        kind: EventAudienceKind.Administrative,
      });
    });

    it('sends an approval to the owner', async () => {
      await service.announceApproved(SUBJECT);

      expect(announced().audience).toEqual({
        kind: EventAudienceKind.Employee,
        employeeId: 'emp-1',
      });
    });

    it('sends a rejection to the owner', async () => {
      await service.announceRejected(SUBJECT, 'Incomplete.');

      expect(announced().audience).toEqual({
        kind: EventAudienceKind.Employee,
        employeeId: 'emp-1',
      });
    });

    it('sends a staleness notice to the owner', async () => {
      await service.announceStale(SUBJECT, 'the work schedule');

      expect(announced().audience).toEqual({
        kind: EventAudienceKind.Employee,
        employeeId: 'emp-1',
      });
    });
  });

  describe('how each event is drawn', () => {
    it('files every timesheet event under the TIMESHEET category', async () => {
      await service.announceApproved(SUBJECT);

      expect(announced().category).toBe(NotificationCategory.TIMESHEET);
    });

    it('draws an approval as a success and a rejection as an error', async () => {
      await service.announceApproved(SUBJECT);
      expect(announced().severity).toBe(NotificationType.SUCCESS);

      await service.announceRejected(SUBJECT, 'Incomplete.');
      expect(announced().severity).toBe(NotificationType.ERROR);
    });

    // Staleness is advisory and can be raised by an unrelated correction; a mail
    // for each would train people to ignore the ones that matter.
    it('sends no email for a staleness notice', async () => {
      await service.announceStale(SUBJECT, 'a public holiday');

      expect(announced().sendEmail).toBe(false);
      expect(announced().sendNotification).toBe(true);
    });

    it('emails the three events that ask somebody to act', async () => {
      for (const announce of [
        () => service.announceSubmitted(SUBJECT),
        () => service.announceApproved(SUBJECT),
        () => service.announceRejected(SUBJECT, 'Incomplete.'),
      ]) {
        await announce();

        expect(announced().sendEmail).toBe(true);
      }
    });

    it('names each event with the key a log and a template quote', async () => {
      await service.announceSubmitted(SUBJECT);
      expect(announced().key).toBe(TIMESHEET_EVENTS.submitted);

      await service.announceStale(SUBJECT, 'the work schedule');
      expect(announced().key).toBe(TIMESHEET_EVENTS.stale);
    });
  });

  /**
   * The property the whole lifecycle depends on. An approval that succeeded and
   * then returned a 500 because a mail server was down would be the worst of
   * both: the month is approved, the client believes it is not, and the retry
   * meets an immutable timesheet.
   */
  describe('an announcement never fails the thing it announces', () => {
    it('swallows a delivery failure', async () => {
      dispatcher.executeEvent.mockRejectedValue(new Error('SMTP is down'));

      await expect(service.announceApproved(SUBJECT)).resolves.toBeUndefined();
    });

    it('swallows it for every event, not only the approval', async () => {
      dispatcher.executeEvent.mockRejectedValue(new Error('socket closed'));

      await expect(
        Promise.all([
          service.announceSubmitted(SUBJECT),
          service.announceRejected(SUBJECT, 'Incomplete.'),
          service.announceStale(SUBJECT, 'the work schedule'),
        ]),
      ).resolves.toHaveLength(3);
    });
  });

  // Nothing here writes a notification, opens a socket or sends mail: the
  // dispatcher is the one way anything is delivered.
  it('reaches the delivery engine and nothing else', async () => {
    await service.announceApproved(SUBJECT);

    expect(dispatcher.executeEvent).toHaveBeenCalledTimes(1);
  });
});
