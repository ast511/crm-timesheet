import { renderNotificationEmail } from './notification-email.template';

describe('renderNotificationEmail', () => {
  it('carries the heading as the subject, untruncated', () => {
    const subject = 'A'.repeat(200);

    expect(renderNotificationEmail(subject, 'body').subject).toBe(subject);
  });

  // A mail client that will not render HTML would otherwise show an empty
  // message, and an announcement nobody can read is worse than a plain one.
  it('produces a plain-text part as well as an HTML one', () => {
    const { text, html } = renderNotificationEmail(
      'Planned maintenance',
      'The system will be unavailable.',
    );

    expect(text).toBe('Planned maintenance\n\nThe system will be unavailable.');
    expect(html).toBe(
      '<h2>Planned maintenance</h2>\n<p>The system will be unavailable.</p>',
    );
  });

  it('keeps the paragraphs an author typed', () => {
    const { html } = renderNotificationEmail('Notice', 'First.\nSecond.');

    expect(html).toContain('First.<br />Second.');
  });

  // `notifications.message` is documented as plain text: an announcement
  // containing a script tag is a message *about* a script tag.
  it('escapes markup in the message', () => {
    const { html } = renderNotificationEmail(
      'Notice',
      '<script>alert("x")</script>',
    );

    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('escapes markup in the heading too', () => {
    const { html } = renderNotificationEmail('<b>Urgent</b>', 'body');

    expect(html).toContain('<h2>&lt;b&gt;Urgent&lt;/b&gt;</h2>');
  });

  // The ampersand has to be escaped first, or the entities this function writes
  // would themselves be escaped.
  it('does not double-escape an ampersand', () => {
    const { html } = renderNotificationEmail('Notice', 'Sales & Marketing');

    expect(html).toContain('Sales &amp; Marketing');
    expect(html).not.toContain('&amp;amp;');
  });

  it('leaves the plain-text part as the author typed it', () => {
    const { text } = renderNotificationEmail('Notice', '<b>bold</b>');

    expect(text).toContain('<b>bold</b>');
  });

  it('escapes a single quote, which an apostrophe in a name produces', () => {
    const { html } = renderNotificationEmail('Notice', "O'Brien is away");

    expect(html).toContain('O&#39;Brien');
  });
});
