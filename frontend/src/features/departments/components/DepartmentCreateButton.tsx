import { PlusIcon } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { useCan } from '@/features/permissions/usePermissions';
import { Button } from '@/components/ui/button';

import { DepartmentFormDialog } from './DepartmentFormDialog';

export interface DepartmentCreateButtonProps {
  variant?: ComponentProps<typeof Button>['variant'];
  size?: ComponentProps<typeof Button>['size'];
}

/**
 * "Adaugă departament" — the button and the dialog it opens, as one piece.
 *
 * It is self-contained because it appears in two places that share nothing else:
 * the page header, and the empty state where it is the only thing to do.
 * Hoisting the open state to a common parent would mean the empty state reaching
 * upwards through the query boundary for a setter, so each instance owns its own
 * dialog and only one is ever open.
 *
 * Gated on `DEPARTMENTS.CREATE` through `useCan` rather than `<Can>`, because
 * the gate covers the dialog as well as the button — and there is no fallback: a
 * control somebody cannot use is simply not there, which is the ordinary case.
 */
export const DepartmentCreateButton = ({ variant, size }: DepartmentCreateButtonProps) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const canCreate = useCan({ permission: 'DEPARTMENTS.CREATE' });

  if (!canCreate) return null;

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setIsOpen(true)}>
        <PlusIcon aria-hidden="true" />
        {t('departments.actions.create')}
      </Button>

      <DepartmentFormDialog open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
};
