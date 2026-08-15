import { Link } from "@tanstack/react-router";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";

import { AppLogo } from "./AppLogo";

/**
 * The header of the sign-in area: a logo and a language.
 *
 * ## What is deliberately absent
 *
 * **No theme control.** Not hidden, not disabled — not rendered. The public
 * screens follow the operating system (`<ColorModeScope scope="device">`), and
 * a control here would either write a preference for a person who does not
 * exist yet, or sit there doing nothing. Light/dark becomes adjustable at the
 * moment there is an account to attach it to, which is also the moment the
 * palette and corner radius arrive from `GET /profile/me`.
 *
 * **Language stays**, because it is not a theme. Somebody who cannot read the
 * login form cannot sign in to change the setting that would let them read it,
 * which makes this the one control that has to be available before
 * authentication. It is stored on the device and sent nowhere.
 *
 * The logo replaces the app-name text: it is the same link to the same place,
 * and on the screen where somebody decides whether they are in the right
 * application, a wordmark does that job better than a string.
 */
export const PublicHeader = () => (
  <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80">
    <Link to="/login" className="flex min-w-0 items-center">
      <AppLogo className="h-8 sm:h-10" />
      {/* <AppLogo className="h-6 sm:h-7" /> */}
    </Link>

    <nav className="ml-auto flex items-center gap-1">
      <LanguageSwitcher />
    </nav>
  </header>
);
