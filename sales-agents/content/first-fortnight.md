# First fortnight — ready to post

Copy, paste, post. Nothing here needs Odoo, Ollama, an API key or a lead list.
Three posts a week for two weeks, on **your personal LinkedIn profile** — not
the company page. Founder-led posting outperforms a brand page in B2B, and it
is also the only one that needs no approval from LinkedIn.

Every claim below comes from Majal's own articles, docs or product. **Nothing
is invented.** There are no customer names, no results and no numbers Majal
cannot show, because the first one you make up is the one you get asked about
in a meeting.

**Cadence:** Mon / Wed / Sun, roughly 09:00 Gulf time. Post, then answer every
comment the same day — the replies are where the interest actually forms.

---

## Week 1

### Post 1 — Monday · EN · pillar: approval trails
> Attach: `website/assets/img/shot-approval-inbox.png`

```
Fourteen approve buttons.

That is what I found when I audited our own construction suite. Every module
had grown its own, each one guarded by a "groups" attribute in the view.

Two problems with that, and the second is the kind an auditor finds after the
money has moved.

The first: a threshold could not be expressed at all. A variation of five
thousand and a variation of five million took the same single click from the
same person. There was nowhere to say "above a quarter of a million, the board
signs". Every contractor has a delegation of authority. Software that cannot
represent one leaves it living in a policy document nobody opens.

The second: a "groups" attribute is a UI instruction. It hides the button. It
does not stop the method. A quantity surveyor — the person who writes the bill
— could approve the bill. It took four lines of console output to prove it.

If you run a contracting business, that is worth ten minutes of somebody's
afternoon. Open your system. Find out whether the person who raises a variation
can also approve it. Not whether the button is hidden — whether the action is
refused.

I wrote up what replaced it: majalops.com/insights/approval-trails.html
```

### Post 2 — Wednesday · EN · pillar: commercial leakage
> Attach: `website/assets/img/shot-exposure.png`

```
A question I ask every contractor I meet:

Once a variation is approved on site, how long until it reaches a payment
application?

The answer is almost always "weeks". Sometimes nobody knows, which is worse.

Here is why it matters. That gap is invisible while it is happening. The work
is done, the cost is incurred, the certified value has not moved. Margin is
leaving the project in real time and the only place it shows up is closeout —
by which point the conversation is a claim, not a correction.

Most contractors are not missing a report. They are missing the link between
three registers that live in three different places: the BOQ, the variation
register, and the valuation.

We built Majal so those are one system. Contract value, certified value,
committed cost and outstanding change, for every live project, on one page.

Not because a dashboard is exciting. Because you cannot manage a number you
only see at the end.
```

### Post 3 — Sunday · AR · pillar: commercial leakage
> Attach: `website/assets/img/shot-exposure.png`

```
سؤال أطرحه على كل مقاول أقابله:

بعد اعتماد الأمر التغييري في الموقع، كم يستغرق حتى يظهر في مستخلص؟

الإجابة في الغالب: أسابيع. وأحياناً لا أحد يعرف، وهذا أسوأ.

المشكلة أن هذه الفجوة لا تُرى وهي تحدث. العمل نُفّذ، والتكلفة تحمّلت، والقيمة
المعتمدة لم تتحرك. الهامش يتآكل في الوقت الحقيقي، ولا يظهر إلا عند التسليم
النهائي — وعندها يصبح الحديث مطالبة، لا تصحيحاً.

معظم المقاولين لا ينقصهم تقرير. ينقصهم الربط بين ثلاثة سجلات تعيش في ثلاثة
أماكن مختلفة: جدول الكميات، وسجل الأوامر التغييرية، والمستخلص.

بنينا «مجال» ليكون الثلاثة نظاماً واحداً. قيمة العقد، والقيمة المعتمدة،
والتكلفة الملتزم بها، والتغييرات المعلّقة — لكل مشروع قائم، في صفحة واحدة.

ليس لأن لوحة المؤشرات مثيرة، بل لأنك لا تستطيع إدارة رقم لا تراه إلا في النهاية.
```

---

## Week 2

### Post 4 — Monday · EN · pillar: offline on site
> Attach: `website/assets/img/shot-defect-mobile.png`

```
"We need a mobile app" is three different requests wearing the same coat.

One is nearly free. One is about a week. One is a disconnected site
environment and a different budget entirely.

1. "I want to open it on my phone." That is responsive web. If your system
   already works in a browser, you are mostly done.

2. "I want it on my home screen and I want the camera." That is a PWA. Days,
   not months.

3. "The basement has no signal and my engineer still has to close out
   twenty inspections." That is offline-first — a sync queue, conflict
   handling, and deciding what a device is allowed to do while it cannot
   check with anyone.

Telling them apart before you quote is most of the work.

And the third one has a rule the first two do not need: some things must stay
online. Approvals, signatures, financial posting, deletion. A device that has
not spoken to the server in six hours should not be authorising anything.

Full write-up: majalops.com/insights/offline-on-site.html
```

### Post 5 — Wednesday · EN · pillar: verified recovery
> Attach: none — text carries this one

```
"We take backups" is not a recovery position.

A backup you have never restored is a hypothesis.

Four things separate a real recovery point from a file that happens to be
large:

— What is actually inside it. A construction ERP's most irreplaceable content
  is not in the database. It is the drawings, the site photos, the signed
  permits, the approved PDFs. Restore a dump without the filestore and you get
  a system that knows an attachment exists, references it on a record, and
  cannot produce it. That is worse than an outage, because it looks like it
  worked.

— Whether anything checks it. An unverified backup is a job that exited zero.

— Whether the retention label is true. "We keep 30 days" is a claim until
  somebody asks for day 29.

— Who is structurally able to trigger a restore. If that is one person and
  they are on leave, you do not have a recovery position, you have a
  dependency.

If you run projects where losing the drawing register would be a legal problem
and not just an IT problem, this is worth an afternoon.

majalops.com/insights/verified-recovery.html
```

### Post 6 — Sunday · EN · pillar: product
> Attach: `website/assets/video/majal-construction-walkthrough.soundtrack-v2.mp4`

```
Twelve minutes of Majal Construction, no slides.

BOQ to variation to valuation, with the site records attached to the same job
rather than living in a WhatsApp thread. Programme against baseline with the
critical path isolated. Pin an issue on the drawing and it becomes an owned
record with a due date, not a comment.

Arabic and English, both directions, same system.

Built on Odoo Community and open source, so there is no per-seat meter telling
you which of your own site team is allowed to use it.

If you run a contracting business in the UAE, Saudi or Egypt and any of that
sounds like a week you have had, I am happy to walk you through it properly.
```

---

## What to do in the comments

The posts are the easy half. Interest forms in the replies.

- Answer every comment the same day. A comment is a warmer signal than a like
  and most people never follow up on one.
- When somebody says "how does X work" — answer the question. Do not pivot to a
  demo. The demo offer lands after you have been useful once.
- When somebody describes their own version of the problem, ask one specific
  follow-up. That is a conversation, and conversations are what this is for.
- Anyone who engages twice: look them up, and if they fit, that is a warm lead.
  Once the pipeline is running, log them with source `inbound_social`.

## What not to do

- No customer names, no results, no "we helped X save Y". Majal has no
  published case studies yet, and inventing one is a question you cannot
  answer in a commercial meeting.
- No pricing in public. It is negotiated live, with you.
- No posting three times in a day and then going quiet for a fortnight. Three
  a week, sustained, beats a burst every time.
