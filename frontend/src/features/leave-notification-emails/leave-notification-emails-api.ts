import { apiDelete, apiGet, apiPatch, apiPost, type PaginatedResult } from '@/api/client';
import type { components, operations } from '@/api/generated/openapi';

/**
 * `/api/v1/leave-notification-emails` — the addresses leave requests are sent
 * to for approval.
 *
 * **A top-level collection, not a sub-resource of a leave type.** The backend
 * states the reason in its controller: there is no leave-configuration row for
 * these to hang off, because this list *is* the configuration. So the calls
 * below take no scope, and the section that renders them sits beside the
 * leave-types table rather than inside it.
 *
 * Every type here comes from the generated contract:
 * `LeaveNotificationEmailEntity` is what a row is, `Create…Dto` and `Update…Dto`
 * are what the two writes accept — one field, `email`, and the global
 * `ValidationPipe` runs with `forbidNonWhitelisted`, so anything else in the
 * body is a `400` rather than a property quietly ignored.
 */

/** One configured address, exactly as the API returns it. */
export type LeaveNotificationEmail = components['schemas']['LeaveNotificationEmailEntity'];

/** The body of `POST /leave-notification-emails`. `{ email }` and nothing else. */
export type CreateLeaveNotificationEmail =
  components['schemas']['CreateLeaveNotificationEmailDto'];

/** The body of `PATCH /leave-notification-emails/{id}`. The one field, optional. */
export type UpdateLeaveNotificationEmail =
  components['schemas']['UpdateLeaveNotificationEmailDto'];

/** Everything `GET /leave-notification-emails` accepts, from the operation itself. */
export type LeaveNotificationEmailsQuery =
  operations['LeaveNotificationEmailsController_findAll_v1']['parameters']['query'];

/**
 * The columns the backend will order by — `email` and `createdAt`, read off the
 * operation rather than listed by hand.
 */
export type LeaveNotificationEmailSortKey = LeaveNotificationEmailsQuery['sortBy'];

/**
 * `email` ascending — the backend's own default, restated here because the
 * generated query type marks `sortBy` required and a client that omits it would
 * not compile.
 *
 * It is also the right order for this list: the column is unique, so the
 * ordering is total and no address can shift between two pages of one listing,
 * and a handful of addresses is something a person reads alphabetically rather
 * than in the order somebody happened to add them.
 */
export const DEFAULT_LEAVE_NOTIFICATION_EMAIL_SORT: LeaveNotificationEmailSortKey = 'email';

/**
 * Ten a page.
 *
 * Smaller than the shared `DEFAULT_PAGE_SIZE` of twenty on purpose: this is a
 * section on somebody else's page, under a table, and a company notifies a
 * handful of addresses rather than a screenful. Ten keeps the section short
 * enough that the leave-types table above it stays the page, while the pager —
 * which only appears when there is a second page — keeps the rest reachable.
 */
export const LEAVE_NOTIFICATION_EMAILS_PAGE_SIZE = 10;

/**
 * The query for one page.
 *
 * There is no search term and no filter, which is a decision rather than an
 * omission: the resource has exactly one field beyond its timestamps, the list
 * is alphabetical, and a search box over five addresses is a control that saves
 * nobody a scroll. `?search=` exists on the endpoint and is one argument away
 * if the list ever grows.
 */
export const toLeaveNotificationEmailsQuery = (page: number): LeaveNotificationEmailsQuery => ({
  page,
  limit: LEAVE_NOTIFICATION_EMAILS_PAGE_SIZE,
  sortBy: DEFAULT_LEAVE_NOTIFICATION_EMAIL_SORT,
  sortOrder: 'asc',
});

/** One page of addresses. */
export const fetchLeaveNotificationEmails = (
  query: LeaveNotificationEmailsQuery,
  signal?: AbortSignal,
): Promise<PaginatedResult<LeaveNotificationEmail>> =>
  apiGet('/api/v1/leave-notification-emails', { query, signal });

/**
 * Answers `201` with the stored row — trimmed and lower-cased, as the DTO
 * decided. A `409` means the address is already on the list.
 */
export const createLeaveNotificationEmail = (
  body: CreateLeaveNotificationEmail,
): Promise<LeaveNotificationEmail> => apiPost('/api/v1/leave-notification-emails', { body });

/**
 * Corrects an address in place.
 *
 * The endpoint exists so a typo can be fixed without changing the row's id or
 * losing `createdAt` — the record of when the company started notifying that
 * mailbox — which deleting and re-adding would both do.
 */
export const updateLeaveNotificationEmail = (
  id: string,
  body: UpdateLeaveNotificationEmail,
): Promise<LeaveNotificationEmail> =>
  apiPatch('/api/v1/leave-notification-emails/{id}', { path: { id }, body });

/**
 * Removes one address. A hard delete, and nothing refuses it: an address here
 * is a routing rule rather than a record of anything that happened, so no other
 * row references it and there is no in-use `409` to handle.
 *
 * The endpoint answers `200` with `data: null` rather than `204`, so the client
 * reads the same envelope it reads everywhere else.
 */
export const deleteLeaveNotificationEmail = (id: string) =>
  apiDelete('/api/v1/leave-notification-emails/{id}', { path: { id } });
