import { useTranslation } from 'react-i18next';

/** One labelled fact. `null` renders as "not set" rather than as a gap. */
export interface ProfileDetail {
  label: string;
  value: string | null;
}

export interface ProfileDetailListProps {
  items: readonly ProfileDetail[];
}

/**
 * The read-only half of the profile: labelled facts, in a description list.
 *
 * Both cards render one of these, which is the reason it exists — the account
 * and the employment record are different data with identical presentation, and
 * the alternative was the same `<dl>` markup written twice with the label column
 * eventually a different width in each.
 *
 * ## It is a `<dl>` because that is what it is
 *
 * A grid of `<div>`s would look the same and say nothing. `<dt>`/`<dd>` pairs
 * tell a screen reader that "Departament" labels "Inginerie" rather than the two
 * being adjacent text, which is the whole content of this component.
 *
 * ## Responsive: stacked below `sm`, two columns above
 *
 * Each pair is wrapped so it stacks — label above value — on a phone, and the
 * wrapper becomes `display: contents` at `sm`, dissolving into the grid so every
 * label lines up in one column. One markup, two layouts, no duplicated content.
 *
 * A `null` value is rendered as a dash rather than left blank: an empty cell is
 * indistinguishable from a rendering bug, while "—" says the field is genuinely
 * empty.
 */
export const ProfileDetailList = ({ items }: ProfileDetailListProps) => {
  const { t } = useTranslation();

  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-[minmax(7rem,auto)_1fr] sm:gap-x-6">
      {items.map(({ label, value }) => (
        <div key={label} className="grid gap-0.5 sm:contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className={value === null ? 'text-muted-foreground' : 'font-medium'}>
            {value ?? t('profile.notSet')}
          </dd>
        </div>
      ))}
    </dl>
  );
};
