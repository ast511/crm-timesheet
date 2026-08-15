import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';

export interface FadeInProps extends HTMLMotionProps<'div'> {
  /** Seconds to wait before starting. For staggering two or three elements. */
  delay?: number;
}

/**
 * The application's entrance animation, in one place.
 *
 * A short rise and fade — the motion that says "this arrived" without making
 * anybody wait for it. `CLAUDE.md` asks that repeated motion patterns be a
 * shared component rather than transitions re-specified inline, and this is the
 * first of them: every auth screen enters this way, so they enter identically.
 *
 * **Reduced motion is honoured by removing the movement, not the element.**
 * With `prefers-reduced-motion` set, `initial` is `false`, which tells
 * framer-motion to render the animated state immediately — no fade, no travel,
 * and nothing hidden waiting for an animation that will not run.
 */
export const FadeIn = ({ delay = 0, children, ...props }: FadeInProps) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion === true ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut', delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
};
