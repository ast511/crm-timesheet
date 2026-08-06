import { SendEmailOptions } from '../email/interfaces/send-email-options.interface';

/**
 * The one email this engine composes.
 *
 * Feature 025 was explicit that it knows how to *deliver* a message and not how
 * to compose one, and that templates and variable substitution are a feature of
 * their own. This file is the smallest thing that lets a campaign reach an inbox
 * without pre-empting that feature: a heading, the message as the author typed
 * it, and no variables, no placeholders, no template language and no layout to
 * maintain. When the templates feature arrives it replaces this function and
 * `SendEmailOptions` does not change — which is exactly the seam Feature 025
 * described.
 *
 * Every campaign and every reminder goes out in this shape, so an employee reads
 * one kind of email from this system rather than two that happen to look alike.
 */

/**
 * Renders one notification as the subject and body of an email.
 *
 * The `subject` is the campaign's own, **untruncated** — an email subject line
 * has no 150-character bound to obey, so the full heading survives here even
 * when the in-app notification's title was shortened. That is the half of the
 * truncation trade-off that costs nothing.
 *
 * Both `text` and `html` are produced from the same string. The plain part is not
 * a courtesy: a mail client that will not render HTML would otherwise show an
 * empty message, and an announcement nobody can read is worse than one that is
 * plainly formatted.
 */
export function renderNotificationEmail(
  subject: string,
  message: string,
): Omit<SendEmailOptions, 'to'> {
  return {
    subject,
    text: `${subject}\n\n${message}`,
    html: renderHtml(subject, message),
  };
}

/**
 * The HTML body.
 *
 * **Everything that came from a person is escaped**, and that is the only
 * security-relevant line in this file. `notifications.message` is documented as
 * plain text — Feature 026 states that no markup is rendered and none is
 * stripped — so an announcement containing `<script>` is a message about a script
 * tag, not a script. Interpolating it unescaped would turn every campaign into a
 * way to put markup in a colleague's mail client.
 *
 * Line breaks are converted after escaping, so a paragraph the author typed
 * survives while the `<br>` they typed does not become one.
 */
function renderHtml(subject: string, message: string): string {
  const body = escapeHtml(message).replaceAll('\n', '<br />');

  return `<h2>${escapeHtml(subject)}</h2>\n<p>${body}</p>`;
}

/**
 * The five characters that change the meaning of HTML.
 *
 * `&` first, necessarily: escaping it after the others would turn the `&` this
 * function had just written into `&amp;amp;`.
 */
const HTML_ESCAPES: ReadonlyArray<readonly [string, string]> = [
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
];

function escapeHtml(value: string): string {
  return HTML_ESCAPES.reduce(
    (escaped, [character, entity]) => escaped.replaceAll(character, entity),
    value,
  );
}
