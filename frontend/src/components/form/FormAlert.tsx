import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/utils';

export type FormAlertTone = 'error' | 'success';

export interface FormAlertProps {
  /** Already translated. `undefined` renders nothing and animates the old one out. */
  message?: string;
  tone?: FormAlertTone;
  className?: string;
}

const TONE_CLASSES: Record<FormAlertTone, string> = {
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
  success: 'border-primary/30 bg-primary/10 text-foreground',
};

/**
 * The form-level message: what the *server* said, as opposed to what a field
 * failed to satisfy.
 *
 * It is where a translated `errorCode` is rendered — never the envelope's raw
 * `message` — and where the deliberately generic confirmations go, such as the
 * fixed sentence `POST /auth/forgot-password` answers with whether or not the
 * address exists.
 *
 * `AnimatePresence` is what earns framer-motion here rather than a Tailwind
 * transition: the element is added to and removed from the tree, and an exit
 * animation is the thing CSS alone cannot do. `useReducedMotion` collapses it
 * to an instant swap for anybody who has asked for less movement.
 *
 * `aria-live="polite"` on the always-present container rather than `role=
 * "alert"` on the message: a live region has to exist *before* the text does
 * for the change to be announced, and polite means it waits for a natural pause
 * instead of interrupting whatever is being read.
 */
export const FormAlert = ({ message, tone = 'error', className }: FormAlertProps) => {
  const prefersReducedMotion = useReducedMotion();
  const duration = prefersReducedMotion === true ? 0 : 0.18;

  return (
    <div aria-live="polite" className={className}>
      <AnimatePresence initial={false}>
        {message !== undefined && (
          <motion.p
            key={message}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <span
              className={cn(
                'block rounded-md border px-3 py-2 text-sm',
                TONE_CLASSES[tone],
              )}
            >
              {message}
            </span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
};
