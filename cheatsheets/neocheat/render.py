"""Рендер Sheet -> PDF. Единственное место, где живёт вёрстка."""
from __future__ import annotations

import os
import re

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Frame,
    KeepTogether,
    NextPageTemplate,
    PageBreak as RLPageBreak,
    PageTemplate,
    Paragraph,
    Spacer as RLSpacer,
    Table as RLTable,
    TableStyle,
)
from reportlab.platypus.flowables import HRFlowable

from . import blocks as B
from . import theme as T

PAGE_W, PAGE_H = A4
CONTENT_W = PAGE_W - 2 * T.PAGE_MARGIN_X

# --------------------------------------------------------------------------
# Экранирование
# --------------------------------------------------------------------------
# В контенте постоянно встречается «< 100 г/л», но reportlab разбирает текст
# абзаца как XML. Поэтому пропускаем только явно разрешённые теги разметки,
# а все остальные «<», «>» и «&» экранируем.
_ALLOWED_TAGS = "b|i|u|br|font|super|sub|sup|strike|span|para"
_TAG_RE = re.compile(rf"</?(?:{_ALLOWED_TAGS})\b[^<>]*/?>", re.IGNORECASE)
_AMP_RE = re.compile(r"&(?![a-zA-Z]+;|#\d+;)")


def _escape_plain(s: str) -> str:
    return _AMP_RE.sub("&amp;", s).replace("<", "&lt;").replace(">", "&gt;")


def esc(text) -> str:
    """Экранирует всё, кроме разрешённых тегов разметки."""
    s = str(text)
    out, last = [], 0
    for m in _TAG_RE.finditer(s):
        out.append(_escape_plain(s[last:m.start()]))
        out.append(m.group(0))
        last = m.end()
    out.append(_escape_plain(s[last:]))
    return "".join(out)


def Para(text, style, **kw):
    """Paragraph с экранированием — используем везде вместо голого Paragraph."""
    return Paragraph(esc(text), style, **kw)


DISCLAIMER = (
    "Памятка для быстрой сверки у постели пациента. "
    "Не заменяет действующие клинические рекомендации и назначение врача."
)


# --------------------------------------------------------------------------
# Вспомогательное
# --------------------------------------------------------------------------
def _split_tone(text: str):
    """Снимает с текста ячейки маркер подсветки. -> (tone|None, чистый текст)."""
    s = str(text)
    for marker in ("!!", "!", "+", "~"):
        if s.startswith(marker):
            rest = s[len(marker):]
            # Маркер считается маркером, только если за ним пробел, — чтобы
            # не съесть, например, «+15 мл» или «~2 ч».
            if rest.startswith(" "):
                return T.CELL_TONES[marker], rest.lstrip()
    return None, s


def _align_style(styles, letter: str, header: bool):
    if header:
        return {"l": styles["th"], "c": styles["th_c"], "r": styles["th_r"]}.get(letter, styles["th"])
    return {"l": styles["td"], "c": styles["td_c"], "r": styles["td_r"]}.get(letter, styles["td"])


def _sized(style, size):
    if size is None:
        return style
    s = style.clone(style.name + f"_{size}")
    s.fontSize = size
    s.leading = size * 1.28
    return s


# --------------------------------------------------------------------------
# Конвертеры блоков -> flowables
# --------------------------------------------------------------------------
def _render_heading(blk: B.H, styles):
    tone, _ = T.TONES.get(blk.tone, T.TONES["info"])
    tbl = RLTable([[Para(blk.text.upper(), styles["h1"])]], colWidths=[CONTENT_W])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), tone),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 4.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
    ]))
    # Заголовок раздела не должен оставаться внизу страницы в одиночестве.
    return [RLSpacer(1, 7), CondPageBreak(46 * mm), tbl, RLSpacer(1, 5)]


def _render_table(blk: B.Table, styles):
    cols = len(blk.head) if blk.head else max(len(r) for r in blk.rows if not isinstance(r, str))
    align = (blk.align or "l" * cols).ljust(cols, "l")

    if blk.widths:
        total = float(sum(blk.widths))
        widths = [CONTENT_W * w / total for w in blk.widths]
    else:
        widths = [CONTENT_W / cols] * cols

    data = []
    style_cmds = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("GRID", (0, 0), (-1, -1), 0.4, T.LINE),
    ]

    r = 0
    if blk.head:
        data.append([
            Para(str(h), _sized(_align_style(styles, align[i], True), blk.font_size))
            for i, h in enumerate(blk.head)
        ])
        style_cmds += [
            ("BACKGROUND", (0, 0), (-1, 0), T.TEXT),
            ("GRID", (0, 0), (-1, 0), 0.4, T.TEXT),
        ]
        r = 1

    for row in blk.rows:
        # Строка-подзаголовок: одна строка вместо списка ячеек.
        if isinstance(row, str):
            tone_name, txt = _split_tone(row)
            fg, bg = T.TONES.get(tone_name or "muted", T.TONES["muted"])
            cell = Para(f"<b>{txt}</b>", _sized(styles["td"], blk.font_size))
            data.append([cell] + [""] * (cols - 1))
            style_cmds += [
                ("SPAN", (0, r), (-1, r)),
                ("BACKGROUND", (0, r), (-1, r), bg),
                ("TEXTCOLOR", (0, r), (-1, r), fg),
            ]
            r += 1
            continue

        cells = []
        padded = list(row) + [""] * (cols - len(row))
        for c, raw in enumerate(padded):
            tone_name, txt = _split_tone(raw)
            base = _align_style(styles, align[c], False)
            if tone_name:
                fg, bg = T.TONES[tone_name]
                style_cmds.append(("BACKGROUND", (c, r), (c, r), bg))
                st = _sized(base, blk.font_size).clone(f"cell{r}{c}")
                st.textColor = fg
                st.fontName = T.FONT_BOLD
            else:
                st = _sized(base, blk.font_size)
                if blk.zebra and r % 2 == 0 and blk.head:
                    style_cmds.append(("BACKGROUND", (c, r), (c, r), T.ZEBRA))
                elif blk.zebra and r % 2 == 1 and not blk.head:
                    style_cmds.append(("BACKGROUND", (c, r), (c, r), T.ZEBRA))
            cells.append(Para(txt, st))
        data.append(cells)
        r += 1

    tbl = RLTable(data, colWidths=widths, repeatRows=1 if blk.head else 0)
    tbl.setStyle(TableStyle(style_cmds))

    group = []
    if blk.caption:
        group.append(Para(blk.caption, styles["h2"]))
    group.append(tbl)

    # Небольшую таблицу не рвём между страницами; большая всё равно не влезет
    # целиком, и repeatRows перенесёт шапку на следующую страницу.
    if len(data) <= 12:
        return [KeepTogether(group), RLSpacer(1, 5)]
    return group + [RLSpacer(1, 5)]


def _render_callout(blk: B.Callout, styles):
    fg, bg = T.TONES.get(blk.tone, T.TONES["info"])
    inner = []
    if blk.title:
        st = styles["callout_title"].clone("ct_" + blk.tone)
        st.textColor = fg
        inner.append(Para(blk.title, st))
    if blk.text:
        inner.append(Para(blk.text, styles["callout_body"]))

    tbl = RLTable([[inner]], colWidths=[CONTENT_W])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (0, -1), 2.6, fg),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return [KeepTogether(tbl), RLSpacer(1, 5)]


def _render_formula(blk: B.Formula, styles):
    inner = [Para(blk.text, styles["formula"])]
    if blk.note:
        inner.append(Para(blk.note, styles["formula_note"]))
    tbl = RLTable([[inner]], colWidths=[CONTENT_W])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), T.ACCENT_SOFT),
        ("BOX", (0, 0), (-1, -1), 0.6, T.ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return [KeepTogether(tbl), RLSpacer(1, 5)]


def _render_kv(blk: B.KV, styles):
    pairs = list(blk.pairs)
    if len(pairs) % 2:
        pairs.append(("", ""))
    data = []
    for i in range(0, len(pairs), 2):
        (k1, v1), (k2, v2) = pairs[i], pairs[i + 1]
        data.append([
            Para(k1, styles["kv_k"]), Para(v1, styles["kv_v"]),
            Para(k2, styles["kv_k"]), Para(v2, styles["kv_v"]),
        ])
    w = CONTENT_W / 4
    tbl = RLTable(data, colWidths=[w * 0.95, w * 1.05, w * 0.95, w * 1.05])
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 0), (-1, -2), 0.35, T.LINE_SOFT),
        ("LINEAFTER", (1, 0), (1, -1), 0.35, T.LINE_SOFT),
    ]))
    return [tbl, RLSpacer(1, 5)]


def _render_block(blk, styles):
    if isinstance(blk, B.H):
        return _render_heading(blk, styles)
    if isinstance(blk, B.P):
        return [Para(blk.text, styles["body"])]
    if isinstance(blk, B.UL):
        return [
            Para(item, styles["bullet"], bulletText="•") for item in blk.items
        ] + [RLSpacer(1, 3)]
    if isinstance(blk, B.OL):
        return [
            Para(item, styles["step"], bulletText=f"{i}.")
            for i, item in enumerate(blk.items, 1)
        ] + [RLSpacer(1, 3)]
    if isinstance(blk, B.Table):
        return _render_table(blk, styles)
    if isinstance(blk, B.Callout):
        return _render_callout(blk, styles)
    if isinstance(blk, B.Formula):
        return _render_formula(blk, styles)
    if isinstance(blk, B.KV):
        return _render_kv(blk, styles)
    if isinstance(blk, B.Note):
        return [Para(blk.text, styles["note"])]
    if isinstance(blk, B.Spacer):
        return [RLSpacer(1, blk.height)]
    if isinstance(blk, B.Rule):
        return [RLSpacer(1, 3), HRFlowable(width="100%", thickness=0.5, color=T.LINE), RLSpacer(1, 3)]
    if isinstance(blk, B.PageBreak):
        return [RLPageBreak()]
    raise TypeError(f"Неизвестный блок: {type(blk).__name__}")


# --------------------------------------------------------------------------
# Титул и колонтитулы
# --------------------------------------------------------------------------
def _title_flowables(sheet, styles):
    out = []
    chip_style = styles["runhead"].clone("chip")
    chip_style.textColor = T.ACCENT
    chip_style.fontName = T.FONT_BOLD
    label = sheet.category.upper()
    chip_w = pdfmetrics.stringWidth(label, T.FONT_BOLD, chip_style.fontSize) + 13
    chip = RLTable([[Para(label, chip_style)]], colWidths=[chip_w])
    chip.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), T.ACCENT_SOFT),
        ("TEXTCOLOR", (0, 0), (-1, -1), T.ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    chip.hAlign = "LEFT"
    out.append(chip)
    out.append(RLSpacer(1, 6))
    out.append(Para(sheet.title, styles["title"]))
    if sheet.subtitle:
        out.append(Para(sheet.subtitle, styles["subtitle"]))
    out.append(RLSpacer(1, 4))
    out.append(HRFlowable(width="100%", thickness=1.6, color=T.ACCENT, spaceAfter=0))
    return out


def _credit_parts():
    """Куски подписи: (текст, жирный?, цвет). Название проекта выделяем цветом."""
    b = T.BRAND
    author, role = b.get("author", "").strip(), b.get("role", "").strip()
    project, link = b.get("project", "").strip(), b.get("link", "").strip()
    prefix = b.get("prefix", "Автор").strip()

    parts = []
    if author:
        who = f"{prefix}: {author}" if prefix else author
        if role:
            who += f", {role}"
        parts.append((who, False, T.MUTED))
    if project:
        if parts:
            parts.append((" · ", False, T.LINE))
        parts.append((project, True, T.ACCENT))
    if link:
        # В подвале схема не нужна: «t.me/postneo01» и короче, и читается легче.
        for scheme in ("https://", "http://"):
            if link.startswith(scheme):
                link = link[len(scheme):]
                break
        parts.append((" · " + link, False, T.MUTED))
    return parts


def _draw_credit(canvas, y):
    """Подпись слева внизу: автор обычным, проект — акцентом."""
    parts = _credit_parts()
    if not parts:
        return
    x = T.PAGE_MARGIN_X
    for text, bold, color in parts:
        font = T.FONT_BOLD if bold else T.FONT
        canvas.setFont(font, 6.6)
        canvas.setFillColor(color)
        canvas.drawString(x, y, text)
        x += pdfmetrics.stringWidth(text, font, 6.6)


def _make_page_painter(sheet, build_date, show_runhead):
    def paint(canvas, doc):
        canvas.saveState()
        page = canvas.getPageNumber()

        if show_runhead and page > 1:
            y = PAGE_H - 12 * mm
            canvas.setFont(T.FONT_BOLD, 8)
            canvas.setFillColor(T.TEXT)
            canvas.drawString(T.PAGE_MARGIN_X, y, sheet.title)
            canvas.setFont(T.FONT, 8)
            canvas.setFillColor(T.MUTED)
            canvas.drawRightString(PAGE_W - T.PAGE_MARGIN_X, y, sheet.category)
            canvas.setStrokeColor(T.LINE)
            canvas.setLineWidth(0.5)
            canvas.line(T.PAGE_MARGIN_X, y - 3 * mm, PAGE_W - T.PAGE_MARGIN_X, y - 3 * mm)

        # Подвал
        fy = 9 * mm
        canvas.setStrokeColor(T.LINE)
        canvas.setLineWidth(0.5)
        canvas.line(T.PAGE_MARGIN_X, fy + 4 * mm, PAGE_W - T.PAGE_MARGIN_X, fy + 4 * mm)
        canvas.setFont(T.FONT, 6.6)
        canvas.setFillColor(T.MUTED)
        canvas.drawString(T.PAGE_MARGIN_X, fy, DISCLAIMER)
        canvas.drawRightString(PAGE_W - T.PAGE_MARGIN_X, fy, f"{build_date} · стр. {page}")
        # Вторая строка подвала: авторство и проект — на каждой странице.
        _draw_credit(canvas, fy - 3.6 * mm)
        canvas.restoreState()

    return paint


# --------------------------------------------------------------------------
# Точка входа
# --------------------------------------------------------------------------
def render(sheet, out_path: str, build_date: str) -> str:
    styles = T.build_styles()

    doc = BaseDocTemplate(
        out_path,
        pagesize=A4,
        title=sheet.title,
        author="ПостНео",
        subject=sheet.subtitle or sheet.category,
        leftMargin=T.PAGE_MARGIN_X,
        rightMargin=T.PAGE_MARGIN_X,
        topMargin=14 * mm,
        bottomMargin=T.PAGE_MARGIN_BOTTOM,
    )

    frame_first = Frame(
        T.PAGE_MARGIN_X, T.PAGE_MARGIN_BOTTOM, CONTENT_W,
        PAGE_H - T.PAGE_MARGIN_BOTTOM - 13 * mm, id="first",
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
    )
    frame_later = Frame(
        T.PAGE_MARGIN_X, T.PAGE_MARGIN_BOTTOM, CONTENT_W,
        PAGE_H - T.PAGE_MARGIN_BOTTOM - 19 * mm, id="later",
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
    )
    painter = _make_page_painter(sheet, build_date, show_runhead=True)
    doc.addPageTemplates([
        PageTemplate(id="first", frames=[frame_first], onPage=painter),
        PageTemplate(id="later", frames=[frame_later], onPage=painter),
    ])

    story = [NextPageTemplate("later")]
    story += _title_flowables(sheet, styles)
    for blk in sheet.blocks:
        story += _render_block(blk, styles)

    if sheet.sources:
        story += _render_heading(B.H("Источники", tone="muted"), styles)
        for s in sheet.sources:
            story.append(Para(s, styles["src"], bulletText="—"))

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    doc.build(story)
    return out_path
