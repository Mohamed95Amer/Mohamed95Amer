"""A translated string in an owl template must be able to find its translation.

Owl translates a text node by trimming its outer whitespace and handing the
rest to _t unchanged. The regex it uses is

    /^(\\s*)([\\s\\S]+?)(\\s*)$/

which captures the leading and trailing runs and leaves everything between
them alone -- newlines and source indentation included. Odoo's extractor does
the opposite: when it writes the .po it collapses the node onto one line.

So a sentence wrapped across two lines of template, which is the natural way
to write anything longer than a few words, produces a runtime lookup key of

    "...finish dates on the\\n            project's tasks, then..."

against a catalogue entry of

    "...finish dates on the project's tasks, then..."

They never match. The string stays English on screen while the .po says it is
translated, which is the worst shape this bug can take: every check short of
opening the page in Arabic reports it as done. It was found by looking at a
screenshot of the programme Gantt, not by any test.

The fix is to keep such text on one line. This guards it, and deliberately
only reports nodes that *have* a translation -- a wrapped node nobody has
translated yet is a smaller and different problem, and failing on it would
make this test noise instead of a signal.

The second test here guards a different silence with the same symptom: an
entry Odoo declines to load at all because it is not labelled as code. Both
were found by reading an Arabic screenshot, and neither is visible to any
amount of reading the .po -- which is the point of writing them down.
"""

import html
import re
from pathlib import Path

from odoo.tests import TransactionCase, tagged

ADDONS = Path(__file__).resolve().parents[2]

# A text node: between > and <, containing no markup and no owl interpolation.
TEXT_NODE = re.compile(r">([^<>{}]*?)<", re.S)

# _() and _lt() in Python, _t() in JavaScript.
CALL = re.compile(r'\b(?:_lt|_t|_)\(\s*"((?:[^"\\]|\\.)+)"'
                  r'|\b(?:_lt|_t|_)\(\s*\'((?:[^\'\\]|\\.)+)\'')

# A whole entry: its comment header, msgid and msgstr, any of which may be
# split over several quoted lines.
PO_BLOCK = re.compile(
    r'((?:^#[^\n]*\n)*)msgid\s+((?:"(?:[^"\\]|\\.)*"\s*)+)'
    r'msgstr\s+((?:"(?:[^"\\]|\\.)*"\s*)+)', re.M)
QUOTED = re.compile(r'"((?:[^"\\]|\\.)*)"')

# Attributes owl translates. These come from owl's own TRANSLATABLE_ATTRS;
# Odoo's env.js translatableAttributes: ["data-tooltip"] *adds* to that list
# rather than replacing it, so a literal title="" is translated like any text
# node -- and needs a properly marked .po entry exactly like one.
TRANSLATED_ATTRS = ("alt", "aria-label", "aria-placeholder",
                    "aria-roledescription", "aria-valuetext", "data-tooltip",
                    "label", "placeholder", "title")
ATTR = re.compile(
    r'\s(?:' + "|".join(TRANSLATED_ATTRS) + r')="([^"{}]*[A-Za-z]{3}[^"{}]*)"')


def _unquote(chunk):
    return "".join(QUOTED.findall(chunk)).replace('\\"', '"')


def _entries(module):
    """{msgid: comment header} for every translated entry in the module."""
    catalogue = {}
    for path in sorted((ADDONS / module).glob("i18n/*.po")):
        body = path.read_text(encoding="utf-8")
        for comments, msgid, msgstr in PO_BLOCK.findall(body):
            key = _unquote(msgid)
            if key and _unquote(msgstr).strip():
                catalogue[key] = comments
    return catalogue


def _translated_msgids(module):
    """Every msgid in the module's catalogues that actually has a translation."""
    return set(_entries(module))


@tagged("post_install", "-at_install")
class TestTemplateTranslations(TransactionCase):
    def test_no_translated_string_is_wrapped_across_lines(self):
        stranded = []
        for module_dir in sorted(ADDONS.iterdir()):
            if not module_dir.is_dir():
                continue
            templates = sorted(module_dir.glob("static/src/**/*.xml"))
            if not templates:
                continue
            catalogue = _translated_msgids(module_dir.name)
            if not catalogue:
                continue
            for path in templates:
                source = path.read_text(encoding="utf-8")
                for match in TEXT_NODE.finditer(source):
                    inner = match.group(1).strip()
                    # Only wrapped prose can strand a translation; a short or
                    # single-line node reaches _t exactly as extracted.
                    if "\n" not in inner or len(inner) < 12:
                        continue
                    collapsed = " ".join(inner.split())
                    if collapsed in catalogue:
                        line = source[:match.start()].count("\n") + 1
                        stranded.append(
                            f"{path.relative_to(ADDONS)}:{line}: {collapsed[:60]}…")

        self.assertFalse(stranded, (
            "These strings are translated in the .po but wrapped across lines "
            "in the template. Owl looks them up with the newline and the "
            "source indentation still in the key, so the translation is never "
            "found and the text renders in English. Put each on one line:\n"
            + "\n".join(stranded)))

    def test_every_code_entry_carries_its_marker_and_occurrence(self):
        """Odoo drops a code translation that is not labelled as one.

        CodeTranslations loads the two code catalogues through filters that
        require 'odoo-javascript' / 'odoo-python' in the entry's comments, and
        PoFileReader only classifies an entry as a code row at all when it has
        an occurrence line matching `code:<path>`. An entry written without
        both is discarded in silence.

        The failure is very easy to miss because the browser catalogue is
        global: a common word like "Portfolio" renders in Arabic on a
        completely unwired screen purely because a different module spelled
        its own entry correctly. Reading the .po tells you nothing.
        """
        unmarked = []
        for module_dir in sorted(ADDONS.iterdir()):
            if not module_dir.is_dir():
                continue
            catalogue = _entries(module_dir.name)
            if not catalogue:
                continue

            # What this module's own code asks to have translated. A term can
            # need both markers: "Subcontracts" is a template button label and
            # a menu name built with _() in a model, and Odoo keeps the two
            # catalogues apart, so one marker leaves the other side English.
            used = {}

            def need(term, marker):
                used.setdefault(term, set()).add(marker)

            for path in sorted(module_dir.glob("static/src/**/*.xml")):
                source = path.read_text(encoding="utf-8")
                for match in TEXT_NODE.finditer(source):
                    term = html.unescape(" ".join(match.group(1).split()))
                    if len(term) > 2 and re.search(r"[A-Za-z]", term):
                        need(term, "odoo-javascript")
                # Attributes go through the same catalogue as text nodes.
                for match in ATTR.finditer(source):
                    need(html.unescape(match.group(1)), "odoo-javascript")
            for path in sorted(module_dir.glob("static/src/**/*.js")):
                for match in CALL.finditer(path.read_text(encoding="utf-8")):
                    need(match.group(1) or match.group(2), "odoo-javascript")
            for path in sorted(module_dir.glob("**/*.py")):
                if "__pycache__" in str(path):
                    continue
                for match in CALL.finditer(path.read_text(encoding="utf-8")):
                    need(match.group(1) or match.group(2), "odoo-python")

            for term, markers in used.items():
                comments = catalogue.get(term)
                if comments is None:
                    continue  # simply not translated yet -- a different gap
                for marker in sorted(markers):
                    if marker not in comments or "#: code:" not in comments:
                        unmarked.append(
                            f"{module_dir.name}: needs '#. {marker}' and a "
                            f"'#: code:' line — {term[:52]}")

        self.assertFalse(unmarked, (
            "These entries are translated but Odoo never loads them, because "
            "the entry lacks the marker comment and/or the code occurrence "
            "line that CodeTranslations filters on. They render in English:\n"
            + "\n".join(unmarked)))
