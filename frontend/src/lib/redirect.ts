/**
 * The "where was I going?" parameter, sanitised.
 *
 * The route guard puts the location somebody asked for into `?redirect=` so
 * signing in returns them to it instead of dropping them on the dashboard. That
 * value then travels through a URL a person can edit, and something eventually
 * navigates to it — which is the open-redirect shape: `/login?redirect=https://
 * evil.example/login` produces a convincing sign-in page on somebody else's
 * domain, arrived at from a real link on this one.
 *
 * So only a path *within this application* survives, and the three rejected
 * forms are each a way of writing an absolute URL that looks relative:
 *
 * | Input | Result |
 * | --- | --- |
 * | `/app/timesheets?week=12` | kept |
 * | `https://evil.example` | rejected — has a scheme |
 * | `//evil.example` | rejected — protocol-relative, and a browser treats it as absolute |
 * | `/\evil.example` | rejected — backslash, which browsers normalise to `/` |
 * | `app/timesheets` | rejected — not rooted; resolves against wherever it is used |
 *
 * Anything rejected becomes `undefined` and the caller falls back to its own
 * default, which is the safe direction: the cost of being wrong is one extra
 * click, not a phishing page.
 */
export const toInternalPath = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  if (!value.startsWith('/')) return undefined;
  if (value.startsWith('//') || value.startsWith('/\\')) return undefined;

  return value;
};
