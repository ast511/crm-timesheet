import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";

import logoDark from "@/assets/images/logo_dark.png";
import logoLight from "@/assets/images/logo_light.png";
import logoShort from "@/assets/images/logo_short.png";
import { useSidebar } from "@/components/ui/sidebar";
import { useTheme } from "@/theme/useTheme";

/** The wordmark's intrinsic pixels, so the box is reserved before it loads. */
const FULL_WIDTH = 2172;
const FULL_HEIGHT = 724;
/** The icon's, which is square. */
const SHORT_SIZE = 1254;

/**
 * The logo at the top of the sidebar: the full wordmark when there is room for
 * it, the square icon when there is not.
 *
 * The icon rail is 3rem wide, which fits a 2rem square and not a wordmark three
 * times as wide as it is tall. So the two files swap on collapse — and on
 * mobile, where the sidebar is a sheet at full width and `state` still reports
 * whatever the desktop rail was last set to, the wordmark always wins.
 *
 * ## Why this picks its file in JavaScript and `AppLogo` does not
 *
 * `AppLogo` — the public area's — uses a `<picture>` with a
 * `prefers-color-scheme` source, so the browser fetches one file and swaps it
 * natively. That is right *there*, because the public screens follow the
 * operating system by construction (`<ColorModeScope scope="device">`).
 *
 * Here they need not agree. This is the account area, where somebody may have
 * chosen dark on a machine set to light, and the media query would then answer
 * a question nobody asked. The rendered theme is `resolvedColorMode`, so that
 * is what selects the file. The cost is the one `<picture>` avoids — both
 * wordmarks can end up fetched across a session — and it is the correct cost:
 * showing the light logo on a dark sidebar is a visible bug, and a second
 * cached image is not.
 *
 * ## There is one `logo_short.png`, and it needs no dark variant
 *
 * It is a blue rounded tile with a white glyph on transparency, so it carries
 * its own contrast and reads on both the near-white and the near-black sidebar.
 * Nothing is done to it — no filter, no inversion — because nothing needs to
 * be, and a treatment applied "just in case" is a treatment nobody can later
 * tell was deliberate.
 */
export const SidebarBrand = () => {
  const { t } = useTranslation();
  const { state, isMobile } = useSidebar();
  const { resolvedColorMode } = useTheme();
  const prefersReducedMotion = useReducedMotion() === true;

  const expanded = isMobile || state === "expanded";
  const transition = {
    duration: prefersReducedMotion ? 0 : 0.18,
    ease: "easeOut" as const,
  };

  return (
    <Link
      to="/app"
      aria-label={t("app.name")}
      className="flex h-8 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      {/*
       * `popLayout` takes the outgoing image out of the flow, so the two
       * genuinely cross-fade in place instead of the incoming one being pushed
       * aside while the other leaves.
       */}
      <AnimatePresence initial={false} mode="popLayout">
        {expanded ? (
          <motion.img
            key="wordmark"
            src={resolvedColorMode === "dark" ? logoDark : logoLight}
            alt=""
            width={FULL_WIDTH}
            height={FULL_HEIGHT}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            className="h-8 w-auto object-contain"
          />
        ) : (
          <motion.img
            key="icon"
            src={logoShort}
            alt=""
            width={SHORT_SIZE}
            height={SHORT_SIZE}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            className="size-8 object-contain"
          />
        )}
      </AnimatePresence>
    </Link>
  );
};
