'use strict';

/**
 * Files a message from the LivLocal contact page.
 *
 * The page posts here rather than straight to Notion, for two reasons: the
 * browser cannot call the Worker webhook directly (its preflight returns 404,
 * so there is no CORS), and the site's Content-Security-Policy only allows
 * same-origin requests. This function checks the submission and forwards it to
 * the Worker, which writes the row into LivLocal Messages.
 *
 * Required app setting:
 *   CONTACT_WEBHOOK_URL   the contact-form webhook URL from the Notion Worker
 */

const MAX_NAME = 120;
const MAX_EMAIL = 200;
const MAX_TOPIC = 60;
const MAX_MESSAGE = 5000;

/** The topics the LivLocal Messages database already offers. */
const TOPICS = ['Sizing', 'Fabrics', 'Custom piece', 'Existing order', 'Something else'];

// Best-effort throttle, held per instance. Static Web Apps runs several
// instances, so this blunts a burst rather than enforcing a hard limit.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const recent = new Map();

function throttled(ip) {
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter((time) => now - time < WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);

  if (recent.size > 500) {
    for (const [key, times] of recent) {
      if (!times.some((time) => now - time < WINDOW_MS)) recent.delete(key);
    }
  }

  return hits.length > MAX_PER_WINDOW;
}

function singleLine(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function json(status, body) {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

module.exports = async function (context, req) {
  const webhook = process.env.CONTACT_WEBHOOK_URL;
  if (!webhook) {
    context.log.error('CONTACT_WEBHOOK_URL is not set.');
    return json(500, { error: 'The contact form is not set up yet.' });
  }

  const body = req.body || {};
  const name = singleLine(body.name, MAX_NAME);
  const email = singleLine(body.email, MAX_EMAIL);
  const topicValue = singleLine(body.topic, MAX_TOPIC);
  const message =
    typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE) : '';
  const trap = singleLine(body.website, 200);

  // A filled honeypot gets the same answer a real message gets, so a bot
  // cannot tell it was dropped.
  if (trap) {
    context.log.warn('Contact submission dropped: honeypot filled.');
    return json(200, { ok: true });
  }

  if (!name || !looksLikeEmail(email) || !message) {
    return json(400, { error: 'Please add your name, your email, and a message.' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (throttled(ip)) {
    context.log.warn(`Contact submission throttled for ${ip}.`);
    return json(429, { error: 'That is a lot of messages at once. Please try again shortly.' });
  }

  const topic = TOPICS.includes(topicValue) ? topicValue : undefined;

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, email, topic, message }),
    });

    if (!response.ok) {
      context.log.error(`Contact webhook answered ${response.status}.`);
      return json(502, { error: 'We could not send that just now.' });
    }
  } catch (error) {
    context.log.error('Contact webhook request failed', error && error.message);
    return json(502, { error: 'We could not send that just now.' });
  }

  context.log(`Filed a contact message from ${email}.`);
  return json(200, { ok: true });
};
