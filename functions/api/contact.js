/**
 * POST /api/contact — the contact form's endpoint.
 *
 * A Cloudflare Pages Function, so it deploys with the site and there is no
 * separate service to run. The form works without JavaScript: a plain POST
 * gets a redirect to /thanks.html, and the fetch() in contact.html gets JSON
 * back instead, because it asks for it.
 *
 * Delivery goes through Resend (https://resend.com) — one REST call, no SDK.
 * Three secrets, set in the Pages project under Settings → Environment
 * variables. Set them for Production *and* Preview or the preview builds fail:
 *
 *   RESEND_API_KEY   re_...           from the Resend dashboard
 *   CONTACT_TO       you@example.com  where the messages arrive
 *   CONTACT_FROM     Majal <noreply@majalops.com>
 *                    must be on a domain verified in Resend — Resend rejects
 *                    a From it cannot prove you own, so this cannot be the
 *                    sender's own address. Theirs goes in Reply-To instead.
 *
 * Until those exist the endpoint answers 503 and says so, rather than
 * accepting a message it is going to drop.
 *
 * Two further secrets are optional. Set both and the submission is also filed
 * as a lead in Majal, so the pipeline sees the people who came to us rather
 * than only the ones we wrote to first:
 *
 *   MAJAL_INBOUND_URL     https://erp.example/majal/inbound/website
 *   MAJAL_INBOUND_SECRET  matches the majal_sales_ops.inbound_secret
 *                         system parameter in Odoo
 *
 * Leave them unset and nothing changes: the email still goes, and the form
 * behaves exactly as before.
 */

const MAX = { name: 200, email: 320, company: 200, reason: 60, message: 8000 };

const REASONS = {
  demo: "Book a free demo call",
  general: "General question",
  "self-host": "Self-hosting / Docker help",
  other: "Something else",
};

/** Answer in the shape the caller asked for. */
function reply(request, ok, status, message) {
  const wantsJson = (request.headers.get("Accept") || "").includes("application/json");
  if (wantsJson) {
    return new Response(JSON.stringify({ ok, message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (ok) {
    return Response.redirect(new URL("/thanks.html", request.url).toString(), 303);
  }
  // No JS and something went wrong: say so in plain text rather than
  // redirecting to a page that would claim the message was sent.
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function clean(value, limit) {
  return String(value ?? "").trim().slice(0, limit);
}

/**
 * One handler for every method rather than an `onRequestPost` plus a catch-all:
 * when a Pages Function exports both, the two become a middleware chain, and
 * this endpoint has nothing to chain. Dispatching here is unambiguous.
 */
export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }
  return handlePost(request, env);
}

async function handlePost(request, env) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return reply(request, false, 400, "Could not read the form.");
  }

  // The honeypot is a hidden field a person never sees and never fills.
  // Answer 200 so a bot cannot tell it was caught and retry differently.
  if (clean(form.get("_gotcha"), 100)) {
    return reply(request, true, 200, "Thanks — your message is on its way.");
  }

  const name = clean(form.get("name"), MAX.name);
  const email = clean(form.get("email"), MAX.email);
  const company = clean(form.get("company"), MAX.company);
  const reason = clean(form.get("reason"), MAX.reason);
  const message = clean(form.get("message"), MAX.message);

  // Re-checked here because the client-side copy is trivially bypassed.
  if (!name || !email || !message) {
    return reply(request, false, 400, "Name, email and message are all required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply(request, false, 400, "That email address does not look right.");
  }

  const { RESEND_API_KEY, CONTACT_FROM } = env;
  // Support is the public Majal inbox. Pages can still override it with
  // CONTACT_TO for a staging or partner deployment.
  const CONTACT_TO = env.CONTACT_TO || "Support@majalops.com";
  if (!RESEND_API_KEY || !CONTACT_FROM) {
    // Misconfigured rather than broken — do not pretend it was delivered.
    return reply(
      request,
      false,
      503,
      "The contact form is not configured yet. Please try again later.",
    );
  }

  const subject = `Majal contact — ${REASONS[reason] || "General question"}`;
  const body = [
    `Name:    ${name}`,
    `Email:   ${email}`,
    company ? `Company: ${company}` : null,
    `About:   ${REASONS[reason] || reason || "unspecified"}`,
    "",
    message,
  ]
    .filter(Boolean)
    .join("\n");

  let sent;
  try {
    sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: CONTACT_FROM,
        to: [CONTACT_TO],
        reply_to: email,
        subject,
        text: body,
      }),
    });
  } catch {
    return reply(request, false, 502, "Could not reach the mail service. Please try again.");
  }

  if (!sent.ok) {
    // The provider's own reason is useful in the log and useless to a
    // visitor, so it goes to one and not the other.
    console.error("resend failed", sent.status, await sent.text());
    return reply(request, false, 502, "That didn't go through. Please try again in a moment.");
  }

  // File it in the pipeline too. Deliberately after the email and
  // deliberately unable to fail the request: the visitor's experience must not
  // depend on an ERP being reachable, and an email that arrived is better than
  // a 500 on the contact page of a site making a first impression.
  await fileInPipeline(env, { name, email, company, reason, message });

  return reply(request, true, 200, "Thanks — your message is on its way.");
}

/**
 * Best-effort hand-off to Majal.
 *
 * Everything here is swallowed on purpose. A misconfigured URL, an ERP that is
 * down for an upgrade, a slow response — none of them are the visitor's
 * problem, and none of them should turn a successful enquiry into an error
 * page. Failures go to the Pages log, where somebody can find them.
 */
async function fileInPipeline(env, submission) {
  const { MAJAL_INBOUND_URL, MAJAL_INBOUND_SECRET } = env;
  if (!MAJAL_INBOUND_URL || !MAJAL_INBOUND_SECRET) return;

  try {
    const response = await fetch(MAJAL_INBOUND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Odoo's type="json" routes expect JSON-RPC rather than a bare object.
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { ...submission, secret: MAJAL_INBOUND_SECRET },
      }),
    });
    if (!response.ok) {
      console.error("majal inbound failed", response.status);
    }
  } catch (error) {
    console.error("majal inbound unreachable", error);
  }
}
