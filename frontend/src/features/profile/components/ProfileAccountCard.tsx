import { useTranslation } from 'react-i18next';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import type { ProfileAccount } from '../profile-api';
import { ProfileDetailList } from './ProfileDetailList';

export interface ProfileAccountCardProps {
  account: ProfileAccount;
}

/**
 * The account, entirely read-only.
 *
 * **Every field here is deliberately not editable, and the backend is where the
 * reasoning lives** (`UpdateProfileDto`). Restated briefly, because a screen
 * that shows four values and lets you change none of them looks broken until
 * you know why:
 *
 * | Field | Changed by |
 * | --- | --- |
 * | `email` | nobody yet — it is the account's identity *and* where every reset link goes, so changing it unverified would redirect the account's own recovery |
 * | `username` | nobody yet |
 * | `role` | `PATCH /users/:id`, ADMIN/SUPERADMIN — self-service role editing is self-service privilege escalation |
 * | `status` | `POST /users/:id/activate` / `deactivate` — whether an account may sign in is not its owner's decision |
 *
 * So there is no disabled input here either. A greyed-out field advertises an
 * edit that is coming; these are not coming, and text is the honest rendering of
 * a value somebody else owns.
 *
 * ## `createdAt` is not shown, and that is not an oversight
 *
 * It is a genuine instant, and `CLAUDE.md` requires every timestamp to be
 * rendered in the **company timezone**, read from `GET /api/v1/work-schedule` —
 * an endpoint no feature reads yet. Printing it in the browser's zone to avoid
 * an empty row would be the one thing that rule exists to prevent. It joins the
 * card on the day the work-schedule query does.
 *
 * ## Password
 *
 * Changing one requires proving the current one, which a `PATCH` cannot do; it
 * is `POST /auth/change-password` and its own screen. Nothing is rendered for it
 * here rather than a control that leads nowhere.
 */
export const ProfileAccountCard = ({ account }: ProfileAccountCardProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.account.title')}</CardTitle>
        <CardDescription>{t('profile.account.description')}</CardDescription>
      </CardHeader>

      <CardContent>
        <ProfileDetailList
          items={[
            { label: t('profile.account.email'), value: account.email },
            { label: t('profile.account.username'), value: account.username },
            { label: t('profile.account.role'), value: t(`roles.${account.role}`) },
            {
              label: t('profile.account.status'),
              value: t(`accountStatus.${account.status}`),
            },
          ]}
        />
      </CardContent>
    </Card>
  );
};
