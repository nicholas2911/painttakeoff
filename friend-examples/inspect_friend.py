"""Inspect the friend's sample PDF: structure, text, dims, scales; render pages to PNG."""
import re
from pathlib import Path
from pypdf import PdfReader

PDF = "friend-examples/2 Drawings - Architectural.pdf"
OUT = Path("friend-examples/preview")
OUT.mkdir(exist_ok=True)

r = PdfReader(PDF)
print("pages:", len(r.pages))
sizes = {}
for p in r.pages:
    mb = p.mediabox
    w, h = float(mb.width) / 72, float(mb.height) / 72
    key = f"{w:.1f} x {h:.1f} in"
    sizes[key] = sizes.get(key, 0) + 1
for s, n in sizes.items():
    print("  size:", s, "x", n)

alltext = ""
for p in r.pages:
    alltext += (p.extract_text() or "") + "\n"
print("total text chars:", len(alltext))

dims = re.findall(r"\d+'-\d+", alltext)
print("dimension strings:", len(dims), dims[:20])
scales = re.findall(r"\d+/\d+\"\s*=\s*1'-\d+\"|1:\d+", alltext)
print("scale notations:", scales[:20])
for kw in ["finish schedule", "paint", "PT-", "room finish", "ceiling height",
           "door schedule", "window schedule", "scale"]:
    hits = len(re.findall(re.escape(kw), alltext, re.I))
    if hits:
        print(f"keyword {kw!r}: {hits}")

# sheet titles (title block text usually near end of page text)
titles = re.findall(r"(?m)^.*(FLOOR PLAN|ELEVATION|SECTION|DETAIL|SCHEDULE|ROOF|SITE|BASEMENT).*$",
                    alltext, re.I)
seen = []
for t in titles:
    t = " ".join(t.split())
    if t not in seen and len(t) < 80:
        seen.append(t)
print("sheet-title-like lines:")
for t in seen[:25]:
    print("  ", t)

# render pages to PNG for visual check
import fitz  # pymupdf
doc = fitz.open(PDF)
for i in range(len(doc)):
    page = doc[i]
    zoom = 150 / 72  # 150 dpi
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
    pix.save(str(OUT / f"page-{i+1:02d}.png"))
    print(f"rendered page {i+1}: {pix.width}x{pix.height}")
