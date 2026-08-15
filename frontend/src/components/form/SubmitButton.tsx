import type { ComponentProps, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export interface SubmitButtonProps extends ComponentProps<typeof Button> {
  /** True while the request is in flight. Disables the button and spins. */
  pending?: boolean;
  children: ReactNode;
}

/**
 * The submit button, with the in-flight state built in.
 *
 * A submitting button is the textbook **punctual** wait `CLAUDE.md` reserves
 * the `Spinner` for — brief, non-structural, and attached to something the
 * person just did. It is also the case where "disable it while it runs" is not
 * cosmetic: a second click on a login button is a second `POST /auth/login`
 * against a strictly rate-limited endpoint.
 *
 * The label stays visible beside the spinner rather than being replaced by it,
 * so the button does not change width mid-request.
 */
export const SubmitButton = ({ pending = false, children, ...props }: SubmitButtonProps) => (
  <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
    {pending && <Spinner size="sm" />}
    {children}
  </Button>
);
