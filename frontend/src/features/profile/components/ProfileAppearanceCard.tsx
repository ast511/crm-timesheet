import { useTranslation } from 'react-i18next';

import { ThemePreferenceFields } from '@/components/theme/ThemePreferenceFields';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * The palette and the corner radius, on the profile page.
 *
 * ## Why they are here as well as in the header dialog
 *
 * They are the *other* thing on this screen that belongs to the person rather
 * than to the company — the profile is, in total, a phone number and two
 * preferences — so a profile page that sent somebody to a header icon to change
 * their own theme would be an account screen that omits half the account.
 *
 * ## It is the same controls, not a second set
 *
 * {@link ThemePreferenceFields} is one component rendering the two pickers and
 * calling one mutation, and both surfaces mount it. So "behaves identically to
 * the dialog" is a property of there being one implementation, not a claim to be
 * re-checked whenever either changes — which is exactly the failure F05
 * describes in the mock, whose `ThemeCustomizer` was a second theme system
 * beside the first and was already wrong.
 *
 * ## No preview, unlike the dialog
 *
 * A dialog covers the page it is changing, so it has to show a swatch of what it
 * did. This card does not cover anything: the cards around it re-round and the
 * button below it recolours as the choice is made. The page is the preview, and
 * a preview *of* the page inside the page would be the smaller, worse copy.
 */
export const ProfileAppearanceCard = () => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.appearance.title')}</CardTitle>
        <CardDescription>{t('profile.appearance.description')}</CardDescription>
      </CardHeader>

      <CardContent className="gap-6">
        <ThemePreferenceFields />
      </CardContent>
    </Card>
  );
};
