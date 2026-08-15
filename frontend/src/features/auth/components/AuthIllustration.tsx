import authImage from '@/assets/images/auth.jpg';

/**
 * The photograph on the left half of the login card.
 *
 * A **CSS background rather than an `<img>`**, and that is the whole reason
 * this is a component instead of two lines inside `AuthCard`. The slot it fills
 * is `display: none` below `md`, and a browser inside a `display: none` subtree
 * does not fetch a background image — where it *would* still fetch an `<img>`
 * element's `src`. So a phone, which is told by the design not to show this,
 * also never pays for it.
 *
 * It carries no `alt` equivalent because it has nothing to say: it is
 * decoration beside a form, and a screen reader announcing it would be reading
 * out the wallpaper.
 *
 * The overlay is `bg-foreground/20`, a theme variable rather than a fixed
 * black, so it deepens in dark mode with everything else instead of turning the
 * one dark panel on the screen into the light one.
 */
export const AuthIllustration = () => (
  <div
    aria-hidden="true"
    className="absolute inset-0 bg-cover bg-center"
    style={{ backgroundImage: `url(${authImage})` }}
  >
    <div className="absolute inset-0 bg-foreground/20" />
  </div>
);
