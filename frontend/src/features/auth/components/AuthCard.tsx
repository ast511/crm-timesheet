import type { ReactNode } from 'react';

import { FadeIn } from '@/components/motion/FadeIn';
import { cn } from '@/lib/utils';

export interface AuthCardProps {
  title: string;
  description: string;
  children: ReactNode;
  /** Rendered under the form, centred — usually a link back to sign-in. */
  footer?: ReactNode;
  /**
   * The image half. Present only on the login screen, and only from `md` up.
   *
   * Its presence is what widens the card and splits it in two, so a page does
   * not restate the layout — it says whether it has an illustration.
   */
  illustration?: ReactNode;
}

/**
 * The shell all four authentication screens share.
 *
 * One card, two shapes. With an `illustration` it is the wide split card the
 * login design asks for; without one it is a single narrow column, which is the
 * right proportion for a form with one field. Everything else — the centring,
 * the heading pair, the rounding, the elevation, the entrance — is identical,
 * so the screens somebody reaches from an email look like the screen they were
 * trying to get to.
 *
 * **Below `md` the illustration slot is `display: none`**, and the illustration
 * itself is a CSS background rather than an `<img>` precisely so that a phone
 * does not download a photograph it will not show — see `AuthIllustration`. The
 * card becomes the form alone, which is what the mobile design asks for.
 *
 * Everything here is theme variables — `bg-card`, `text-muted-foreground`,
 * `ring-foreground/10` — so the palette a person chose and their light/dark
 * setting apply to the login screen exactly as they do to the application
 * behind it.
 */
export const AuthCard = ({
  title,
  description,
  children,
  footer,
  illustration,
}: AuthCardProps) => (
  /*
   * **Top-aligned below `sm`, centred above it — and that is the fix for a real
   * bug rather than a matter of taste.**
   *
   * Vertical centring positions the card at `(available height − card) / 2`,
   * which means its position is a *function of the viewport height*. On a phone
   * that height is not a constant: the on-screen keyboard takes a third of it
   * away when a field is focused and gives it back when the field is blurred.
   *
   * So the sequence somebody actually performs — tap the email field, then tap
   * the language button in the header — dismisses the keyboard, grows the
   * usable height by ~225px, and drops the card by half of that. It looks
   * exactly like opening the menu pushed the form down, and the menu has
   * nothing to do with it. Measured at 390px wide: 700px of height puts the
   * card at 205, 420px of height puts it at 72. The same 133px jump the
   * keyboard produces.
   *
   * Top alignment makes the position independent of the height, so nothing the
   * keyboard does can move it — and it puts the fields near the top, where the
   * keyboard is less likely to cover the one being typed into. From `sm` up,
   * where there is no soft keyboard eating the viewport, the centred layout the
   * design asks for is kept.
   */
  <main className="flex flex-1 flex-col items-center justify-start p-4 pt-8 sm:justify-center sm:p-6">
    <FadeIn
      className={cn('w-full', illustration === undefined ? 'max-w-md' : 'max-w-4xl')}
    >
      <div
        className={cn(
          'grid overflow-hidden rounded-xl bg-card text-card-foreground shadow-lg ring-1 ring-foreground/10',
          illustration !== undefined && 'md:grid-cols-2',
        )}
      >
        {illustration !== undefined && (
          <div className="relative hidden md:block">{illustration}</div>
        )}

        <div className="flex flex-col gap-6 p-6 sm:p-8 lg:p-10">
          <header className="grid gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </header>

          {children}

          {footer !== undefined && (
            <div className="text-center text-sm text-muted-foreground">{footer}</div>
          )}
        </div>
      </div>
    </FadeIn>
  </main>
);
