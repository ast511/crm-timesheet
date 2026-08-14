import { useTranslation } from 'react-i18next';

import { useApiErrorMessage } from '@/i18n/useApiErrorMessage';

import { Button } from './ui/button';

export interface QueryErrorStateProps {
  error: unknown;
  onRetry: () => void;
}

/**
 * The default failure state for a suspended query.
 *
 * The sentence comes from `useApiErrorMessage`, which translates the envelope's
 * `errorCode` — the backend's English `message` is never rendered.
 */
export const QueryErrorState = ({ error, onRetry }: QueryErrorStateProps) => {
  const { t } = useTranslation();
  const describeError = useApiErrorMessage();

  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
    >
      <p className="text-sm">{describeError(error)}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t('actions.retry')}
      </Button>
    </div>
  );
};
