import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useAuth } from '@/features/auth/useAuth';
import { useApiErrorMessage } from '@/i18n/useApiErrorMessage';
import { DEFAULT_COLOR_SCHEME, DEFAULT_CORNER_RADIUS } from '@/theme/theme';
import type { ThemePreferences } from '@/theme/theme-context';

import { updateMyProfile, type Profile, type ProfileUpdate } from './profile-api';
import { profileQueryOptions } from './profile-query';

/** The two fields the theme pickers write. */
export type ThemePreferencesUpdate = Pick<ProfileUpdate, 'colorScheme' | 'cornerRadius'>;

/** The one field the profile form writes. `null` clears the stored number. */
export type PhoneUpdate = Pick<ProfileUpdate, 'phone'>;

/**
 * The cache entry every hook in this file reads or writes.
 *
 * Derived in one place rather than restated per mutation: the key is scoped to
 * the account (see `profile-query.ts`), and a second hook spelling that out
 * would be the copy that forgets the scope when it changes.
 */
const useProfileQueryKey = () => {
  const { user } = useAuth();

  return profileQueryOptions(user?.id ?? '').queryKey;
};

/**
 * The signed-in person's profile.
 *
 * `undefined` for an anonymous session **without consulting the cache**, the
 * same guarantee `usePermissions` makes and for the same reason: a signed-out
 * tab cannot render somebody's name however the cache happens to be arranged.
 */
export const useProfile = (): Profile | undefined => {
  const { user, isAuthenticated } = useAuth();

  const { data } = useQuery({
    ...profileQueryOptions(user?.id ?? ''),
    enabled: isAuthenticated && user !== null,
  });

  return isAuthenticated ? data : undefined;
};

/**
 * The profile as a value that is always there — for a screen whose whole
 * subject it is.
 *
 * {@link useProfile} answers `Profile | undefined` because most of its callers
 * are shell components that must render for an anonymous session too: the header
 * falls back to the address, the theme falls back to the backend's column
 * defaults. A profile *page* has no such fallback — an undefined profile is not
 * a page with less on it, it is no page at all — so it reads the query the way
 * `CLAUDE.md` asks a screen to: `useSuspenseQuery`, suspending into a skeleton
 * shaped like what arrives, throwing to an error boundary when it fails.
 *
 * **It may only be called under `/app`.** `workspaceRoute`'s guard redirects an
 * anonymous visitor before any child renders, and awaits `loadProfile` before
 * the shell mounts — so by the time this runs there is a session and the answer
 * is already in the cache. It normally suspends for no time at all; the
 * boundary exists for the refetch after `staleTime` and for the failure.
 */
export const useSuspenseProfile = (): Profile => {
  const { user } = useAuth();
  const { data } = useSuspenseQuery(profileQueryOptions(user?.id ?? ''));

  return data;
};

/**
 * What to call somebody on screen.
 *
 * `username` is `string | null` in the contract — it is optional on an account
 * — so the address is the fallback rather than an empty header. It is also the
 * fallback for the moment before the profile has arrived, which in the
 * authenticated area is no moment at all: `workspaceRoute` awaits the profile
 * before the shell mounts, so the header never renders an address and then
 * swaps it for a name.
 */
export const useDisplayName = (): string => {
  const { user } = useAuth();
  const profile = useProfile();

  return profile?.account.username ?? user?.email ?? '';
};

/**
 * The palette and corner radius **as the server has them**, or the defaults.
 *
 * This is what makes a chosen theme survive a reload, and it is the read half
 * of a pair that is useless without the other: writing a preference nothing
 * reads back would save a choice that vanishes on refresh, which looks more
 * broken than not saving at all. {@link useUpdateThemePreferences} is the write
 * half.
 *
 * The defaults are the backend's own column defaults, so an anonymous visitor,
 * a brand-new account and a request still in flight all show the same thing.
 */
export const useStoredThemePreferences = (): ThemePreferences => {
  const profile = useProfile();

  return {
    colorScheme: profile?.account.colorScheme ?? DEFAULT_COLOR_SCHEME,
    cornerRadius: profile?.account.cornerRadius ?? DEFAULT_CORNER_RADIUS,
  };
};

/**
 * Changes the palette or the corner radius, on the server.
 *
 * ## Applying and persisting are one action, not two
 *
 * The theme is rendered from the cached profile, so the **optimistic cache
 * write is what applies the change** — there is no separate "apply now, save
 * later" path that could disagree with the server. The screen repaints on the
 * click and the request settles behind it.
 *
 * That also makes the failure case honest: if the `PATCH` is refused, the
 * rollback puts the previous palette back and says so. A fire-and-forget save
 * would leave somebody looking at a theme their account does not have, and they
 * would find out on the next device.
 *
 * `onSuccess` replaces the entry with the server's own response rather than
 * keeping the optimistic guess, because the endpoint answers the whole profile
 * — so the cache ends up holding what was actually stored, not what was asked
 * for.
 */
export const useUpdateThemePreferences = () => {
  const queryClient = useQueryClient();
  const describeError = useApiErrorMessage();
  const queryKey = useProfileQueryKey();

  return useMutation({
    mutationFn: (update: ThemePreferencesUpdate) => updateMyProfile(update),

    onMutate: async (update) => {
      /*
       * A refetch already in flight would land after this and overwrite the
       * optimistic value with the pre-change profile — a palette that flicks
       * back for a moment before the mutation answers.
       */
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<Profile>(queryKey);

      if (previous !== undefined) {
        queryClient.setQueryData<Profile>(queryKey, {
          ...previous,
          account: { ...previous.account, ...update },
        });
      }

      return { previous };
    },

    onError: (error, _update, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }

      // The backend's `errorCode`, translated — never its raw English message.
      toast.error(describeError(error));
    },

    onSuccess: (profile) => {
      queryClient.setQueryData(queryKey, profile);
    },
  });
};

/**
 * Changes the phone number, on the server.
 *
 * ## Not optimistic, unlike the theme — and the difference is the point
 *
 * {@link useUpdateThemePreferences} writes the cache before the request
 * settles because the cache *is* the rendering: a palette that waited for a
 * round trip would feel broken. A phone number renders nothing but itself, in
 * a field the person is still looking at, so there is nothing to gain by
 * showing it as saved before it is — and a rollback in a form field somebody
 * may have kept typing into is a worse experience than a short wait and an
 * honest answer.
 *
 * So this waits, then replaces the entry with the **server's own copy** of the
 * whole profile. The endpoint answers `ProfileEntity`, which is what makes that
 * possible: the cache ends up holding what was stored, trimmed and folded to
 * `null` exactly as the backend's `@IsEmployeePhone()` decided — not what was
 * typed.
 *
 * ## `phone` lives on the employment record, and that is observable
 *
 * The wire hides which of the two tables a field belongs to, with one exception
 * the caller can see: an account with **no employee** may set its preferences
 * and may not set a phone, and asking anyway is a `403` carrying
 * `AUTH_NO_EMPLOYEE_RECORD`. `ProfilePhoneForm` is therefore only rendered when
 * there is an employment record; the coded error is still translated here,
 * because a form that cannot normally produce an error is not the same as one
 * whose errors need not be readable.
 *
 * The success toast is this application's own sentence: the endpoint answers a
 * profile rather than a message, so there is no backend text to prefer over it.
 */
export const useUpdatePhone = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const describeError = useApiErrorMessage();
  const queryKey = useProfileQueryKey();

  return useMutation({
    mutationFn: (update: PhoneUpdate) => updateMyProfile(update),

    onSuccess: (profile) => {
      queryClient.setQueryData(queryKey, profile);
      toast.success(t('profile.phone.saved'));
    },

    onError: (error) => {
      // The backend's `errorCode`, translated — never its raw English message.
      toast.error(describeError(error));
    },
  });
};
