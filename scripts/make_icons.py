from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).resolve().parents[1] / 'public'
for size in (192, 512):
    image = Image.new('RGB', (size, size), '#d6f36a')
    draw = ImageDraw.Draw(image)
    line = max(4, round(size * 0.065))
    draw.rounded_rectangle((size * .2, size * .27, size * .8, size * .81), radius=size * .1, outline='#1d281e', width=line)
    draw.line((size * .2, size * .42, size * .8, size * .42), fill='#1d281e', width=line)
    draw.line((size * .34, size * .18, size * .34, size * .34), fill='#1d281e', width=line)
    draw.line((size * .66, size * .18, size * .66, size * .34), fill='#1d281e', width=line)
    for x in (.36, .60):
        draw.ellipse((size * x, size * .54, size * (x + .095), size * .635), fill='#1d281e')
    image.save(out / f'icon-{size}.png')
image.resize((180, 180)).save(out / 'apple-touch-icon.png')
