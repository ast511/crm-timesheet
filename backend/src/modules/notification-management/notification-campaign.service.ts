import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CURRENT_EMPLOYEE_HEADER } from '../../common/decorators/current-employee-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SortOrder } from '../../common/enums/sort-order.enum';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import {
  buildPaginatedResult,
  toSkipTake,
} from '../../common/utils/pagination.util';
import type { Prisma } from '../../generated/prisma/client';
import {
  CampaignRecipientType,
  NotificationCampaignStatus,
  NotificationPriority,
  NotificationType,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeeService } from '../employees/employee.service';
import { CreateNotificationCampaignDto } from './dto/create-notification-campaign.dto';
import { NotificationCampaignQueryDto } from './dto/notification-campaign-query.dto';
import { UpdateNotificationCampaignDto } from './dto/update-notification-campaign.dto';
import {
  CAMPAIGN_DETAIL_SELECT,
  CAMPAIGN_LIST_SELECT,
  NotificationCampaignEntity,
  NotificationCampaignSummaryEntity,
  toNotificationCampaignEntity,
  toNotificationCampaignSummaryEntity,
} from './entities/notification-campaign.entity';
import {
  CampaignSortField,
  EDITABLE_CAMPAIGN_STATUSES,
  SENDABLE_CAMPAIGN_STATUSES,
  UNDELETABLE_CAMPAIGN_STATUS,
} from './notification-management.constants';
import { assertDeliveryMethodChosen } from './notification-management.rules';

/**
 * Makes PostgreSQL fold the case of both operands, so `maintenance` finds
 * `Maintenance`.
 */
const CASE_INSENSITIVE = { mode: 'insensitive' } as const;

/** The stored columns a patch has to merge into before anything is judged. */
const CAMPAIGN_FACTS_SELECT = {
  id: true,
  status: true,
  scheduledAt: true,
  expiresAt: true,
  sendEmail: true,
  sendNotification: true,
} as const satisfies Prisma.NotificationCampaignSelect;

/** One audience entry, as it will be stored. */
interface RecipientRow {
  readonly recipientType: CampaignRecipientType;
  readonly employeeId: string | null;
}

/** The two dates, resolved and checked against each other. */
interface CampaignSchedule {
  readonly scheduledAt: Date | null;
  readonly expiresAt: Date | null;
}

/**
 * A campaign as the delivery engine needs it: what to say, how to say it, who to
 * say it to, and whether it may still be said.
 *
 * Deliberately not `NotificationCampaignEntity`. That resource is shaped for a
 * screen — ISO strings, an author resolved to a name, every recipient resolved to
 * a person — and the engine needs none of it: it needs the two dates as `Date`s
 * to compare against a clock, and the audience as ids to resolve into accounts
 * and addresses. Reusing the API entity would mean the engine parsing back the
 * strings this module had just formatted, and joining `employees` twice.
 *
 * `employeeIds` is empty for an `ALL_EMPLOYEES` campaign, which is the whole
 * point of Feature 027's single stored row: the audience is *resolved when the
 * campaign is sent*, so who "everybody" means is a question for the engine's
 * moment, not for the afternoon somebody typed the message.
 */
export interface CampaignDelivery {
  readonly id: string;
  readonly subject: string;
  readonly message: string;
  readonly severity: NotificationType;
  readonly priority: NotificationPriority;
  readonly sendEmail: boolean;
  readonly sendNotification: boolean;
  readonly status: NotificationCampaignStatus;
  readonly expiresAt: Date | null;
  readonly recipientType: CampaignRecipientType;
  readonly employeeIds: string[];
}

/** What the engine reads to execute a campaign. */
const CAMPAIGN_DELIVERY_SELECT = {
  id: true,
  subject: true,
  message: true,
  severity: true,
  priority: true,
  sendEmail: true,
  sendNotification: true,
  status: true,
  expiresAt: true,
  recipients: { select: { recipientType: true, employeeId: true } },
} as const satisfies Prisma.NotificationCampaignSelect;

/**
 * Every rule about notification campaigns lives here; the controller only
 * routes.
 *
 * **Nothing in this service sends anything.** Creating a campaign writes no
 * `Notification`, sends no email, opens no socket and schedules no job; it
 * stores an announcement, its audience and how it should eventually be
 * delivered. The Notification Delivery Engine is the feature that turns a stored
 * campaign into notifications people can read, and it is the only thing that
 * writes `status = SENT` and `sentAt`.
 *
 * Four decisions worth naming:
 *
 * 1. **`ALL_EMPLOYEES` stores one row.** Not one per employee — see
 *    {@link resolveRecipients}. The audience is resolved at send time, so
 *    somebody hired between composing and sending is included and somebody who
 *    left is not.
 * 2. **The status is derived, never chosen.** A campaign carrying a
 *    `scheduledAt` is `SCHEDULED`; one without is a `DRAFT`. `CANCELLED` is the
 *    one value a client writes directly, and `SENT` is the engine's alone. One
 *    fact, one column, no body that can claim to be scheduled with nothing to
 *    fire at.
 * 3. **The lifecycle gates are `409`s, not `403`s.** Refusing to edit a `SENT`
 *    campaign is a statement about the state of the resource, not about who is
 *    asking — the same call `LeaveRequestsService` makes for a request that has
 *    been decided.
 * 4. **Every rule about several fields at once is judged against the state a
 *    write would leave behind**, not against the fields the body happens to
 *    carry. `{ "sendEmail": false }` is a good body on one campaign and a fatal
 *    one on another, and only the merged pair can tell them apart.
 *
 * There is no repository, for the reason `ReminderService` has none: the queries
 * here share no predicate, so a layer between this and Prisma would be a file
 * that forwarded arguments.
 */
@Injectable()
export class NotificationCampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeeService,
  ) {}

  /**
   * One page of campaigns, narrowed by `search` and the five filters.
   *
   * The rows and the total are read in a single `$transaction` so both see the
   * same snapshot: run separately, a concurrent insert between them would
   * produce a `total` that does not describe the page just returned.
   *
   * The page carries `recipientType` and `recipientCount` rather than the
   * recipients themselves — see `CAMPAIGN_LIST_SELECT` for why a list does not
   * resolve up to two hundred names per row.
   */
  async findAll(
    query: NotificationCampaignQueryDto,
  ): Promise<PaginatedResult<NotificationCampaignSummaryEntity>> {
    const where = buildWhere(query);

    const [campaigns, total] = await this.prisma.$transaction([
      this.prisma.notificationCampaign.findMany({
        where,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        select: CAMPAIGN_LIST_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.notificationCampaign.count({ where }),
    ]);

    return buildPaginatedResult(
      campaigns.map(toNotificationCampaignSummaryEntity),
      total,
      query,
    );
  }

  /** One campaign, with every recipient resolved to a person. */
  async findOne(id: string): Promise<NotificationCampaignEntity> {
    const campaign = await this.prisma.notificationCampaign.findUnique({
      where: { id },
      select: CAMPAIGN_DETAIL_SELECT,
    });

    if (campaign === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    return toNotificationCampaignEntity(campaign);
  }

  /**
   * Composes a campaign. **It is not sent, and nothing is scheduled.**
   *
   * The checks run cheapest-first, which is also the order that produces the
   * most useful message: the two that need nothing but the body — a delivery
   * method, and an audience whose shape matches its type — before the dates, and
   * only then the two that need the database. A body that is wrong in three ways
   * is told about the first thing it can fix without a round trip.
   *
   * The recipients are written in the same statement as the campaign, so a
   * campaign never exists without the audience it was created with — the rule
   * "at least one recipient" would otherwise be true only until the second
   * insert failed.
   */
  async create(
    user: CurrentUser,
    dto: CreateNotificationCampaignDto,
  ): Promise<NotificationCampaignEntity> {
    const authorId = requireAuthor(user);

    assertDeliveryMethodChosen(dto.sendEmail, dto.sendNotification);

    const recipients = resolveRecipients(dto.recipientType, dto.employeeIds);
    const schedule = resolveSchedule(dto.scheduledAt, dto.expiresAt, {
      scheduledAt: null,
      expiresAt: null,
    });

    await this.assertAuthorExists(authorId);
    await this.assertRecipientsExist(recipients);

    const created = await this.prisma.notificationCampaign.create({
      data: {
        subject: dto.subject,
        message: dto.message,
        severity: dto.severity,
        priority: dto.priority,
        sendEmail: dto.sendEmail,
        sendNotification: dto.sendNotification,
        status: deriveStatus(schedule.scheduledAt),
        scheduledAt: schedule.scheduledAt,
        expiresAt: schedule.expiresAt,
        createdByEmployeeId: authorId,
        recipients: {
          create: recipients.map((recipient) => ({ ...recipient })),
        },
      },
      select: CAMPAIGN_DETAIL_SELECT,
    });

    return toNotificationCampaignEntity(created);
  }

  /**
   * Edits a campaign that has not gone out yet.
   *
   * Allowed only while the campaign is `DRAFT` or `SCHEDULED`. A `SENT` campaign
   * is read-only because its notifications are already in people's inboxes —
   * editing the stored announcement would leave it disagreeing with what was
   * actually delivered — and a `CANCELLED` one because cancelling is a decision
   * rather than a pause.
   *
   * Every rule is re-checked against the campaign the patch would *leave
   * behind*: the delivery pair is merged with the stored one, and the two dates
   * are compared as they will stand rather than as they arrived.
   *
   * The audience is replaced wholesale when `recipientType` is sent and left
   * alone when it is not. Deleting and re-creating the rows rather than diffing
   * them is deliberate: the set is at most a couple of hundred rows, the rule is
   * a statement about the whole set, and a diff would be three code paths where
   * this is one.
   */
  async update(
    id: string,
    dto: UpdateNotificationCampaignDto,
  ): Promise<NotificationCampaignEntity> {
    const current = await this.findFactsOrThrow(id);

    assertEditable(id, current.status);
    assertDeliveryMethodChosen(
      dto.sendEmail ?? current.sendEmail,
      dto.sendNotification ?? current.sendNotification,
    );

    const recipients = resolveUpdatedRecipients(dto);
    const schedule = resolveSchedule(dto.scheduledAt, dto.expiresAt, current);

    if (recipients !== null) {
      await this.assertRecipientsExist(recipients);
    }

    await this.prisma.$transaction(async (tx) => {
      if (recipients !== null) {
        await tx.notificationRecipient.deleteMany({
          where: { campaignId: id },
        });
        await tx.notificationRecipient.createMany({
          data: recipients.map((recipient) => ({
            ...recipient,
            campaignId: id,
          })),
        });
      }

      await tx.notificationCampaign.update({
        where: { id },
        // `undefined` is omitted from the UPDATE by Prisma, so an absent field
        // is left alone while an explicit `null` clears one of the two dates.
        data: {
          subject: dto.subject,
          message: dto.message,
          severity: dto.severity,
          priority: dto.priority,
          sendEmail: dto.sendEmail,
          sendNotification: dto.sendNotification,
          // Both dates are written from the resolved schedule rather than from
          // the DTO, so a `null` that clears one and an absent field that keeps
          // it are decided in one place.
          scheduledAt:
            dto.scheduledAt === undefined ? undefined : schedule.scheduledAt,
          expiresAt:
            dto.expiresAt === undefined ? undefined : schedule.expiresAt,
          status:
            dto.status === NotificationCampaignStatus.CANCELLED
              ? NotificationCampaignStatus.CANCELLED
              : deriveStatus(schedule.scheduledAt),
        },
      });
    });

    return this.findOne(id);
  }

  /**
   * Deletes a campaign that was never sent.
   *
   * A `SENT` campaign is a `409`: it is the record of an announcement people
   * have already received, and deleting it would remove the only explanation for
   * notifications still sitting in their inboxes. A cancelled one may go —
   * cancelling means it never went out.
   *
   * The recipients go with it, by the `ON DELETE CASCADE` on their foreign key.
   * An audience entry says nothing once the campaign it belongs to is gone —
   * the same argument `leave_request_replacements` makes.
   */
  async remove(id: string): Promise<void> {
    const current = await this.findFactsOrThrow(id);

    if (current.status === UNDELETABLE_CAMPAIGN_STATUS) {
      throw new ConflictException(
        `Campaign ${id} has already been sent and cannot be deleted`,
      );
    }

    await this.prisma.notificationCampaign.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // Read and written by the Notification Delivery Engine, and by nothing else.
  //
  // Feature 027 stated that the engine would reach these tables through this
  // service rather than by querying them, and wrote no method for it in advance.
  // These three are that method set, added by the caller that needed them.
  //
  // They are here rather than in the engine for the rule this project keeps
  // everywhere: the module that owns a table is the only one that touches it. It
  // is also what keeps the campaign lifecycle in one place — `markSent` is the
  // fourth gate beside `assertEditable` and `UNDELETABLE_CAMPAIGN_STATUS`, and a
  // status transition written outside the module that models the status would be
  // the one that eventually contradicted the other three.
  //
  // What is still *not* here: composing a message, resolving an audience,
  // sending, or deciding that it is time. Those are the engine's, and nothing in
  // this file has learned how to do them.
  // ---------------------------------------------------------------------------

  /**
   * One campaign, as the engine needs it, or `null` when there is no such
   * campaign.
   *
   * `null` rather than a `404`, unlike {@link findOne}: the engine calls this
   * both for a campaign somebody named in a URL — where absence is a `404` it
   * raises itself — and for one its own tick found a moment ago, where absence
   * means it was deleted in between and the tick should move on rather than fail.
   * Only the caller can tell those apart.
   */
  async findForDelivery(id: string): Promise<CampaignDelivery | null> {
    const campaign = await this.prisma.notificationCampaign.findUnique({
      where: { id },
      select: CAMPAIGN_DELIVERY_SELECT,
    });

    if (campaign === null) {
      return null;
    }

    const { recipients, ...rest } = campaign;

    return {
      ...rest,
      recipientType:
        recipients[0]?.recipientType ?? CampaignRecipientType.EMPLOYEE,
      employeeIds: recipients
        .map(({ employeeId }) => employeeId)
        .filter((employeeId): employeeId is string => employeeId !== null),
    };
  }

  /**
   * The campaigns whose moment has come: scheduled, and due.
   *
   * `WHERE status = 'scheduled' AND scheduled_at <= now()`, which is exactly the
   * `(status, scheduled_at)` index Feature 027 created for it — the selective
   * equality first, the range second.
   *
   * Ids rather than rows, because the engine claims each campaign before reading
   * it: a row read here and executed a second later could have been cancelled in
   * between, and acting on the copy would send an announcement somebody called
   * off. The claim in {@link markSent} is what settles that, and it needs only an
   * id.
   *
   * Oldest schedule first, so a backlog is worked through in the order it was
   * meant to go out. `limit` bounds one tick's work: a scheduler that woke to a
   * thousand overdue campaigns should send some of them now rather than hold one
   * transaction open until it has sent them all.
   */
  async findDue(now: Date, limit: number): Promise<string[]> {
    const campaigns = await this.prisma.notificationCampaign.findMany({
      where: {
        status: NotificationCampaignStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
      orderBy: [{ scheduledAt: SortOrder.ASC }, { id: SortOrder.ASC }],
      select: { id: true },
      take: limit,
    });

    return campaigns.map(({ id }) => id);
  }

  /**
   * Claims a campaign for delivery: `SENT`, with the moment it went.
   *
   * **The one write in this project that produces `SENT`**, and the answer to
   * "never send duplicate notifications". It is a conditional update — `SENT`
   * only *from* `DRAFT` or `SCHEDULED` — so the check and the write are one
   * statement and one row lock. Two overlapping scheduler ticks, a retried
   * request and a second application instance all resolve the same way: the first
   * updates one row and delivers, every other updates none and is told so.
   *
   * Reading the status and then writing it would leave exactly the window this
   * closes, and it is not a theoretical one — the manual endpoint and the
   * scheduler can address the same campaign at the same moment by design.
   *
   * `true` when this caller claimed it, `false` when somebody else already had
   * or the campaign is cancelled or gone. It does not say which, because the
   * caller has already read the campaign and can say something more useful than
   * this method could.
   */
  async markSent(id: string, sentAt: Date): Promise<boolean> {
    const sendable: readonly NotificationCampaignStatus[] =
      SENDABLE_CAMPAIGN_STATUSES;

    const { count } = await this.prisma.notificationCampaign.updateMany({
      where: { id, status: { in: [...sendable] } },
      data: { status: NotificationCampaignStatus.SENT, sentAt },
    });

    return count === 1;
  }

  /** Loads what a patch or a delete has to know, or reports the campaign missing. */
  private async findFactsOrThrow(id: string) {
    const campaign = await this.prisma.notificationCampaign.findUnique({
      where: { id },
      select: CAMPAIGN_FACTS_SELECT,
    });

    if (campaign === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    return campaign;
  }

  /**
   * Confirms whoever is composing exists.
   *
   * A `400` naming the header rather than a `404`, and the difference matters on
   * this route: a `404` on `POST /notification-campaigns` would be
   * indistinguishable from "no such collection", sending the caller to look at
   * the wrong thing. The same call `LeaveRequestsService.assertProcessorExists`
   * makes.
   *
   * The employee is read through `EmployeeService` rather than by querying
   * `employees` here, which is the rule every module in this project follows: the
   * module that owns a table is the only one that reads it.
   */
  private async assertAuthorExists(authorId: string): Promise<void> {
    const status = await this.employees.findStatus(authorId);

    if (status === null) {
      throw new BadRequestException([
        `${CURRENT_EMPLOYEE_HEADER} names employee ${authorId}, who does not exist`,
      ]);
    }
  }

  /**
   * Rejects an audience naming somebody who is not there.
   *
   * Every missing id is reported at once, as an array — the same shape the
   * `ValidationPipe` produces — so a form can mark each one instead of surfacing
   * the second problem only after the first is fixed. A `400` rather than a
   * `404`: the collection being addressed is fine, it is the submitted body that
   * names something absent.
   *
   * An `ALL_EMPLOYEES` campaign has nobody to check, and the guard is not merely
   * an optimisation: `findExistingIds([])` would be a query asking about no rows.
   */
  private async assertRecipientsExist(
    recipients: readonly RecipientRow[],
  ): Promise<void> {
    const employeeIds = recipients
      .map(({ employeeId }) => employeeId)
      .filter((employeeId): employeeId is string => employeeId !== null);

    if (employeeIds.length === 0) {
      return;
    }

    const known = new Set(await this.employees.findExistingIds(employeeIds));
    const problems = employeeIds
      .filter((employeeId) => !known.has(employeeId))
      .map((employeeId) => `Recipient employee ${employeeId} does not exist`);

    if (problems.length > 0) {
      throw new BadRequestException(problems);
    }
  }
}

/** Message used for every 404 path, so they cannot drift apart. */
function notFoundMessage(id: string): string {
  return `Notification campaign ${id} was not found`;
}

/**
 * The employee composing the campaign, or a `400` naming the header.
 *
 * `CurrentUser.employeeId` is nullable because not every account has an
 * employment record — a super-admin created to administer the system is the
 * obvious case — and `notification_campaigns.created_by_employee_id` is not.
 * Rather than making the column nullable to accommodate that account, the
 * request is refused: a campaign is something a person wrote, and an
 * announcement the company sent with nobody accountable for its wording is worse
 * than an administrator being asked to identify themselves.
 *
 * The message names `x-employee-id`, because that is the header a caller has to
 * add today. When authentication lands it becomes a claim on the token and this
 * function is the only place that changes.
 */
function requireAuthor(user: CurrentUser): string {
  if (user.employeeId === null) {
    throw new BadRequestException([
      `${CURRENT_EMPLOYEE_HEADER} header is required to compose a campaign: the account making the request has no employee record`,
    ]);
  }

  return user.employeeId;
}

/**
 * Turns a recipient type and a list of ids into the rows to store — the
 * `ALL_EMPLOYEES` optimisation, and the rule that makes it safe.
 *
 * `EMPLOYEE` writes **one row per id**: one for a campaign aimed at a single
 * person, N for one aimed at several. That is the whole difference between the
 * feature's "one employee" and "multiple employees" cases — they are the same
 * shape at different sizes, which is why there is no third recipient type.
 *
 * `ALL_EMPLOYEES` writes **exactly one row**, with a null `employeeId`, and
 * never one row per employee. Three reasons, and the third is the one that
 * matters most:
 *
 *  - a company of a thousand people would otherwise pay a thousand inserts to
 *    say one thing;
 *  - the audience is resolved when the campaign is *sent*, so somebody hired
 *    between composing and sending is included and somebody who left is not.
 *    Expanded now, the list would freeze the directory as it was on the
 *    afternoon somebody typed the message;
 *  - the stored rows say what the author *meant* — "everybody" — rather than the
 *    accident of who happened to be employed that day, which is what lets the
 *    campaign screen show "All employees" instead of a list of names nobody
 *    chose.
 *
 * The two shapes are exclusive, and the refusals matter as much as the
 * requirements. `ALL_EMPLOYEES` carrying `employeeIds` is not merely untidy: the
 * ids would be either stored — a campaign addressed to everybody *and* to three
 * people, which is the first list twice — or silently dropped, leaving the
 * caller believing they had narrowed an announcement that in fact went to the
 * whole company.
 */
function resolveRecipients(
  recipientType: CampaignRecipientType,
  employeeIds: string[] | undefined,
): RecipientRow[] {
  if (recipientType === CampaignRecipientType.ALL_EMPLOYEES) {
    if (employeeIds !== undefined) {
      throw new BadRequestException([
        `employeeIds must not be sent when recipientType is ${CampaignRecipientType.ALL_EMPLOYEES}: the audience is resolved when the campaign is sent`,
      ]);
    }

    return [
      {
        recipientType: CampaignRecipientType.ALL_EMPLOYEES,
        employeeId: null,
      },
    ];
  }

  if (employeeIds === undefined) {
    throw new BadRequestException([
      `employeeIds is required when recipientType is ${CampaignRecipientType.EMPLOYEE}`,
    ]);
  }

  return employeeIds.map((employeeId) => ({
    recipientType: CampaignRecipientType.EMPLOYEE,
    employeeId,
  }));
}

/**
 * The audience a patch would leave behind, or `null` when it leaves it alone.
 *
 * Sending `recipientType` replaces the whole set; omitting it keeps it.
 * `employeeIds` on its own is refused, because without a recipient type there is
 * no way to tell a corrected list of names from a switch to `ALL_EMPLOYEES` that
 * forgot to drop them — and guessing between those two is the difference between
 * an announcement to three people and one to the entire company.
 */
function resolveUpdatedRecipients(
  dto: UpdateNotificationCampaignDto,
): RecipientRow[] | null {
  if (dto.recipientType === undefined) {
    if (dto.employeeIds !== undefined) {
      throw new BadRequestException([
        'employeeIds must be sent with recipientType: the audience is replaced as a whole',
      ]);
    }

    return null;
  }

  return resolveRecipients(dto.recipientType, dto.employeeIds);
}

/**
 * The two dates a write would leave behind, checked against each other and
 * against the clock.
 *
 * `undefined` keeps what is stored, `null` clears it, and a string replaces it —
 * the three cases a `PATCH` over a nullable column has to tell apart. On a
 * create, the stored pair is two nulls, so the same function serves both.
 *
 * Two rules, and they are checked against deliberately different things:
 *
 * 1. **A supplied `scheduledAt` must be in the future**, judged against the
 *    server's clock rather than the client's — a client's clock is not a fact
 *    about when something will happen here. A *stored* schedule is never
 *    re-judged: a campaign scheduled for last Tuesday that the engine has not yet
 *    reached is late, not invalid, and refusing to fix a typo in its wording for
 *    that reason would punish the caller for time passing.
 * 2. **`expiresAt` must be later than `scheduledAt`**, judged on the merged
 *    pair, because moving either end can break the order. When there is no
 *    schedule the expiry is compared against now instead: a draft that has
 *    already expired can never be sent usefully, and silently accepting one
 *    would store an announcement guaranteed to be stale.
 *
 * Both problems are reported at once, as an array, so a form marks both inputs.
 */
function resolveSchedule(
  scheduledAt: string | null | undefined,
  expiresAt: string | null | undefined,
  current: { scheduledAt: Date | null; expiresAt: Date | null },
): CampaignSchedule {
  const now = new Date();
  const resolved: CampaignSchedule = {
    scheduledAt: mergeDate(scheduledAt, current.scheduledAt),
    expiresAt: mergeDate(expiresAt, current.expiresAt),
  };

  const problems: string[] = [];

  if (
    isSupplied(scheduledAt) &&
    resolved.scheduledAt !== null &&
    resolved.scheduledAt <= now
  ) {
    problems.push('scheduledAt must be in the future');
  }

  if (resolved.expiresAt !== null) {
    if (resolved.scheduledAt !== null) {
      if (resolved.expiresAt <= resolved.scheduledAt) {
        problems.push('expiresAt must be later than scheduledAt');
      }
    } else if (resolved.expiresAt <= now) {
      problems.push(
        'expiresAt must be in the future when the campaign has no scheduledAt',
      );
    }
  }

  if (problems.length > 0) {
    throw new BadRequestException(problems);
  }

  return resolved;
}

/** `undefined` keeps the stored value, `null` clears it, a string replaces it. */
function mergeDate(
  supplied: string | null | undefined,
  stored: Date | null,
): Date | null {
  if (supplied === undefined) {
    return stored;
  }

  return supplied === null ? null : new Date(supplied);
}

function isSupplied(value: string | null | undefined): boolean {
  return value !== undefined && value !== null;
}

/**
 * Where a campaign stands, read off its schedule.
 *
 * The derivation the whole lifecycle rests on: carrying a `scheduledAt` means
 * `SCHEDULED`, not carrying one means `DRAFT`. Written once, and applied by both
 * `create` and `update`, so clearing a schedule returns a campaign to `DRAFT` by
 * the same rule that made it `SCHEDULED` in the first place — the two can never
 * disagree.
 *
 * `SENT` is not produced here and `CANCELLED` is applied by the caller when the
 * body asks for it, because neither is a fact about the schedule.
 */
function deriveStatus(scheduledAt: Date | null): NotificationCampaignStatus {
  return scheduledAt === null
    ? NotificationCampaignStatus.DRAFT
    : NotificationCampaignStatus.SCHEDULED;
}

/**
 * Refuses an edit to a campaign that has been sent or called off.
 *
 * A `409` naming the status rather than a `403`: this is a statement about the
 * state of the resource, not about who is asking. The message says what the
 * campaign is, because "cannot be edited" without the reason sends an
 * administrator looking for a permission problem that does not exist.
 */
function assertEditable(id: string, status: NotificationCampaignStatus): void {
  const editable: readonly NotificationCampaignStatus[] =
    EDITABLE_CAMPAIGN_STATUSES;

  if (!editable.includes(status)) {
    throw new ConflictException(
      `Campaign ${id} is ${status} and can no longer be edited; only ${editable.join(' and ')} campaigns may be changed`,
    );
  }
}

/**
 * Builds the `WHERE` for the list endpoint.
 *
 * The parameters are independent and combine with `AND`. Returns `undefined` —
 * not an empty object — when nothing was requested, because `undefined` is what
 * `findMany` and `count` both read as "no filter", and the two must agree or the
 * total would not describe the page.
 */
function buildWhere({
  search,
  status,
  severity,
  priority,
  sendEmail,
  sendNotification,
}: NotificationCampaignQueryDto):
  Prisma.NotificationCampaignWhereInput | undefined {
  const filters: Prisma.NotificationCampaignWhereInput[] = [];

  if (search !== undefined && search.length > 0) {
    filters.push({
      OR: [
        { subject: { contains: search, ...CASE_INSENSITIVE } },
        { message: { contains: search, ...CASE_INSENSITIVE } },
      ],
    });
  }

  if (status !== undefined) {
    filters.push({ status });
  }

  if (severity !== undefined) {
    filters.push({ severity });
  }

  if (priority !== undefined) {
    filters.push({ priority });
  }

  if (sendEmail !== undefined) {
    filters.push({ sendEmail });
  }

  if (sendNotification !== undefined) {
    filters.push({ sendNotification });
  }

  return filters.length === 0 ? undefined : { AND: filters };
}

/**
 * Orders by the requested column, then by `id`.
 *
 * The tie-break is what makes pagination safe: none of the four sortable values
 * is unique — `scheduledAt` is null on every draft — so without it a record
 * could repeat on one page and vanish from the next.
 */
function buildOrderBy(
  sortBy: CampaignSortField,
  sortOrder: SortOrder,
): Prisma.NotificationCampaignOrderByWithRelationInput[] {
  return [{ [sortBy]: sortOrder }, { id: SortOrder.ASC }];
}
