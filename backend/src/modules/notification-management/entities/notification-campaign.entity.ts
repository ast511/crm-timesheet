import {
  toIsoTimestamp,
  toNullableIsoTimestamp,
} from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import { CampaignRecipientType } from '../../../generated/prisma/enums';
import type {
  NotificationCampaignStatus,
  NotificationPriority,
  NotificationType,
} from '../../../generated/prisma/enums';
import type {
  EmployeeModel,
  NotificationCampaignModel,
} from '../../../generated/prisma/models';

/**
 * A person, as a campaign names one — its author, or one of its recipients.
 *
 * Declared as a `Pick` of the owning module's row rather than as a free-standing
 * interface, so renaming a column in `schema.prisma` breaks the build here
 * instead of producing a nested object with a field that no longer exists.
 *
 * The same shape serves both roles, because a screen renders them identically: a
 * name and the code beside it. It is deliberately a second declaration rather
 * than an import of `LeaveRequestEmployeeSummary` — the two coincide today by
 * taste rather than by a rule either module owns, and a campaign's audience
 * should be free to publish something a leave request does not without one
 * feature editing the other's payload.
 */
export type CampaignEmployeeSummary = Pick<
  EmployeeModel,
  'id' | 'employeeCode' | 'firstName' | 'lastName'
>;

/**
 * One audience entry, as the single-campaign endpoints expose it.
 *
 * `employee` is null on the `ALL_EMPLOYEES` entry, and that null is the whole
 * point: the campaign is addressed to everybody *at the moment it is sent*, so
 * there is no list of people to publish and inventing one would answer a
 * question the campaign did not ask. A client renders "All employees" from
 * `recipientType` rather than from a count.
 */
export interface NotificationRecipientEntity {
  id: string;
  recipientType: CampaignRecipientType;
  /** The person addressed, or null on the `ALL_EMPLOYEES` entry. */
  employee: CampaignEmployeeSummary | null;
}

/**
 * A campaign as the **list** exposes it: everything about the announcement, and
 * the shape of its audience rather than the audience itself.
 *
 * `recipientType` and `recipientCount` are derived from the recipient rows, not
 * stored: a campaign holds either one `ALL_EMPLOYEES` entry or N `EMPLOYEE`
 * entries, so the first entry's type describes the whole set.
 *
 * The list stops there on purpose. Resolving every recipient to a name would
 * join `employees` up to `CAMPAIGN_MAX_RECIPIENTS` times per row, and a page of
 * 100 campaigns would carry twenty thousand nested objects to render a column
 * that says "3 recipients". The single read is where the names belong, because
 * that is the screen that shows them.
 */
export interface NotificationCampaignSummaryEntity {
  id: string;
  subject: string;
  message: string;
  severity: NotificationType;
  priority: NotificationPriority;
  sendEmail: boolean;
  sendNotification: boolean;
  status: NotificationCampaignStatus;
  /** When the engine should send it, or null on a draft. */
  scheduledAt: string | null;
  /** When it stops being worth showing, or null. */
  expiresAt: string | null;
  /** When the engine sent it. **Always null in this feature** — nothing sends. */
  sentAt: string | null;
  createdBy: CampaignEmployeeSummary;
  /** How the audience was named: one person, several, or everybody. */
  recipientType: CampaignRecipientType;
  /**
   * How many `notification_recipients` rows the campaign holds.
   *
   * **`1` for `ALL_EMPLOYEES`**, which is the stored row count rather than the
   * size of the audience — the audience is resolved when the campaign is sent,
   * and nothing here knows how many people will be employed by then. A client
   * shows a number for `EMPLOYEE` and the words "All employees" for the other.
   */
  recipientCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * The same campaign as the **single-campaign** endpoints expose it: everything
 * above, plus who it is actually for.
 *
 * An intersection rather than a second declaration, so the shared fields are
 * written once and the two payloads cannot drift into disagreeing about what a
 * campaign is — the same call `LeaveRequestEntity` makes over
 * `MyLeaveRequestEntity`.
 */
export type NotificationCampaignEntity = NotificationCampaignSummaryEntity & {
  /** At least one entry, always — the API refuses a campaign addressed to nobody. */
  recipients: NotificationRecipientEntity[];
};

const EMPLOYEE_SUMMARY_SELECT = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
} as const satisfies Prisma.EmployeeSelect;

/**
 * The campaign's own columns, plus its author.
 *
 * A `select` rather than an `include`, and here that choice does real work: this
 * row joins to `employees`, which itself joins to `users` — `include` would
 * return every column of each, putting `User.passwordHash` one careless nesting
 * away from an announcements screen, and would keep publishing every column
 * added to those tables later.
 */
const CAMPAIGN_BASE_SELECT = {
  id: true,
  subject: true,
  message: true,
  severity: true,
  priority: true,
  sendEmail: true,
  sendNotification: true,
  status: true,
  scheduledAt: true,
  expiresAt: true,
  sentAt: true,
  createdBy: { select: EMPLOYEE_SUMMARY_SELECT },
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.NotificationCampaignSelect;

/**
 * What the list reads: the campaign, and one enum per recipient row.
 *
 * The recipients are selected — rather than counted with `_count` — because two
 * facts are needed and only one of them is a count: how many entries there are,
 * and whether they are `EMPLOYEE` or `ALL_EMPLOYEES`. A `_count` would answer
 * the first and leave the second needing a second query or a `take: 1` whose
 * ordering would have to be reasoned about. One enum per row is a few bytes and
 * no join.
 */
export const CAMPAIGN_LIST_SELECT = {
  ...CAMPAIGN_BASE_SELECT,
  recipients: { select: { recipientType: true } },
} as const satisfies Prisma.NotificationCampaignSelect;

/**
 * What a single campaign reads: the same, with every recipient resolved to a
 * person.
 *
 * Ordered by surname then given name, so a campaign renders its audience the
 * same way on every request rather than in whatever order the rows happened to
 * be inserted. The `ALL_EMPLOYEES` entry has no employee to order by and is the
 * only row on such a campaign, so the ordering never has to choose between them.
 */
export const CAMPAIGN_DETAIL_SELECT = {
  ...CAMPAIGN_BASE_SELECT,
  recipients: {
    orderBy: [
      { employee: { lastName: 'asc' } },
      { employee: { firstName: 'asc' } },
    ],
    select: {
      id: true,
      recipientType: true,
      employee: { select: EMPLOYEE_SUMMARY_SELECT },
    },
  },
} as const satisfies Prisma.NotificationCampaignSelect;

/** The campaign's own columns, as both selects read them. */
type CampaignBaseRow = Pick<
  NotificationCampaignModel,
  | 'id'
  | 'subject'
  | 'message'
  | 'severity'
  | 'priority'
  | 'sendEmail'
  | 'sendNotification'
  | 'status'
  | 'scheduledAt'
  | 'expiresAt'
  | 'sentAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  createdBy: CampaignEmployeeSummary;
};

/**
 * A row read through {@link CAMPAIGN_LIST_SELECT}.
 *
 * Spelled as a `Pick` of the scalars plus the nested shapes, so a `select` left
 * off a query produces a row the mapper will not accept — the same compile-time
 * trip-wire every module here uses.
 */
export type NotificationCampaignListRow = CampaignBaseRow & {
  recipients: { recipientType: CampaignRecipientType }[];
};

/** A row read through {@link CAMPAIGN_DETAIL_SELECT}. */
export type NotificationCampaignDetailRow = CampaignBaseRow & {
  recipients: {
    id: string;
    recipientType: CampaignRecipientType;
    employee: CampaignEmployeeSummary | null;
  }[];
};

/** Maps a row onto the resource the list returns. */
export function toNotificationCampaignSummaryEntity(
  campaign: NotificationCampaignListRow,
): NotificationCampaignSummaryEntity {
  return {
    ...toCampaignBase(campaign),
    recipientType: describeRecipientType(campaign.recipients),
    recipientCount: campaign.recipients.length,
  };
}

/** Maps a row onto the resource the single-campaign endpoints return. */
export function toNotificationCampaignEntity(
  campaign: NotificationCampaignDetailRow,
): NotificationCampaignEntity {
  return {
    ...toCampaignBase(campaign),
    recipientType: describeRecipientType(campaign.recipients),
    recipientCount: campaign.recipients.length,
    recipients: campaign.recipients.map((recipient) => ({
      id: recipient.id,
      recipientType: recipient.recipientType,
      employee:
        recipient.employee === null
          ? null
          : toEmployeeSummary(recipient.employee),
    })),
  };
}

/** The fields both payloads share, mapped once. */
function toCampaignBase(
  campaign: CampaignBaseRow,
): Omit<NotificationCampaignSummaryEntity, 'recipientType' | 'recipientCount'> {
  return {
    id: campaign.id,
    subject: campaign.subject,
    message: campaign.message,
    severity: campaign.severity,
    priority: campaign.priority,
    sendEmail: campaign.sendEmail,
    sendNotification: campaign.sendNotification,
    status: campaign.status,
    scheduledAt: toNullableIsoTimestamp(campaign.scheduledAt),
    expiresAt: toNullableIsoTimestamp(campaign.expiresAt),
    sentAt: toNullableIsoTimestamp(campaign.sentAt),
    createdBy: toEmployeeSummary(campaign.createdBy),
    createdAt: toIsoTimestamp(campaign.createdAt),
    updatedAt: toIsoTimestamp(campaign.updatedAt),
  };
}

/**
 * How the audience was named, read off the stored rows.
 *
 * The first entry decides, because the two shapes are exclusive: a campaign
 * holds either one `ALL_EMPLOYEES` entry or N `EMPLOYEE` entries, which
 * `NotificationCampaignService` enforces on every write. Reading the first row
 * rather than scanning for an `ALL_EMPLOYEES` one keeps the mapper stating the
 * same rule the writer does instead of quietly tolerating a mixture.
 *
 * A campaign with no recipients cannot be created, so the fallback is
 * unreachable through this API; it is `EMPLOYEE` rather than a throw because a
 * mapper is the wrong place to discover a broken row, and "addressed to nobody"
 * is what such a campaign would in fact be.
 */
function describeRecipientType(
  recipients: readonly { recipientType: CampaignRecipientType }[],
): CampaignRecipientType {
  return recipients[0]?.recipientType ?? CampaignRecipientType.EMPLOYEE;
}

function toEmployeeSummary(
  employee: CampaignEmployeeSummary,
): CampaignEmployeeSummary {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
  };
}
