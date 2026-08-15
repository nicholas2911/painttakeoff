"""Quick inspection of sample plan PDFs: page count, page size, text extractability."""
import sys
from pathlib import Path
from pypdf import PdfReader

for path in sorted(Path("sample-plans").glob("*.pdf")):
    print(f"\n===== {path.name} =====")
    try:
        r = PdfReader(str(path))
        print(f"pages: {len(r.pages)}")
        # page sizes of first few pages (points -> inches)
        sizes = {}
        for p in r.pages:
            mb = p.mediabox
            w, h = float(mb.width) / 72, float(mb.height) / 72
            sizes[f"{w:.1f} x {h:.1f} in"] = sizes.get(f"{w:.1f} x {h:.1f} in", 0) + 1
        for s, n in sorted(sizes.items(), key=lambda kv: -kv[1]):
            print(f"  page size: {s}  x{n} pages")
        # text extraction sample from first 3 pages
        total_chars = 0
        sample = ""
        for p in r.pages[:3]:
            t = p.extract_text() or ""
            total_chars += len(t)
            if len(sample) < 300:
                sample += t[: 300 - len(sample)]
        print(f"text chars on first 3 pages: {total_chars}")
        print("sample:", " ".join(sample.split())[:250])
    except Exception as e:
        print(f"ERROR: {e}")
