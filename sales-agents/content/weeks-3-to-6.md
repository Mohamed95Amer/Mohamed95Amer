# Weeks 3–6 — twelve more posts

Same rules as the first fortnight: personal LinkedIn profile, three a week,
answer every comment the same day. Nothing invented — every specific below is
something Majal actually does or something written up in its own insight
articles.

With the first six, this is six weeks of runway. By then the engine should be
running and the Content agent takes over the drafting.

---

## Week 3

### Post 7 · EN · BIM
> Attach: `website/assets/img/shot-bim-original.png` and `shot-bim-viewer.png`
> — the before/after is the whole post

```
Open a structural IFC in most viewers and you get confetti.

Twenty saturated tones, every one of them meaning something, none of them
answering a question.

That is not the viewer being lazy. A real structural export is not a neutral
geometric description — Tekla writes "Object coloring: ByObjectClass" into the
header and ships a styled item per class. Draw the file faithfully and you get
twenty colours on screen at once.

The deeper objection is that those colours are not true. Concrete is one colour
in life. A slab and a beam are not different colours on a site; they are
different shapes. Shape, shadow and edges tell them apart, and they do it
without a legend — nobody has ever needed a key to identify a stair.

So Majal's default is one neutral material with drawn edges, and colour is kept
for answering a question you actually asked. Open items. Overdue inspections.
What is blocked.

If everything is coloured, nothing is highlighted.
```

### Post 8 · EN · RFIs
> Attach: none

```
The most useful field on an RFI is not the question.

It is whose turn it is.

"Ball in court" sounds like project-management jargon until you watch a
fortnight disappear because the contractor thought the consultant had it and
the consultant thought it was still under review. Nobody was ignoring it.
Nobody could see it either.

In Majal the court flips automatically when the RFI moves. Submitted — it is
theirs. Answered — it is back with you. Overdue and still in someone's court —
a reminder goes, without anyone having to be the person who chases.

The register is not the point. The register is where RFIs go to be forgotten
politely. The point is that at any moment, one name is on it.
```

### Post 9 · AR · approvals
> Attach: `website/assets/img/shot-approval-inbox.png`

```
أربعة عشر زر اعتماد.

هذا ما وجدته حين راجعت نظامنا الخاص للمقاولات. كل وحدة طوّرت زرها الخاص.

المشكلة الأولى: لا يمكن التعبير عن حد مالي إطلاقاً. أمر تغييري بخمسة آلاف
وآخر بخمسة ملايين يأخذان النقرة نفسها من الشخص نفسه. لا يوجد مكان في النظام
تقول فيه «فوق ربع مليون، يوقّع المجلس». كل شركة مقاولات لديها تفويض صلاحيات،
والبرنامج الذي لا يستطيع تمثيله يترك ذلك التفويض في وثيقة سياسات لا يفتحها أحد.

والمشكلة الثانية أخطر: إخفاء الزر ليس منعاً. الزر مخفي، لكن الإجراء نفسه ما
زال قابلاً للاستدعاء. أي أن مهندس الكميات — الشخص الذي يُعِدّ المستخلص — كان
يستطيع اعتماد المستخلص.

إذا كنتم تديرون شركة مقاولات، فالأمر يستحق عشر دقائق من وقت أحدهم: افتحوا
نظامكم، واسألوا هل يستطيع من يرفع الأمر التغييري أن يعتمده. لا هل الزر مخفي —
بل هل الإجراء مرفوض.
```

---

## Week 4

### Post 10 · EN · commercial / retention
> Attach: `website/assets/img/shot-retention-release.png`

```
Retention is the most expensive money in contracting, and the least managed.

Five per cent of every certificate, held for a year or more. On a portfolio of
any size that is a working-capital position, not an accounting detail.

Most contractors I speak to can tell me the percentage. Far fewer can tell me,
today, without opening a spreadsheet:

— how much is held across all live projects
— which release is due this quarter
— which defects liability period expires next month
— which certificate the release is actually attached to

That last one is where it goes wrong. The release is a line in a valuation, the
DLP is a date in a contract, and the defect that would block it is in somebody's
snagging list. Three systems, three owners, and no alarm when the date passes.

Majal keeps retention on the certificate that created it, with the release
schedule and the liability period attached. Not clever. Just in one place.
```

### Post 11 · EN · field / permits
> Attach: none

```
A permit to work expires at four o'clock.

Who needs to know? Not the safety office. Not the project manager. The
supervisor standing under it.

That sounds obvious and almost no system does it. Permits get filed against the
project, or the contractor, or the work package — and the person whose crew is
in the excavation finds out when someone comes to tell them.

When we built the HSE register in Majal, the supervisor is the assignment. The
permit appears on their screen, it warns them before it lapses, and the whole
of "My Day" is ordered by how much trouble it causes to ignore.

Software for construction spends a lot of effort on reporting upwards. Most of
the risk is downwards.
```

### Post 12 · EN · programme
> Attach: `website/assets/img/shot-dashboard.png`

```
"We're two weeks behind" is not a programme position. It is a feeling.

The question is which two weeks, on what, and whether any of it is on the
critical path — because slipping an activity with eleven days of float is not
the same event as slipping one with none, and calling both "behind" hides the
only distinction that matters.

Majal computes it properly: WBS, typed dependencies — finish-to-start,
start-to-start, finish-to-finish, start-to-finish, each with lag — early and
late dates, total float, and the critical path derived rather than declared.
Against a baseline, so variance is a number and not a memory.

This is not a new idea. Primavera has done it for decades. The new part is that
it sits next to the BOQ, the variations and the site records instead of in a
file on one planner's laptop that everyone else sees as a PDF on Sunday.
```

---

## Week 5

### Post 13 · EN · seats
> Attach: none

```
Per-seat pricing quietly decides who is allowed to use your system.

I have watched it happen. A contractor buys twelve licences for a tool the
whole site needs. The foremen do not get one. So the foremen keep using
WhatsApp, and the system that was bought to be the single source of truth
becomes the place where half the information eventually arrives, late, retyped
by someone who was not there.

The tool did not fail. The pricing model chose the failure.

Majal is built on open source and does not meter your own team. Site staff,
engineers, QS — everyone who needs it. Subcontractors get free portal accounts,
because a subcontractor who cannot see the drawing revision will build the old
one.

You should be deciding who needs access on operational grounds. Not licensing
ones.
```

### Post 14 · EN · Arabic
> Attach: `website/assets/img/shot-rtl-arabic.png`

```
A translated interface is not an Arabic one.

Translate the strings and you get Arabic words in a left-to-right layout: the
navigation still opens from the left, the table still reads left to right, the
form labels sit on the wrong side of their fields, and the numbers in a BOQ
column line up the way an English speaker expects.

Everyone can read it. Nobody can work in it quickly.

Doing it properly means the stylesheet is genuinely mirrored, not flipped —
which is a build step, and one that has to survive every UI change afterwards
or it rots. It means dates, currency and digit shaping. It means the PDF
outputs too, because a valuation that reads correctly on screen and wrongly on
paper has solved nothing.

Majal is Arabic and English, both directions, same system. Not a language pack.

If you are buying software for a site in Cairo, Riyadh or Dubai: open it in
Arabic before the demo ends. Ten seconds tells you which one you are looking at.
```

### Post 15 · AR · seats
> Attach: none

```
التسعير على المستخدم يقرر — بهدوء — من يُسمح له باستخدام نظامكم.

رأيت هذا يحدث. شركة مقاولات تشتري اثني عشر ترخيصاً لأداة يحتاجها الموقع كله.
المشرفون لا ينالون ترخيصاً. فيستمر المشرفون على واتساب، ويتحوّل النظام الذي
اشتريتموه ليكون المصدر الوحيد للحقيقة إلى المكان الذي تصل إليه نصف المعلومات
متأخرة، وقد أعاد كتابتها شخص لم يكن حاضراً.

الأداة لم تفشل. نموذج التسعير هو الذي اختار الفشل.

«مجال» مبني على مصادر مفتوحة ولا يَعُدّ فريقكم. موظفو الموقع والمهندسون
ومهندسو الكميات — كل من يحتاجه. ومقاولو الباطن لهم حسابات بوابة مجانية، لأن
مقاول الباطن الذي لا يرى المراجعة الحالية للمخطط سينفّذ المراجعة القديمة.

قرار من يحصل على صلاحية يجب أن يكون تشغيلياً، لا ترخيصياً.
```

---

## Week 6

### Post 16 · EN · drawings
> Attach: `website/assets/img/shot-transmittal.png`

```
The most expensive drawing on a site is the superseded one somebody is still
building from.

Every contractor has a version of this story. Rev C went out. Rev D was issued
three weeks later. Somebody had Rev C open on a tablet, or printed, or in an
email thread, and the wall went up to the old dimension.

The fix is not "send a transmittal". Everyone sends transmittals. The fix is
that there is one place where the current revision is unambiguous, superseded
revisions remain searchable but are visibly not current, and the record of who
was issued what survives the argument afterwards.

Majal's drawing register keeps the history rather than overwriting it. Upload a
multi-page PDF set and it parses the numbers and revisions from the filenames,
because the alternative is somebody typing four hundred drawing numbers by hand
and making the mistake that starts this post.
```

### Post 17 · EN · backups, part two
> Attach: none

```
Who, in your company, is structurally able to restore the system?

Not "who knows how". Who has the access, right now, without asking anybody.

If that is one person, you do not have a recovery position. You have a
dependency with a holiday allowance.

I wrote a while back that a backup you have never restored is a hypothesis. The
part people push back on is this one — because the honest answer is usually
"our IT guy", or worse, "the vendor", and the second one means your recovery
time is somebody else's support queue.

Three questions worth asking this week:

1. When did we last restore, on purpose, to check?
2. Did that restore include the filestore — the drawings, the photos, the
   signed permits — or only the database?
3. If the person who does it is unreachable, what happens?

None of these need a new system to answer. They need somebody to ask.
```

### Post 18 · EN · the offer
> Attach: `website/assets/video/majal-construction-walkthrough.soundtrack-v2.mp4`

```
Six weeks of posting about how construction software gets built. Here is the
thing itself.

Twelve minutes, no slides: BOQ to variation to valuation, programme against
baseline with the critical path isolated, pin an issue on a drawing and it
becomes an owned record, and the field app that works when the basement has no
signal.

Arabic and English, both directions.

If you run a contracting business in the UAE, Saudi or Egypt and any of the last
six weeks has described your month — I will show you the system properly, on
your own project structure rather than a generic sandbox. Thirty minutes.

Message me and we will find a time.
```

---

## After week 6

By now the pipeline should be running and the Content agent drafts from the
same source material — `construction-erp/docs/` and the insight articles — into
the approval queue.

Watch which of these earned replies rather than likes. A like is politeness. A
comment is interest, and a comment from a commercial manager at a contractor you
have never met is the whole point of six weeks of writing.
