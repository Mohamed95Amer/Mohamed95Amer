from pathlib import Path

import ftfy


# This script lives in construction-erp/scripts/website/ but repairs the site
# under construction-erp/website/ — name the target explicitly rather than
# counting parent directories, so moving the script cannot silently point it
# somewhere else.
ROOT = Path(__file__).resolve().parents[2] / "website"
# .md matters: the first run omitted it and left both READMEs corrupted while
# every page was clean.
TEXT_SUFFIXES = {".html", ".css", ".js", ".json", ".xml", ".txt", ".md"}


def main():
    changed = []
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        original = path.read_text(encoding="utf-8")
        repaired = ftfy.fix_text(original)
        if repaired != original:
            path.write_text(repaired, encoding="utf-8", newline="\n")
            changed.append(path.relative_to(ROOT).as_posix())
    print("\n".join(changed))


if __name__ == "__main__":
    main()
