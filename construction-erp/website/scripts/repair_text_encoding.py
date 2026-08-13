from pathlib import Path

import ftfy


ROOT = Path(__file__).resolve().parents[1]
TEXT_SUFFIXES = {".html", ".css", ".js", ".json", ".xml", ".txt"}


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
