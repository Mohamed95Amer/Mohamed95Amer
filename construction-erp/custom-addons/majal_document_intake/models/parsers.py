"""Turn an uploaded file into rows of plain strings. Nothing more.

Everything here is deterministic and local. No network, no AI, no OCR. A file
goes in and a table comes out, or a ParseError explains why not. That
separation is the point: mapping, confidence and record creation all read the
output of this module and none of them care which format it came from, so a
new format is a new function here and nothing else.

Uploads are untrusted. The rules that follow from that, and why:

- Formulas are never evaluated. openpyxl reads with data_only=True, which
  returns the cached value Excel last computed and never executes anything.
- Archives are checked before they are expanded. XLSX and DOCX are both zip
  containers, and a zip that expands to far more than its compressed size is
  the standard way to exhaust a server's memory from a small upload. Both
  paths refuse one.
- Nothing is imported from a file's own claim about itself. The format is
  decided by sniffing the leading bytes, not by trusting the extension a
  caller supplied.
- No embedded object, macro, external link or relationship target is read.
  Only cell values and paragraph text.
"""

import csv
import io
import json
import re
import zipfile
from xml.etree import ElementTree

# A cell that starts with any of these is treated as text by a spreadsheet on
# the way back out, so it is neutralised on the way in. This is the classic
# CSV-injection channel: a value like =cmd|'/c calc'!A1 is inert in Odoo and
# executes when somebody exports the record and opens it in Excel.
FORMULA_LEADERS = ("=", "+", "-", "@", "\t", "\r")

# Ceiling on what a zip container may expand to, and on the ratio between
# expanded and compressed size. Either alone is escapable: a small ratio still
# allows a huge file, and a small absolute size still allows a bomb inside a
# large legitimate upload.
MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024
MAX_COMPRESSION_RATIO = 200

MAX_ROWS = 20000
MAX_COLUMNS = 200

WORD_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class ParseError(Exception):
    """The file cannot be read. The message is shown to the user."""


def neutralise(value):
    """Make a value safe to store and safe to export again.

    Prefixing with an apostrophe is what spreadsheet software reads as "this
    is text"; it survives a round trip and is visible to the user, which a
    silent strip would not be.
    """
    if value is None:
        return ""
    text = str(value).strip()
    if text.startswith(FORMULA_LEADERS):
        return "'" + text
    return text


def _guard_zip(archive):
    total = 0
    for info in archive.infolist():
        total += info.file_size
        if total > MAX_UNCOMPRESSED_BYTES:
            raise ParseError(
                "This file expands to more than the server will read. "
                "It may be corrupt or deliberately malformed."
            )
        if info.compress_size and (
            info.file_size / info.compress_size > MAX_COMPRESSION_RATIO
        ):
            raise ParseError(
                "This file expands far more than its size suggests and has "
                "been refused."
            )


def _trim(rows):
    if len(rows) > MAX_ROWS:
        raise ParseError(
            f"This file has more than {MAX_ROWS} rows. Split it and import "
            f"the parts."
        )
    return [row[:MAX_COLUMNS] for row in rows]


def sniff_format(data, filename=""):
    """Decide the format from the bytes, falling back to the extension.

    The extension is a caller's claim and the leading bytes are evidence, so
    evidence wins. The extension only breaks the tie between formats that are
    both plain text.
    """
    if data[:4] == b"PK\x03\x04":
        # Both XLSX and DOCX are zip containers; look inside for which.
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                names = set(archive.namelist())
        except zipfile.BadZipFile:
            raise ParseError("This file looks like an archive but cannot be opened.")
        if "word/document.xml" in names:
            return "docx"
        if any(n.startswith("xl/") for n in names):
            return "xlsx"
        raise ParseError("This archive is neither a .xlsx nor a .docx file.")
    if data[:5] == b"%PDF-":
        return "pdf"

    extension = (filename or "").rsplit(".", 1)[-1].lower()
    if extension in {"csv", "json", "txt"}:
        return extension
    # Fall back on the content itself.
    head = data[:4096].lstrip()
    if head[:1] in (b"{", b"["):
        return "json"
    return "csv" if b"," in data[:4096] or b";" in data[:4096] else "txt"


def _decode(data):
    for encoding in ("utf-8-sig", "utf-8"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    try:
        import chardet
    except ImportError:
        chardet = None
    if chardet:
        guess = chardet.detect(data[:100000]).get("encoding")
        if guess:
            try:
                return data.decode(guess)
            except (UnicodeDecodeError, LookupError):
                pass
    # Arabic files that are neither UTF-8 nor detectable are usually cp1256.
    # Replacing undecodable bytes beats refusing the file outright.
    return data.decode("cp1256", errors="replace")


def parse_csv(data):
    text = _decode(data)
    if not text.strip():
        raise ParseError("This file is empty.")
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    rows = [
        [neutralise(cell) for cell in row]
        for row in csv.reader(io.StringIO(text), dialect)
        if any(str(cell).strip() for cell in row)
    ]
    if not rows:
        raise ParseError("This file has no readable rows.")
    return _trim(rows)


def parse_json(data):
    """Accept a list of flat objects, or one object, and nothing cleverer.

    Nested structures are refused rather than flattened by guesswork: a
    mapping profile targets a field, and silently inventing "a.b.c" keys for
    the user to map would make the review screen a puzzle.
    """
    try:
        payload = json.loads(_decode(data))
    except (json.JSONDecodeError, ValueError) as error:
        raise ParseError(f"This file is not valid JSON: {error}")

    records = payload if isinstance(payload, list) else [payload]
    if not records:
        raise ParseError("This file contains no records.")
    if not all(isinstance(item, dict) for item in records):
        raise ParseError(
            "Expected a list of objects, each one a record with named fields."
        )

    keys = []
    for record in records:
        for key in record:
            if key not in keys:
                keys.append(key)
    if not keys:
        raise ParseError("These records have no fields.")

    rows = [keys]
    for record in records:
        row = []
        for key in keys:
            value = record.get(key)
            if isinstance(value, (dict, list)):
                raise ParseError(
                    f"Field {key!r} holds a nested structure. Flatten it "
                    f"before importing."
                )
            row.append(neutralise(value))
        rows.append(row)
    return _trim(rows)


def parse_xlsx(data):
    try:
        import openpyxl
    except ImportError:
        raise ParseError("openpyxl is not installed on the server.")

    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        _guard_zip(archive)

    try:
        # data_only=True returns the cached result of a formula and never
        # evaluates one. read_only=True streams rather than building the whole
        # object graph.
        workbook = openpyxl.load_workbook(
            io.BytesIO(data), read_only=True, data_only=True
        )
    except Exception:
        raise ParseError("This file could not be read as an .xlsx workbook.")

    try:
        sheet = workbook.active
        rows = [
            [neutralise(cell) for cell in row]
            for row in sheet.iter_rows(values_only=True)
        ]
    finally:
        workbook.close()

    rows = [row for row in rows if any(cell for cell in row)]
    if not rows:
        raise ParseError("The first worksheet is empty.")
    return _trim(rows)


def parse_docx(data):
    """Read paragraph and table text from a .docx.

    Done with zipfile and the XML parser rather than python-docx, which is not
    installed — adding a dependency changes the install path, and that has
    taken CI down on this branch before. Only w:t text nodes are read; no
    relationship, embedded object or macro is touched.
    """
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        _guard_zip(archive)
        try:
            xml = archive.read("word/document.xml")
        except KeyError:
            raise ParseError("This .docx has no document body.")

    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError as error:
        raise ParseError(f"This .docx is malformed: {error}")

    rows = []
    for paragraph in root.iter(f"{WORD_NS}p"):
        text = "".join(node.text or "" for node in paragraph.iter(f"{WORD_NS}t"))
        text = text.strip()
        if text:
            rows.append([neutralise(text)])
    if not rows:
        raise ParseError("No readable text was found in this document.")
    return _trim(rows)


def parse_pdf(data):
    """Extract the text layer. This is not OCR.

    A scanned PDF is an image and has no text layer, so it yields nothing.
    That case is reported plainly rather than returning an empty table that
    looks like a parsing success with no data in it.
    """
    try:
        from pypdf import PdfReader
    except ImportError:
        raise ParseError("No PDF reader is installed on the server.")

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ParseError("This PDF is password-protected.")
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
    except ParseError:
        raise
    except Exception as error:
        raise ParseError(f"This PDF could not be read: {error}")

    rows = [[neutralise(line)] for line in text.splitlines() if line.strip()]
    if not rows:
        raise ParseError(
            "No text layer was found. This looks like a scanned document, "
            "which needs OCR — not yet available."
        )
    return _trim(rows)


# PDF form field types, as the specification names them, mapped to the answer
# types construction.form.question already offers. This is a real mapping over
# machine-readable structure, not a guess about what a blank space might mean:
# an AcroForm field declares its own type, and a PDF that has none simply has
# no fields to find.
PDF_FIELD_TYPES = {
    "/Tx": "text",       # free text
    "/Btn": "yes_no",    # checkbox or radio
    "/Ch": "text",       # dropdown or list
    "/Sig": "signature",
}

# Applied to text fields only, and only on the field's own name. A field called
# "date_of_inspection" is a date; one called "number_of_operatives" is a number.
# Getting this wrong costs a reviewer one dropdown on the template, which is why
# it is allowed to be a heuristic at all — the type it produces is editable
# before anything is created.
NAME_HINTS = (
    (("date", "تاريخ"), "date"),
    (("qty", "quantity", "number", "count", "no_of", "عدد", "كمية"), "number"),
    (("sign", "signature", "توقيع"), "signature"),
    (("photo", "image", "صورة"), "photo"),
)


def _answer_type_for(field_type, name):
    answer_type = PDF_FIELD_TYPES.get(field_type, "text")
    if answer_type != "text":
        return answer_type
    lowered = (name or "").lower()
    for needles, hinted in NAME_HINTS:
        if any(needle in lowered for needle in needles):
            return hinted
    return "text"


def parse_pdf_form(data):
    """Enumerate the fillable fields of a PDF.

    Returns [{name, label, answer_type, value, required}] in document order.

    A PDF form is not a picture of a form: AcroForm fields are structure, each
    declaring a name, a type and its flags. So "find the empty fields" is a
    read, not an inference — which is what makes this safe to build without
    OCR. A flat or scanned PDF has no AcroForm at all, and that is reported
    plainly rather than returned as a form with nothing in it.
    """
    try:
        from pypdf import PdfReader
        from pypdf.constants import FieldDictionaryAttributes
    except ImportError:
        raise ParseError("No PDF reader is installed on the server.")

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ParseError("This PDF is password-protected.")
        fields = reader.get_fields() or {}
    except ParseError:
        raise
    except Exception as error:
        raise ParseError(f"This PDF could not be read: {error}")

    if not fields:
        raise ParseError(
            "This PDF has no fillable fields. It may be a scan or a flat "
            "print, which would need OCR — not yet available. A form saved "
            "with fields from Acrobat, Word or Google Docs will work."
        )

    required_bit = FieldDictionaryAttributes.FfBits.Required

    detected = []
    for name, field in fields.items():
        field_type = field.get("/FT")
        # Skip pushbuttons: they trigger an action and hold no answer.
        flags = int(field.get("/Ff", 0) or 0)
        if field_type == "/Btn" and flags & (1 << 16):
            continue
        value = field.get("/V")
        detected.append({
            "name": str(name),
            # /TU is the field's tooltip, which form authors use for the human
            # question. Falling back to the field name means a reviewer sees
            # something readable either way.
            "label": str(field.get("/TU") or name),
            "answer_type": _answer_type_for(field_type, str(name)),
            "value": "" if value is None else neutralise(value),
            "required": bool(flags & required_bit),
        })
    return detected


def fill_pdf_form(data, values):
    """Write values back into the PDF's own fields and return the bytes.

    The point of the whole feature: a subcontractor's permit or a client's H&S
    form comes back as *their* document, filled, rather than as a Majal report
    that happens to contain the same answers. Auditors ask for the form.

    Flattened on the way out, so the returned file records what was submitted
    rather than staying editable by whoever receives it.
    """
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        raise ParseError("No PDF writer is installed on the server.")

    try:
        reader = PdfReader(io.BytesIO(data))
        writer = PdfWriter(clone_from=reader)
        for page in writer.pages:
            writer.update_page_form_field_values(
                page, {k: str(v) for k, v in values.items() if v is not None},
                auto_regenerate=False, flatten=True,
            )
        buffer = io.BytesIO()
        writer.write(buffer)
        return buffer.getvalue()
    except Exception as error:
        raise ParseError(f"The filled PDF could not be produced: {error}")


PARSERS = {
    "csv": parse_csv,
    "txt": parse_csv,
    "json": parse_json,
    "xlsx": parse_xlsx,
    "docx": parse_docx,
    "pdf": parse_pdf,
}


def parse(data, filename=""):
    """Return (format, rows). Raises ParseError with a user-facing message."""
    if not data:
        raise ParseError("This file is empty.")
    file_format = sniff_format(data, filename)
    return file_format, PARSERS[file_format](data)


def normalise_label(label):
    """Fold a column label to a comparable key.

    Arabic is normalised alongside English: the alef forms and the two yeh
    forms are written interchangeably in practice, and a mapping that treats
    إجمالي and اجمالي as different columns is a mapping that fails on half the
    files it is given.
    """
    text = str(label or "").strip().lower()
    text = text.replace("ـ", "")                    # tatweel
    text = re.sub(r"[ً-ْ]", "", text)          # harakat
    text = re.sub(r"[أإآٱ]", "ا", text)
    text = text.replace("ى", "ي").replace("ة", "ه")
    text = re.sub(r"[^0-9a-z؀-ۿ]+", "_", text)
    return text.strip("_")
