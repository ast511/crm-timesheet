import type { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { NavChild } from '@/features/workspace/navigation';

export interface SidebarPopoverMenuProps {
  /** The group's own name, for the popup's accessible label. */
  title: string;
  /** The children to offer. Already filtered by permission by the caller. */
  items: readonly NavChild[];
  /** The collapsed group button this hangs off. */
  children: ReactElement;
}

/** Milliseconds. Long enough not to fire while the pointer crosses the rail. */
const HOVER_DELAY = 120;
/** Long enough to reach the popup across the gap between it and the rail. */
const HOVER_CLOSE_DELAY = 200;

/**
 * The submenu a collapsed group opens into.
 *
 * When the sidebar is an icon rail there is no room for a group to expand in
 * place — `SidebarMenuSub` is `hidden` under `collapsible=icon` by the block's
 * own stylesheet — so the children have to come out sideways. The shadcn
 * sidebar ships no such thing; this is the piece the mock contributed, rebuilt
 * on Base UI and this project's router.
 *
 * ## Behaviour comes from Base UI, motion from framer-motion
 *
 * Everything that makes a popup *correct* rather than merely visible — Escape,
 * click-outside, focus moving into the popup and back to the trigger, staying
 * on screen near the viewport edge — is Base UI's `Popover`, and the reason to
 * use it rather than the absolutely-positioned panel the mock had. Opening on
 * hover *and* on click is one prop, so a pointer and a keyboard reach the same
 * menu by the means each expects.
 *
 * The enter and exit are framer-motion's, which `CLAUDE.md` requires for
 * exactly this component. That combination needs the one piece of ceremony
 * below: Base UI removes a closed popup as soon as it stops seeing a CSS
 * animation, and framer-motion animates inline styles, which is not one. So the
 * portal is kept mounted, `AnimatePresence` owns the exit, and
 * `actionsRef.unmount()` tells Base UI the animation has finished — the
 * arrangement its own documentation prescribes for a JavaScript animation
 * library.
 *
 * ## Reduced motion
 *
 * The variants collapse to opacity-only at zero duration, so the menu still
 * appears and disappears instantly rather than not at all. `onAnimationComplete`
 * still fires, so the unmount happens either way — this is not a branch that
 * can strand a hidden popup in the DOM.
 */
export const SidebarPopoverMenu = ({ title, items, children }: SidebarPopoverMenuProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const actionsRef = useRef<PopoverPrimitive.Root.Actions>(null);
  const prefersReducedMotion = useReducedMotion() === true;

  const transition = prefersReducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 420, damping: 32 };

  return (
    <Popover open={open} onOpenChange={setOpen} actionsRef={actionsRef}>
      <PopoverTrigger
        openOnHover
        delay={HOVER_DELAY}
        closeDelay={HOVER_CLOSE_DELAY}
        aria-label={t('sidebar.openSubmenu', { title })}
        render={children}
      />

      <AnimatePresence>
        {open && (
          <PopoverContent
            keepMounted
            side="right"
            align="start"
            sideOffset={8}
            className="w-52 gap-0 p-1"
            render={
              <motion.div
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
                transition={transition}
                onAnimationComplete={() => {
                  if (!open) actionsRef.current?.unmount();
                }}
              />
            }
          >
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{title}</p>

            {items.map((item) => (
              <Link
                key={item.route}
                to={item.route}
                onClick={() => setOpen(false)}
                activeOptions={{ exact: true }}
                className="rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground data-[status=active]:bg-accent data-[status=active]:font-medium data-[status=active]:text-accent-foreground"
              >
                {t(item.titleKey)}
              </Link>
            ))}
          </PopoverContent>
        )}
      </AnimatePresence>
    </Popover>
  );
};
