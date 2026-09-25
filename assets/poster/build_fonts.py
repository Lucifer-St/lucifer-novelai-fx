"""按 poster.html 实际用到的字，从 Google Fonts 下载字体子集并固定为静态字重。

Google Fonts 的 Noto Serif SC 是可变字体，多个字重共用同一文件时 Chrome 的粗细不稳定，
所以这里把每个字重单独实例化成静态 woff2。改动海报文案后重新运行：

    pip install fonttools brotli
    python build_fonts.py
"""
import html
import io
import re
import urllib.parse
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = Path(__file__).parent
OUT = HERE / "fonts"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"

# (CSS 字体名, Google Fonts 家族, 字重, 是否斜体)
FACES = [
    ("Poster Serif", "Noto Serif SC", 700, False),
    ("Poster Serif", "Noto Serif SC", 900, False),
    ("Poster Sans", "Noto Sans SC", 400, False),
    ("Poster Sans", "Noto Sans SC", 500, False),
    ("Poster Sans", "Noto Sans SC", 700, False),
    ("Poster Latin", "Cormorant Garamond", 600, False),
    ("Poster Latin", "Cormorant Garamond", 600, True),
]


def page_text() -> str:
    src = (HERE / "poster.html").read_text(encoding="utf-8")
    body = src.split("<body>", 1)[1]
    body = re.sub(r"<svg.*?</svg>", "", body, flags=re.S)
    text = html.unescape(re.sub(r"<[^>]+>", "", body))
    chars = {c for c in text if not c.isspace()} | {" "}
    return "".join(sorted(chars))


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req) as resp:
        return resp.read()


def main() -> None:
    text = page_text()
    OUT.mkdir(exist_ok=True)
    css = []
    for name, family, weight, italic in FACES:
        spec = f"{family}:ital,wght@{int(italic)},{weight}"
        query = urllib.parse.urlencode({"family": spec, "text": text})
        sheet = fetch(f"https://fonts.googleapis.com/css2?{query}").decode()
        font = TTFont(io.BytesIO(fetch(re.search(r"url\((.+?)\)", sheet).group(1))))
        if "fvar" in font:
            font = instancer.instantiateVariableFont(font, {"wght": weight})
        font.flavor = "woff2"
        slug = family.lower().replace(" ", "-")
        filename = f"{slug}-{weight}{'-italic' if italic else ''}.woff2"
        font.save(OUT / filename)
        css.append(
            f'@font-face {{ font-family: "{name}"; font-weight: {weight}; '
            f'font-style: {"italic" if italic else "normal"}; '
            f'src: url("{filename}") format("woff2"); }}'
        )
        print(filename, (OUT / filename).stat().st_size)
    (OUT / "fonts.css").write_text("\n".join(css) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
