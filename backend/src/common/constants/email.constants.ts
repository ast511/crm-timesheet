/**
 * What the project considers an email address, size-wise, in one place.
 *
 * Separate from `pagination.constants.ts` and `relation.constants.ts` for the
 * reason those two are separate from each other: they answer different
 * questions — one bounds a *page*, one bounds an *id*, this one bounds an
 * *address* — and a DTO that accepts an address rarely also paginates.
 */

/**
 * Bound on any email address this API accepts.
 *
 * RFC 5321 caps a forward path at 254 characters, which is the longest address
 * that can actually be delivered to. Bounding it here keeps a megabyte of text
 * out of an indexed lookup, and it is a property of email itself rather than of
 * the resource holding one — which is why it lives here and not beside a
 * module's own lengths.
 */
export const EMAIL_MAX_LENGTH = 254;
