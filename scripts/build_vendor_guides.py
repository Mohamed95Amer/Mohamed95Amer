"""Build the two phone-friendly Get Gold vendor setup guides.

The instructions mirror the live vendor routes and visible button labels.
Run with the bundled Codex Python runtime (reportlab, arabic_reshaper, bidi).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from shutil import copyfile

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf"
PUBLIC = ROOT / "public"
WIDTH, HEIGHT = 420, 720  # Tall portrait pages, comfortable on a phone.
JADE = HexColor("#0D4438")
JADE_DARK = HexColor("#102C27")
GOLD = HexColor("#B88A39")
BONE = HexColor("#FAF7F0")
INK = HexColor("#24332E")
MUTED = HexColor("#57655E")
LINE = HexColor("#E7E1D6")

pdfmetrics.registerFont(TTFont("ArialGG", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("ArialGGBold", r"C:\Windows\Fonts\arialbd.ttf"))


@dataclass(frozen=True)
class Step:
    number: str
    title: str
    body: str
    path: str


@dataclass(frozen=True)
class Page:
    kicker: str
    title: str
    subtitle: str
    steps: tuple[Step, ...]
    note: str | None = None


ENGLISH = (
    Page(
        "01 / START",
        "Become a Get Gold vendor",
        "From account creation to your first live listing.",
        (
            Step("01", "Create a vendor account", "Open the link below. Select Vendor; enter your name, UAE phone, email and a unique password of at least 12 characters. Complete the security check, then tap Create vendor account.", "register?role=vendor"),
            Step("02", "Verify your email", "Open the Get Gold verification email and follow its link. Then sign in using the same email. If you do not see the message, check Spam or Junk.", "login?role=vendor&next=/vendor"),
            Step("03", "Fill in store details", "On the application, complete Contact person, Business profile and Store capabilities. Use the official name and number on your trade licence. If Website is Yes, add its link.", "vendor/register"),
            Step("04", "Pin the exact shop location", "Enter the full address. At the shop, tap Use my current location, or paste a Maps link with exact coordinates. Confirm Pin saved appears before submitting.", "vendor/register"),
        ),
    ),
    Page(
        "02 / STORE SETUP",
        "Finish your store setup",
        "A few accurate settings make orders easier to manage.",
        (
            Step("05", "Submit your application", "Trade licence and Emirates ID copies are optional at this first stage (PDF, JPG or PNG; 10 MB each). Tap Submit vendor application. Later uploads are under Store tools & help > Documents.", "vendor/documents"),
            Step("06", "Check approval status", "Open Overview. While Get Gold reviews your store, you can save product drafts. You cannot submit products for approval or receive orders until the store is approved.", "vendor"),
            Step("07", "Choose payment and delivery", "After approval, open Payments & hours. Select your methods (Aani/bank details need review) and own staff or courier. Set one delivery fee per order: 0 means free; pickup has no fee. Tap Save payment & delivery settings.", "vendor/payments"),
            Step("08", "Save your working hours", "On the same page, scroll to When are you open? Set each open day and its hours in UAE time (GMT+4). Tap Save working hours. Requests received while closed wait until you open.", "vendor/payments#working-hours"),
        ),
    ),
    Page(
        "03 / YOUR CATALOGUE",
        "Add your first product",
        "Each piece can have its own weight, making charge and VAT choice.",
        (
            Step("09", "Open Add a product", "From Overview tap + Add a product. Or open Products and tap + Add product. You can save a draft even before store approval.", "vendor/products/new"),
            Step("10", "Enter the exact item details", "Add a clear name, category, gold purity, net gold weight in grams (exclude stones), stock quantity and a description of at least 20 characters. Use quantity 1 for a unique piece. The title and purity must agree.", "vendor/products/new"),
            Step("11", "Upload the real item's photos", "In 2. Photos, choose at least one actual product photo. The first image is the cover; you can reorder it. Maximum: 8 photos, 5 MB each. Wait until upload finishes before saving.", "vendor/products/new#piece-photos"),
            Step("12", "Set charges and VAT", "In 3. Charges & VAT, enter making per item, not per gram; 0 is allowed. Add certificate fee only with its reference. For bars/coins add a certificate reference or hallmark. Choose the correct VAT treatment for your business.", "vendor/products/new#piece-pricing"),
        ),
    ),
    Page(
        "04 / PUBLISH & SELL",
        "Review, publish, respond",
        "Customers pay your store only after you confirm availability and price.",
        (
            Step("13", "Review and submit", "Check the Listing preview and Ready for review? list. Tap Save draft to return later, or Submit for review after your store is approved. Get Gold must approve the listing before it appears publicly.", "vendor/products/new#piece-review"),
            Step("14", "Keep stock current", "Open Products to see Drafts, In review, Approved and Needs attention. Tap Edit product to correct details. Use the stock-check button only after physically checking the item in your store.", "vendor/products"),
            Step("15", "Handle a buyer request", "Open Orders > Confirm requests. Confirm the piece is available and send the final current price. The buyer accepts before paying your store. For transfers, check cleared funds in your account; a screenshot alone is not proof.", "vendor/orders?filter=requests"),
        ),
        "Need help listing? Open Store tools & help > Catalogue help, or email support@getgold.ae.",
    ),
)


ARABIC = (
    Page(
        "٠١ / البداية",
        "ابدأ البيع على Get Gold",
        "من إنشاء الحساب إلى نشر أول منتج.",
        (
            Step("٠١", "أنشئ حساب متجر", "افتح الرابط أدناه واختر «متجر». أدخل اسمك ورقم هاتفك الإماراتي وبريدك الإلكتروني وكلمة مرور فريدة من ١٢ حرفاً على الأقل. أكمل فحص الأمان واضغط «إنشاء حساب متجر».", "register?role=vendor"),
            Step("٠٢", "أكد بريدك الإلكتروني", "افتح رسالة التحقق من Get Gold واتبع الرابط فيها، ثم سجّل الدخول بالبريد نفسه. إن لم تجد الرسالة، تحقق من مجلد الرسائل غير المرغوب فيها.", "login?role=vendor&next=/vendor"),
            Step("٠٣", "أكمل بيانات المتجر", "في طلب التسجيل، أكمل «بيانات التواصل» و«ملف النشاط» و«إمكانات المتجر». استخدم الاسم والرقم الرسميين في الرخصة. إذا اخترت «نعم» للموقع الإلكتروني فأضف رابطه.", "vendor/register"),
            Step("٠٤", "ثبّت موقع المتجر بدقة", "أدخل العنوان الكامل. وأنت داخل المتجر، اضغط «استخدم موقعي الحالي» أو ألصق رابط خريطة يحوي إحداثيات دقيقة. تأكد من ظهور «تم حفظ الدبوس» قبل الإرسال.", "vendor/register"),
        ),
    ),
    Page(
        "٠٢ / إعداد المتجر",
        "أكمل إعداد متجرك",
        "بضع إعدادات دقيقة تجعل إدارة الطلبات أسهل.",
        (
            Step("٠٥", "أرسل طلب الانضمام", "نسختا الرخصة والهوية الإماراتية اختياريتان في الطلب الأول (PDF أو JPG أو PNG، حتى ١٠ ميغابايت لكل ملف). اضغط «إرسال طلب المتجر». ويمكنك رفع الملفات لاحقاً من «أدوات المتجر والمساعدة» ثم «المستندات».", "vendor/documents"),
            Step("٠٦", "تابع حالة الاعتماد", "افتح «نظرة عامة». أثناء مراجعة Get Gold لمتجرك يمكنك حفظ مسودات المنتجات، لكن لا يمكنك إرسالها للمراجعة أو استقبال الطلبات حتى اعتماد المتجر.", "vendor"),
            Step("٠٧", "اختر الدفع والتوصيل", "بعد الاعتماد، افتح «الدفع والدوام». حدد طرق الدفع (بيانات آني والبنك تحتاج مراجعة)، واختر موظفيك أو شركة التوصيل. حدد رسم توصيل واحداً للطلب؛ الصفر يعني مجاناً والاستلام بلا رسوم. اضغط «حفظ إعدادات الدفع والتوصيل».", "vendor/payments"),
            Step("٠٨", "احفظ مواعيد العمل", "في الصفحة نفسها، انتقل إلى «ما هي مواعيد العمل؟». حدد أيام الفتح وساعاته بتوقيت الإمارات (GMT+4)، ثم اضغط «حفظ مواعيد العمل». الطلبات خارج الدوام تنتظر موعد الفتح.", "vendor/payments#working-hours"),
        ),
    ),
    Page(
        "٠٣ / الكتالوج",
        "أضف منتجك الأول",
        "لكل قطعة وزنها ومصنعيّتها وخيارها الضريبي الخاص.",
        (
            Step("٠٩", "افتح إضافة منتج", "من «نظرة عامة» اضغط «+ إضافة منتج». أو افتح «المنتجات» ثم «+ إضافة منتج». يمكنك حفظ مسودة حتى قبل اعتماد المتجر.", "vendor/products/new"),
            Step("١٠", "أدخل بيانات القطعة بدقة", "أضف اسماً واضحاً وفئة وعياراً ووزن الذهب الصافي بالغرام (دون الأحجار) وكمية ووصفاً لا يقل عن ٢٠ حرفاً. استخدم الكمية ١ للقطعة الفريدة. يجب أن يتطابق العيار في الاسم مع العيار المختار.", "vendor/products/new"),
            Step("١١", "ارفع صور المنتج الفعلي", "في «٢. الصور» اختر صورة حقيقية واحدة على الأقل. الصورة الأولى هي الرئيسية ويمكنك تغيير ترتيب الصور. الحد الأقصى ٨ صور، ٥ ميغابايت للصورة. انتظر اكتمال الرفع قبل الحفظ.", "vendor/products/new#piece-photos"),
            Step("١٢", "حدد الرسوم والضريبة", "في «٣. الرسوم والضريبة» أدخل مصنعية القطعة، لا مصنعية الغرام؛ ويجوز أن تكون صفراً. عند إضافة رسوم شهادة أدخل مرجعها. للسبائك والعملات أضف مرجع شهادة أو بيانات دمغة. اختر المعاملة الضريبية الصحيحة لنشاطك.", "vendor/products/new#piece-pricing"),
        ),
    ),
    Page(
        "٠٤ / النشر والبيع",
        "راجع وانشر وتابع الطلبات",
        "لا يدفع العميل لمتجرك إلا بعد تأكيدك التوفر والسعر.",
        (
            Step("١٣", "راجع المنتج وأرسله", "راجع «معاينة المنتج» وقائمة «جاهز للمراجعة؟». اضغط «حفظ مسودة» للعودة لاحقاً، أو «إرسال للمراجعة» بعد اعتماد متجرك. لا يظهر المنتج للعموم إلا بعد اعتماد Get Gold له.", "vendor/products/new#piece-review"),
            Step("١٤", "حدّث المخزون", "افتح «المنتجات» لمتابعة «المسودات» و«قيد المراجعة» و«معتمدة» و«تحتاج إلى مراجعة». اضغط «تعديل المنتج» للتصحيح. أكد المخزون فقط بعد فحص القطعة فعلياً في المتجر.", "vendor/products"),
            Step("١٥", "تعامل مع طلب الشراء", "افتح «الطلبات» ثم «تأكيد الطلبات». أكد توفر القطعة وأرسل سعرها النهائي الحالي. يقبل العميل السعر قبل أن يدفع لمتجرك. في التحويلات، تأكد من وصول المال إلى حسابك؛ صورة الإيصال وحدها لا تكفي.", "vendor/orders?filter=requests"),
        ),
        "تحتاج مساعدة؟ افتح «أدوات المتجر والمساعدة» ثم «مساعدة الكتالوج»، أو راسل support@getgold.ae.",
    ),
)


def rtl_text(text: str) -> str:
    return get_display(arabic_reshaper.reshape(text), base_dir="R")


def text_width(text: str, font: str, size: float, arabic: bool) -> float:
    return pdfmetrics.stringWidth(rtl_text(text) if arabic else text, font, size)


def wrap_words(text: str, width: float, font: str, size: float, arabic: bool) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        trial = f"{current} {word}" if current else word
        if current and text_width(trial, font, size, arabic) > width:
            lines.append(current)
            current = word
        else:
            current = trial
    if current:
        lines.append(current)
    return lines


def draw_text(c: canvas.Canvas, text: str, x: float, y: float, *, arabic: bool, font: str, size: float, color=INK) -> None:
    c.setFillColor(color)
    c.setFont(font, size)
    if arabic:
        c.drawRightString(x, y, rtl_text(text))
    else:
        c.drawString(x, y, text)


def draw_lines(c: canvas.Canvas, text: str, x: float, y: float, width: float, *, arabic: bool, font: str, size: float, leading: float, color=INK) -> float:
    lines = wrap_words(text, width, font, size, arabic)
    for line in lines:
        draw_text(c, line, x, y, arabic=arabic, font=font, size=size, color=color)
        y -= leading
    return y


def draw_step(c: canvas.Canvas, step: Step, y_top: float, arabic: bool) -> float:
    x = 27
    width = WIDTH - 54
    body_font = "ArialGG"
    title_font = "ArialGGBold"
    body_size = 10.4 if arabic else 10.2
    leading = 14.2
    text_width_available = width - (84 if arabic else 68)
    body_lines = wrap_words(step.body, text_width_available, body_font, body_size, arabic)
    height = 51 + leading * len(body_lines) + 19
    c.setFillColor(HexColor("#FFFFFF"))
    c.setStrokeColor(LINE)
    c.roundRect(x, y_top - height, width, height, 11, stroke=1, fill=1)
    badge_x = x + width - 33 if arabic else x + 33
    c.setFillColor(JADE)
    c.circle(badge_x, y_top - 28, 17, stroke=0, fill=1)
    c.setFillColor(HexColor("#FFFFFF"))
    c.setFont("ArialGGBold", 10)
    c.drawCentredString(badge_x, y_top - 31, rtl_text(step.number) if arabic else step.number)
    text_x = x + width - 58 if arabic else x + 58
    draw_text(c, step.title, text_x, y_top - 26, arabic=arabic, font=title_font, size=11.8, color=JADE_DARK)
    draw_lines(c, step.body, text_x, y_top - 44, text_width_available, arabic=arabic, font=body_font, size=body_size, leading=leading, color=MUTED)
    link_y = y_top - height + 12
    path_text = f"getgold.ae/{step.path}"
    c.setFont("ArialGGBold", 8.1)
    c.setFillColor(JADE)
    if arabic:
        c.drawRightString(x + width - 20, link_y, path_text)
    else:
        c.drawString(x + 58, link_y, path_text)
    c.linkURL(f"https://{path_text}", (x, y_top - height, x + width, y_top), relative=0)
    return y_top - height - 9


def draw_page(c: canvas.Canvas, page: Page, index: int, total: int, arabic: bool) -> None:
    c.setFillColor(BONE)
    c.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)
    c.setFillColor(JADE)
    c.rect(0, HEIGHT - 8, WIDTH, 8, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.circle(37, HEIGHT - 37, 10, fill=1, stroke=0)
    if arabic:
        c.setFillColor(JADE)
        c.setFont("ArialGGBold", 14)
        c.drawRightString(WIDTH - 28, HEIGHT - 42, "GET GOLD")
    else:
        draw_text(c, "GET GOLD", 28, HEIGHT - 42, arabic=False, font="ArialGGBold", size=14, color=JADE)
    kicker_x = WIDTH - 28 if arabic else 28
    draw_text(c, page.kicker, kicker_x, HEIGHT - 76, arabic=arabic, font="ArialGGBold", size=8, color=GOLD)
    draw_text(c, page.title, kicker_x, HEIGHT - 106, arabic=arabic, font="ArialGGBold", size=20.5 if arabic else 20, color=JADE_DARK)
    draw_lines(c, page.subtitle, kicker_x, HEIGHT - 126, WIDTH - 56, arabic=arabic, font="ArialGG", size=9.5, leading=12, color=MUTED)
    y = HEIGHT - 151
    for step in page.steps:
        y = draw_step(c, step, y, arabic)
    if page.note:
        note_lines = wrap_words(page.note, WIDTH - 76, "ArialGG", 9.0, arabic)
        note_height = 19 + 12 * len(note_lines)
        note_y = max(39, y - note_height - 1)
        c.setFillColor(HexColor("#EAF2ED"))
        c.roundRect(27, note_y, WIDTH - 54, note_height, 8, fill=1, stroke=0)
        draw_lines(c, page.note, WIDTH - 39 if arabic else 39, note_y + note_height - 16, WIDTH - 78, arabic=arabic, font="ArialGG", size=9.0, leading=12, color=JADE_DARK)
        y = note_y
    if y < 33:
        raise ValueError(f"Page {index} content crosses footer: y={y:.1f}")
    c.setStrokeColor(LINE)
    c.line(27, 28, WIDTH - 27, 28)
    c.setFont("ArialGG", 8)
    c.setFillColor(MUTED)
    c.drawString(27, 15, "getgold.ae  |  support@getgold.ae")
    c.drawRightString(WIDTH - 27, 15, f"{index} / {total}")
    c.showPage()


def build(pages: tuple[Page, ...], filename: str, arabic: bool) -> Path:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    path = OUTPUT / filename
    c = canvas.Canvas(str(path), pagesize=(WIDTH, HEIGHT), pageCompression=1)
    c.setTitle("Get Gold Vendor Guide - Arabic" if arabic else "Get Gold Vendor Guide - English")
    c.setAuthor("Get Gold")
    for index, page in enumerate(pages, 1):
        draw_page(c, page, index, len(pages), arabic)
    c.save()
    copyfile(path, PUBLIC / filename)
    return path


if __name__ == "__main__":
    print(build(ENGLISH, "get-gold-vendor-guide-en.pdf", False))
    print(build(ARABIC, "get-gold-vendor-guide-ar.pdf", True))
