import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/features/auth/useAuth';
import { useApiErrorMessage } from '@/i18n/useApiErrorMessage';
import { DEFAULT_COLOR_SCHEME, DEFAULT_CORNER_RADIUS } from '@/theme/theme';
import type { ThemePreferences } from '@/theme/theme-context';

import { updateMyProfile, type Profile, type ProfileUpdate } from './profile-api';
import { profileQueryOptions } from './profile-query';

/** The two fields this feature writes. `phone` belongs to a profile screen. */
export type ThemePreferencesUpdate = Pick<ProfileUpdate, 'colorScheme' | 'cornerRadius'>;

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
  const { user } = useAuth();
  const describeError = useApiErrorMessage();

  const queryKey = profileQueryOptions(user?.id ?? '').queryKey;

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
