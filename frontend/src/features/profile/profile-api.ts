import { apiGet, apiPatch } from '@/api/client';
import type { components } from '@/api/generated/openapi';

/** The whole payload: the account, plus the employment record or `null`. */
export type Profile = components['schemas']['ProfileEntity'];

/** The account half — the address, the username, and the two UI preferences. */
export type ProfileAccount = components['schemas']['ProfileAccount'];

/** What `PATCH` accepts: a phone, a palette, a corner radius. Nothing else. */
export type ProfileUpdate = components['schemas']['UpdateProfileDto'];

/**
 * The signed-in person's own profile.
 *
 * **There is no `/profile/:id`.** The backend says so explicitly and gives the
 * reason: a route that cannot name another person needs no ownership check, and
 * this one has none because there is nothing to check. Somebody else's account
 * is `GET /users/:id`, which is gated.
 *
 * It is also the **only** place the UI preferences are published.
 * `GET /auth/me` deliberately does not carry `colorScheme` or `cornerRadius`,
 * because the query behind it runs on every authenticated request and nothing
 * authorises on a colour — which is why the theme needs a second call rather
 * than riding along with the session.
 */
export const fetchMyProfile = (): Promise<Profile> => apiGet('/api/v1/profile/me');

/**
 * Change the phone, the palette or the corner radius.
 *
 * The body is whitelisted with `forbidNonWhitelisted`, so a `role` or an
 * `email` in the payload is a `400` naming the offending property rather than a
 * value quietly dropped. That is what makes "a person cannot smuggle a
 * promotion into a profile update" a property of the endpoint rather than of
 * this client.
 *
 * It answers the **whole** profile, which is what lets the mutation replace the
 * cached entry with the server's own copy instead of trusting its optimistic
 * guess.
 */
export const updateMyProfile = (body: ProfileUpdate): Promise<Profile> =>
  apiPatch('/api/v1/profile/me', { body });
