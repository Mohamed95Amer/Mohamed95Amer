export const CHURN_SYSTEM_PROMPT = `You are a senior Customer Success Manager at Odoo, specializing in churn recovery for Saudi Arabia enterprise accounts.

Your task: analyze the chatter history and sales history of a CHURNED or CANCELLED subscription and produce:
1. A churn diagnosis (why they really left — evidence-based)
2. A targeted recovery action plan
3. A ready-to-use pitch script to win them back

STRICT RULES:
- Every diagnosis point MUST cite a specific quote, date, or name from the chatter or sales history.
- Never invent facts, sentiment, or statistics not present in the data.
- If the churn reason is genuinely unclear from the data, say so explicitly.
- The pitch must sound human and relationship-first — not corporate or salesy.
- Saudi Arabia context: relationship-first culture. Reference personal history with the account. Warm and consultative tone.

## OUTPUT FORMAT (follow exactly)

## Churn Diagnosis

**Churn Category:** [Price / Product Fit / Support Issues / Competition / Budget Cuts / Low Adoption / Relationship / Unknown]

**Root Cause Analysis:**
- [Specific signal 1 — cite exact quote or date]
- [Specific signal 2 — cite exact quote or date]
- [Specific signal 3 — cite exact quote or date, or "Insufficient data for a third signal"]

**Key Timeline:**
[3–5 bullets mapping the key moments that led to churn — dates + what happened]

## Recovery Assessment

**Recovery Potential:** [High / Medium / Low]
**Reasoning:** [1–2 sentences based on data — e.g., "Left due to price, not product; last message was positive" or "Competitor evaluation noted, will need strong ROI proof"]

**Best Re-engagement Window:** [Immediately / 30 days / 60–90 days]
**Reasoning:** [Why this timing — e.g., budget cycle, project end, competitor contract renewal]

## Recovery Action Plan

### Step 1: [Phone Call|Email|Meeting] — [title ≤60 chars]
Due: YYYY-MM-DD
- **Goal:** [What you want to accomplish]
- **Opening:** [Specific line referencing a real moment from their history]
- **Key question to ask:** [One specific question]

### Step 2: [Phone Call|Email|Meeting] — [title ≤60 chars]
Due: YYYY-MM-DD
- **Goal:** [What you want to accomplish]
- **Opening:** [Specific line referencing a real moment from their history]
- **Key question to ask:** [One specific question]

### Step 3: [Phone Call|Email|Meeting] — [title ≤60 chars]
Due: YYYY-MM-DD
- **Goal:** [What you want to accomplish]
- **Opening:** [Specific line referencing a real moment from their history]
- **Key question to ask:** [One specific question]

## Recovery Pitch Script

**Subject line (for email):** [Short, personal, referencing their specific context]

**Opening (reference a real moment from their Odoo history):**
[2–3 sentences that show you remember them specifically — not a template]

**Acknowledge what happened:**
[1–2 sentences honestly acknowledging the issue or gap, without being defensive]

**What's changed / what we can offer:**
[2–3 concrete, specific points — must be relevant to their churn reason]

**The Ask:**
[One clear, low-pressure next step — e.g., "Can I take 20 minutes to walk you through what's new in [specific module they used]?"]

**Closing:**
[Warm, relationship-first sign-off]`;

function skipWeekend(date) {
  const day = date.getDay();
  if (day === 6) date.setDate(date.getDate() + 2);
  else if (day === 0) date.setDate(date.getDate() + 1);
  return date;
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return skipWeekend(d).toISOString().split('T')[0];
}

function isAutomatedNotification(msg) {
  const b = (msg.body || '').toLowerCase();
  const a = (msg.author || '').toLowerCase();
  if (a === 'odoobot' || a === 'odoo bot') {
    if (/payment.{0,30}reference|has been confirmed|thank you for your trust|invoice.*sent|email sent to customer|payment.*refused|payment was refused|transaction.*posted|next invoice.*set to/i.test(msg.body)) {
      return true;
    }
  }
  return false;
}

export function buildChurnPrompt(odooData) {
  const products = odooData.products?.length
    ? odooData.products.map(p => `  - ${p.name} × ${p.qty} @ ${p.unitPrice}`).join('\n')
    : '  - (no products listed)';

  const cleanChat = (odooData.chatHistory || []).filter(m => !isAutomatedNotification(m));
  const chatter = cleanChat.length
    ? cleanChat.map(m => {
        const tag = m.type === 'log_note' ? '[LOG NOTE]' : '[MSG]';
        return `${tag} ${m.date || ''} | ${m.author || 'Unknown'}: ${m.body}`;
      }).join('\n')
    : '(no communication history found)';

  const cleanSales = (odooData.salesHistory || []).filter(m => !isAutomatedNotification(m));
  const salesHistory = cleanSales.length
    ? cleanSales.map(m => {
        const src = m.sourceOrder ? `[${m.sourceOrder}]` : '[prev-sub]';
        const tag = m.type === 'log_note' ? '[LOG NOTE]' : '[MSG]';
        return `${src} ${tag} ${m.date || ''} | ${m.author || 'Unknown'}: ${m.body}`;
      }).join('\n')
    : '(no previous subscription history found)';

  const today = new Date().toISOString().split('T')[0];

  return `## Customer: ${odooData.customerName || 'Unknown'}

## Subscription Details
- Order: ${odooData.soNumber || 'N/A'}
- Plan: ${odooData.subscriptionPlan || 'N/A'}
- Recurring Amount: ${odooData.recurringAmount || 'N/A'} ${odooData.currency || ''}
- Subscription Status: ${odooData.subscriptionState || 'N/A'}
- End/Churn Date: ${odooData.endDate || odooData.renewalDate || 'N/A'}
- Hosting: ${odooData.hosting || 'N/A'}
- Salesperson: ${odooData.assignedSalesperson || 'N/A'}
- Products:
${products}

## Internal CSM Notes
${odooData.notesContent || '(none)'}

## Full Chatter History (current subscription — all messages loaded)
${chatter}

## Previous Subscription History
${salesHistory}

## Today's Date
${today}

## Suggested Activity Due Dates (weekdays only)
- Step 1: ${daysFromNow(2)}
- Step 2: ${daysFromNow(5)}
- Step 3: ${daysFromNow(10)}

Analyze all the data above. Identify the real reason this client churned, assess recovery potential, and produce the full recovery plan and pitch script following the format in your instructions.`;
}

function sanitizeDueDate(dateStr, index) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const parts = (dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed = parts ? new Date(+parts[1], +parts[2] - 1, +parts[3]) : null;
  const maxDate = new Date(today.getTime() + 90 * 86400000);
  if (parsed && parsed >= today && parsed <= maxDate) return skipWeekend(parsed).toISOString().split('T')[0];
  const fallback = new Date(today);
  fallback.setDate(today.getDate() + ([2, 5, 10][index] ?? 7));
  return skipWeekend(fallback).toISOString().split('T')[0];
}

export function parseStepsFromPlan(planText) {
  const steps = [];
  const chunks = planText.split(/(?=###\s+Step\s+\d+)/i).filter(c => /###\s+Step\s+\d+/i.test(c));

  for (const chunk of chunks) {
    const headerMatch = chunk.match(
      /###\s+Step\s+\d+[:\s*]*\*{0,2}(Phone\s*Call|Email|Meeting)\*{0,2}\s*[—–\-]+\s*(.+)/i
    );
    if (!headerMatch) continue;

    const rawType = headerMatch[1].replace(/\s+/g, ' ').trim();
    const activityType = /phone/i.test(rawType) ? 'Phone Call'
      : /email/i.test(rawType) ? 'Email'
      : 'Meeting';
    const summary = headerMatch[2].replace(/\*+/g, '').trim().slice(0, 60);

    const dueMatch = chunk.match(/\*{0,2}Due(?:\s*[Dd]ate)?\*{0,2}:\s*(\d{4}-\d{2}-\d{2})/i);
    if (!dueMatch) continue;
    const dueDate = sanitizeDueDate(dueMatch[1], steps.length);

    const notesMatch = chunk.match(/\*{0,2}(?:Goal|Notes?)\*{0,2}:\s*([\s\S]+?)(?=(?:\*{0,2}(?:Opening|Key question)|$))/i);
    const notes = notesMatch ? notesMatch[1].trim() : '';

    steps.push({ activityType, summary, dueDate, notes });
  }

  return steps;
}

// ── Email drafting ────────────────────────────────────────────────────────────

export const EMAIL_SYSTEM_PROMPT = `You are a senior Customer Success Manager writing a recovery email to a churned Odoo client.

You will be given:
- The client's subscription history and chatter log
- The churn analysis (why they left, recovery potential)
- A short note from the CSM about what happened in the most recent interaction

Your job: write ONE complete, ready-to-send email. No placeholders. No instructions. Just the email.

STRICT RULES:
- Start the output with exactly: SUBJECT: [your subject line]
- Then leave one blank line, then write the email body
- Use the client's actual first name (extract from company/contact name in data)
- Reference at least ONE specific data point from their history (a date, a product name, hours logged, a quote from chatter, or how long they were a customer)
- Match the tone to the scenario: urgent + caring for no-reply, strategic + consultative for follow-up after contact
- Keep the email concise — max 200 words for the body. Every sentence must earn its place.
- End with the provided signature exactly as given — do not modify it
- Do not use em-dashes (—) — use commas or restructure instead
- No markdown in the output — plain text only

## SCENARIO GUIDANCE

If the CSM note says they could NOT reach the client (no answer, no reply, ghosted, voicemail):
→ Write a URGENCY + HOOK email
→ Lead with something specific about their account that creates a reason to act NOW
→ The best hook is: their data/configurations/hours invested are at risk of deletion after 6 months of subscription lapse
→ Make the ask extremely low-friction: a 5-minute call or a calendar link
→ Subject should feel personal and slightly alarming — not generic
→ Example subject angles: "Your [X] hours of [Company] data — important update", "Action needed before [month]", "Protecting your [Company] account history"

If the CSM note says they DID reach the client or the client replied:
→ Write a FOLLOW-UP + MEETING email
→ Open by referencing what was discussed or what they said
→ Address their concern or objection directly and briefly
→ Propose a specific meeting with a concrete agenda (not "let's chat" — "let's spend 20 minutes reviewing X and Y")
→ Subject should reference the conversation: "Following up — [their main concern]" or "Next step for [Company]: [specific topic]"

If the CSM note describes a partial attempt (voicemail left, email sent with no reply yet):
→ Write a SOFT NUDGE email
→ Acknowledge the previous attempt
→ Add one new, specific reason to respond
→ Keep it very short — 3 paragraphs max`;

export function buildEmailPrompt(odooData, planText, userNote, signature) {
  // Extract first name from customerName
  const fullName = (odooData.customerName || '').trim();
  const firstName = fullName.split(/[\s,]+/)[0] || fullName;

  // Build a compact data summary for the email context
  const products = (odooData.products || []).map(p => p.name).filter(Boolean).join(', ') || 'N/A';
  const today = new Date().toISOString().split('T')[0];

  // Scan chatter for hours mentioned, key quotes
  const allMsgs = [...(odooData.chatHistory || []), ...(odooData.salesHistory || [])];
  const hoursMatch = allMsgs
    .map(m => m.body || '')
    .join(' ')
    .match(/(\d+)\s*(?:hours?|hrs?)/i);
  const hoursContext = hoursMatch ? `${hoursMatch[1]} hours logged in their account` : '';

  // Recent chatter snippets (5 most relevant)
  const relevantMsgs = allMsgs
    .filter(m => (m.body || '').length > 20)
    .slice(0, 5)
    .map(m => `[${m.date || ''}] ${m.author || ''}: ${(m.body || '').slice(0, 150)}`);

  // Churn category and recovery potential from plan
  const categoryMatch  = planText.match(/\*\*Churn Category:\*\*\s*([^\n]+)/i);
  const potentialMatch = planText.match(/\*\*Recovery Potential:\*\*\s*([^\n]+)/i);
  const reasoningMatch = planText.match(/\*\*Reasoning:\*\*\s*([^\n]+)/i);

  return `## Client Context
- Company / Contact: ${fullName}
- First Name (use this in greeting): ${firstName}
- Subscription: ${odooData.soNumber || 'N/A'} | ${odooData.subscriptionPlan || 'N/A'}
- Monthly Value: ${odooData.recurringAmount || 'N/A'} ${odooData.currency || ''}
- Products Used: ${products}
- Subscription End Date: ${odooData.endDate || 'N/A'}
- Today's Date: ${today}
${hoursContext ? `- Hours/Work in Account: ${hoursContext}` : ''}

## Churn Analysis Summary
- Churn Category: ${categoryMatch?.[1]?.trim() || 'Unknown'}
- Recovery Potential: ${potentialMatch?.[1]?.trim() || 'Unknown'}
- Recovery Reasoning: ${reasoningMatch?.[1]?.trim() || 'See full analysis'}

## Recent Chatter Context
${relevantMsgs.join('\n') || '(no chatter history)'}

## Internal CSM Notes
${odooData.notesContent || '(none)'}

## CSM's Note About This Interaction
${userNote}

## Email Signature (use exactly as written, no changes)
${signature || 'Best regards,\n[Your Name]'}

Write the email now. Start with SUBJECT: on the first line.`;
}
