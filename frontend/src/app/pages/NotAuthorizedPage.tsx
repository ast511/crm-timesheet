import { Link } from '@tanstack/react-router';
import { ShieldOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { FadeIn } from '@/components/motion/FadeIn';
import { buttonVariants } from '@/components/ui/button';
import type { PermissionKey } from '@/features/permissions/permission-keys';
import { cn } from '@/lib/utils';

export interface NotAuthorizedPageProps {
  /**
   * The permissions the refused route asked for, already validated by the
   * route's `validateSearch`. Empty when the URL carried nothing usable, which
   * is the case for somebody who typed the address themselves.
   */
  required: readonly PermissionKey[];
}

/**
 * Where a route somebody may not open sends them.
 *
 * ## It names the permission
 *
 * Not as a diagnostic, but because the useful thing a person can do with a
 * refusal is repeat it to whoever can lift it — "I need `REPORTS.VIEW`" gets
 * an answer; "it says I'm not allowed" starts a conversation about which page.
 * The key is the route's own requirement, which the backend already returns in
 * `params.requiredPermissions` on the real `403`, so nothing is disclosed here
 * that a refused request would not.
 *
 * What is deliberately absent is any hint of what the person *can* reach. A
 * refusal that enumerated the rest of the account's access would turn every
 * closed door into a map of the open ones.
 *
 * ## There is no "go back"
 *
 * The way back is the page they could not open, so a back button would return
 * them here. The one offered link is the workspace home, which needs no
 * permission.
 */
export const NotAuthorizedPage = ({ required }: NotAuthorizedPageProps) => {
  const { t } = useTranslation();

  return (
    <FadeIn className="mx-auto flex max-w-md flex-col items-center gap-4 py-10 text-center sm:py-16">
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <ShieldOffIcon className="size-6" />
      </span>

      <h1 className="text-xl font-semibold tracking-tight">{t('permissions.notAuthorized.title')}</h1>

      <p className="text-sm text-muted-foreground">
        {t('permissions.notAuthorized.description')}
      </p>

      {required.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('permissions.notAuthorized.required')}{' '}
          <span className="font-mono text-xs break-all text-foreground">{required.join(', ')}</span>
        </p>
      )}

      {/*
       * The button styling is applied to the `Link` rather than a `Button`
       * wrapped around one. This is a link — it navigates — and a `<button>`
       * inside an `<a>` is interactive content inside interactive content,
       * which browsers and screen readers both handle badly. `buttonVariants`
       * exists for exactly this case.
       */}
      <Link to="/app" className={cn(buttonVariants({ variant: 'outline' }), 'mt-2')}>
        {t('permissions.notAuthorized.backHome')}
      </Link>
    </FadeIn>
  );
};
