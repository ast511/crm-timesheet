import { BriefcaseIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatCalendarDate } from '@/lib/datetime';

import type { Profile } from '../profile-api';
import { ProfileDetailList } from './ProfileDetailList';
import { ProfilePhoneForm } from './ProfilePhoneForm';

export interface ProfileEmploymentCardProps {
  /** The employment record, or `null` for an account that has none. */
  employee: Profile['employee'];
}

/**
 * The employment record — read-only, plus the one field its owner may change.
 *
 * ## HR owns everything here except the phone number
 *
 * The name, the employee code, the department, the position, the seniority and
 * the dates are all organisational facts, changed through `PATCH /employees/:id`
 * by somebody in HR. The backend gives the reason each is refused to the person
 * themselves, and the quiet one is worth repeating: a department decides whose
 * leave routes to which approver, so editing your own would be editing who
 * approves you.
 *
 * ## The phone form is inside this card because the phone is inside this record
 *
 * `phone` is a column of `employees`, not of `users` — invisible from the wire,
 * where one `PATCH /profile/me` body spans both tables, but with one consequence
 * a person can see: **an account with no employment record may set its theme and
 * may not set a phone**, because there is no row to set it on. Asking anyway is a
 * `403` carrying `AUTH_NO_EMPLOYEE_RECORD`.
 *
 * Putting the form here makes that follow from the layout rather than needing to
 * be explained: no employment record, no employment card, no phone field. A
 * *Contact* card of its own would have had to disappear for the same reason
 * while looking like it belonged to the account, which is the arrangement that
 * makes the missing field look like a bug.
 *
 * ## The empty state is a real state, not an error
 *
 * A super-admin created to administer the system has no employee row, and that
 * account is working exactly as intended. So the card says so plainly instead of
 * rendering an empty list or being hidden — a section that vanishes leaves
 * somebody wondering whether the page failed to load half of itself.
 */
export const ProfileEmploymentCard = ({ employee }: ProfileEmploymentCardProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.employment.title')}</CardTitle>
        <CardDescription>{t('profile.employment.description')}</CardDescription>
      </CardHeader>

      <CardContent>
        {employee === null ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center">
            <BriefcaseIcon aria-hidden="true" className="size-5 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">
              {t('profile.employment.empty')}
            </p>
          </div>
        ) : (
          <>
            <ProfileDetailList
              items={[
                {
                  label: t('profile.employment.name'),
                  value: `${employee.firstName} ${employee.lastName}`,
                },
                { label: t('profile.employment.employeeCode'), value: employee.employeeCode },
                { label: t('profile.employment.department'), value: employee.department.name },
                { label: t('profile.employment.position'), value: employee.position.name },
                {
                  label: t('profile.employment.seniority'),
                  value: t(`seniority.${employee.seniority}`),
                },
                {
                  label: t('profile.employment.status'),
                  value: t(`employeeStatus.${employee.status}`),
                },
                {
                  label: t('profile.employment.hireDate'),
                  value: formatCalendarDate(employee.hireDate),
                },
                {
                  label: t('profile.employment.terminationDate'),
                  value:
                    employee.terminationDate === null
                      ? null
                      : formatCalendarDate(employee.terminationDate),
                },
              ]}
            />

            <Separator className="my-2" />

            <ProfilePhoneForm phone={employee.phone} />
          </>
        )}
      </CardContent>
    </Card>
  );
};
