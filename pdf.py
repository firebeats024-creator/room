from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import Flowable
from reportlab.graphics.shapes import Drawing, Rect, Line, String, Circle, Polygon
from reportlab.graphics import renderPDF
import os

# ── Colors ───────────────────────────────────────────────────────────────────
C_GOLD      = colors.HexColor('#B8860B')
C_GOLD_LT   = colors.HexColor('#FFF8DC')
C_GOLD_MED  = colors.HexColor('#DAA520')
C_BLUE      = colors.HexColor('#1A5F9E')
C_BLUE_LT   = colors.HexColor('#E8F4FD')
C_GREEN     = colors.HexColor('#1D7A3A')
C_GREEN_LT  = colors.HexColor('#E8F8ED')
C_RED       = colors.HexColor('#C0392B')
C_RED_LT    = colors.HexColor('#FDEDEC')
C_ORANGE    = colors.HexColor('#E67E22')
C_ORANGE_LT = colors.HexColor('#FEF5E7')
C_DARK      = colors.HexColor('#1C1C1C')
C_GRAY      = colors.HexColor('#6C757D')
C_GRAY_LT   = colors.HexColor('#F8F9FA')
C_GRAY_BD   = colors.HexColor('#DEE2E6')
C_WHITE     = colors.white
C_POC       = colors.HexColor('#E67E22')
C_VAH       = colors.HexColor('#2980B9')
C_VAL       = colors.HexColor('#2980B9')
C_VA_BG     = colors.HexColor('#EBF5FB')

W, H = A4

# ── Styles ────────────────────────────────────────────────────────────────────
def make_styles():
    s = {}
    base = dict(fontName='Helvetica', leading=14, textColor=C_DARK)

    s['title_main'] = ParagraphStyle('title_main', fontSize=26, fontName='Helvetica-Bold',
        textColor=C_WHITE, alignment=TA_CENTER, leading=32, spaceAfter=4)
    s['title_sub']  = ParagraphStyle('title_sub',  fontSize=13, fontName='Helvetica',
        textColor=colors.HexColor('#FFE066'), alignment=TA_CENTER, leading=18)
    s['title_tag']  = ParagraphStyle('title_tag',  fontSize=11, fontName='Helvetica',
        textColor=colors.HexColor('#C8D8E8'), alignment=TA_CENTER, leading=14)

    s['ch_head'] = ParagraphStyle('ch_head', fontSize=18, fontName='Helvetica-Bold',
        textColor=C_BLUE, leading=24, spaceBefore=6, spaceAfter=6)
    s['sec_head'] = ParagraphStyle('sec_head', fontSize=13, fontName='Helvetica-Bold',
        textColor=C_BLUE, leading=18, spaceBefore=8, spaceAfter=4)
    s['body']    = ParagraphStyle('body', fontSize=10.5, fontName='Helvetica',
        textColor=C_DARK, leading=16, spaceAfter=5)
    s['body_b']  = ParagraphStyle('body_b', fontSize=10.5, fontName='Helvetica-Bold',
        textColor=C_DARK, leading=16, spaceAfter=4)
    s['small']   = ParagraphStyle('small', fontSize=9, fontName='Helvetica',
        textColor=C_GRAY, leading=13)
    s['caption'] = ParagraphStyle('caption', fontSize=9, fontName='Helvetica-BoldOblique',
        textColor=C_GRAY, alignment=TA_CENTER, leading=12, spaceBefore=2, spaceAfter=6)

    s['tip_text']   = ParagraphStyle('tip_text', fontSize=10, fontName='Helvetica',
        textColor=C_GREEN, leading=15, leftIndent=6)
    s['warn_text']  = ParagraphStyle('warn_text', fontSize=10, fontName='Helvetica',
        textColor=C_RED, leading=15, leftIndent=6)
    s['info_text']  = ParagraphStyle('info_text', fontSize=10, fontName='Helvetica',
        textColor=C_BLUE, leading=15, leftIndent=6)
    s['rule_text']  = ParagraphStyle('rule_text', fontSize=10.5, fontName='Helvetica-Bold',
        textColor=C_GOLD, leading=15, leftIndent=6)

    s['tbl_hdr'] = ParagraphStyle('tbl_hdr', fontSize=9.5, fontName='Helvetica-Bold',
        textColor=C_WHITE, alignment=TA_CENTER, leading=13)
    s['tbl_cell'] = ParagraphStyle('tbl_cell', fontSize=9.5, fontName='Helvetica',
        textColor=C_DARK, leading=13)
    s['tbl_green'] = ParagraphStyle('tbl_green', fontSize=9.5, fontName='Helvetica-Bold',
        textColor=C_GREEN, leading=13)
    s['tbl_red']   = ParagraphStyle('tbl_red', fontSize=9.5, fontName='Helvetica-Bold',
        textColor=C_RED, leading=13)

    s['ex_head'] = ParagraphStyle('ex_head', fontSize=11, fontName='Helvetica-Bold',
        textColor=C_WHITE, alignment=TA_CENTER, leading=15)
    s['ex_body'] = ParagraphStyle('ex_body', fontSize=10, fontName='Helvetica',
        textColor=C_DARK, leading=15, leftIndent=4, spaceAfter=3)
    s['ex_body_b'] = ParagraphStyle('ex_body_b', fontSize=10, fontName='Helvetica-Bold',
        textColor=C_DARK, leading=15, leftIndent=4, spaceAfter=3)

    s['page_num'] = ParagraphStyle('page_num', fontSize=9, fontName='Helvetica',
        textColor=C_GRAY, alignment=TA_RIGHT)
    return s

ST = make_styles()

# ── Helpers ───────────────────────────────────────────────────────────────────
def divider(color=C_GOLD_MED, thickness=1):
    return HRFlowable(width='100%', thickness=thickness, color=color, spaceAfter=8, spaceBefore=4)

def draw_polygon(c, points, fill=1, stroke=1):
    if not points: return
    p = c.beginPath()
    p.moveTo(points[0][0], points[0][1])
    for x, y in points[1:]:
        p.lineTo(x, y)
    p.close()
    c.drawPath(p, fill=fill, stroke=stroke)

def tip_box(text, kind='tip'):
    colors_map = {'tip': (C_GREEN_LT, C_GREEN, '+ TIP'), 'warn': (C_RED_LT, C_RED, '! CAUTION'),
                  'info': (C_BLUE_LT, C_BLUE, 'i INFO'), 'rule': (C_GOLD_LT, C_GOLD, '* RULE')}
    bg, fg, label = colors_map.get(kind, (C_BLUE_LT, C_BLUE, 'i'))
    style = {'tip': ST['tip_text'], 'warn': ST['warn_text'], 'info': ST['info_text'], 'rule': ST['rule_text']}[kind]
    data = [[Paragraph(f'<b>{label}</b>', ParagraphStyle('lb', fontSize=9, fontName='Helvetica-Bold', textColor=fg, leading=12)),
             Paragraph(text, style)]]
    t = Table(data, colWidths=[38, 410])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0),(-1,-1), bg),
        ('BOX', (0,0),(-1,-1), 0.8, fg),
        ('LEFTPADDING',(0,0),(-1,-1),8), ('RIGHTPADDING',(0,0),(-1,-1),8),
        ('TOPPADDING',(0,0),(-1,-1),6), ('BOTTOMPADDING',(0,0),(-1,-1),6),
        ('ROUNDEDCORNERS',[4,4,4,4]),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
    ]))
    return t

def section_header(text):
    return Paragraph(f'<font color="#1A5F9E"><b>{text}</b></font>', ST['sec_head'])

def chapter_header(num, title):
    items = []
    items.append(Spacer(1, 4))
    data = [[Paragraph(f'Chapter {num}', ParagraphStyle('cn', fontSize=10, fontName='Helvetica',
                textColor=colors.HexColor('#90B8D8'), leading=13, alignment=TA_LEFT)),
             Paragraph(title, ParagraphStyle('ct', fontSize=16, fontName='Helvetica-Bold',
                textColor=C_BLUE, leading=20, alignment=TA_LEFT))]]
    t = Table(data, colWidths=[60, 400])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1), C_BLUE_LT),
        ('BOX',(0,0),(-1,-1),0.5,C_BLUE),
        ('LEFTBORDER',(0,0),(0,-1),4,C_BLUE),
        ('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),
        ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
    ]))
    items.append(t)
    items.append(Spacer(1,10))
    return items

# ── Volume Profile Chart Flowable ─────────────────────────────────────────────
class VolumeProfileChart(Flowable):
    def __init__(self, width=460, height=280, show_labels=True, title=''):
        super().__init__()
        self.width = width
        self.height = height
        self.show_labels = show_labels
        self.title = title

    def draw(self):
        c = self.canv
        w, h = self.width, self.height
        chart_x = 10
        chart_w = 240
        label_x = chart_x + chart_w + 12

        # Background
        c.setFillColor(colors.HexColor('#FAFBFC'))
        c.roundRect(0, 0, w, h, 6, fill=1, stroke=0)
        c.setStrokeColor(C_GRAY_BD)
        c.setLineWidth(0.5)
        c.roundRect(0, 0, w, h, 6, fill=0, stroke=1)

        # Title
        if self.title:
            c.setFont('Helvetica-Bold', 10)
            c.setFillColor(C_BLUE)
            c.drawCentredString(w/2, h - 16, self.title)

        # Price levels (y coords in chart)
        top_y    = h - 30
        vah_y    = top_y - 60
        poc_y    = top_y - 110
        val_y    = top_y - 160
        bottom_y = top_y - 220

        price_range = 100  # total price range in pips
        # Bars: (vol_width, y_start, bar_h, is_va, is_poc)
        bars = [
            (12,  top_y-8,   8,  False, False),
            (20,  top_y-18,  8,  False, False),
            (35,  top_y-28,  8,  False, False),
            (50,  top_y-38,  8,  False, False),
            (65,  top_y-48,  8,  False, False),
            (80,  vah_y,     8,  True,  False),  # VAH
            (95,  vah_y-10,  8,  True,  False),
            (110, vah_y-20,  8,  True,  False),
            (130, vah_y-30,  8,  True,  False),
            (150, vah_y-40,  8,  True,  False),
            (170, poc_y,    12,  True,  True ),  # POC
            (145, poc_y-14,  8,  True,  False),
            (125, poc_y-24,  8,  True,  False),
            (110, poc_y-34,  8,  True,  False),
            (90,  poc_y-44,  8,  True,  False),
            (75,  val_y,     8,  True,  False),  # VAL
            (58,  val_y-10,  8,  False, False),
            (42,  val_y-20,  8,  False, False),
            (30,  val_y-30,  8,  False, False),
            (18,  val_y-40,  8,  False, False),
            (12,  bottom_y,  8,  False, False),
        ]

        # VA shading
        c.setFillColor(C_VA_BG)
        c.rect(chart_x, val_y-8, chart_w, (vah_y+8) - (val_y-8), fill=1, stroke=0)

        # Draw bars
        for vol_w, by, bh, is_va, is_poc in bars:
            if is_poc:
                c.setFillColor(C_POC)
            elif is_va:
                c.setFillColor(colors.HexColor('#27AE60'))
            else:
                c.setFillColor(colors.HexColor('#95A5A6'))
            c.roundRect(chart_x, by, vol_w, bh, 2, fill=1, stroke=0)

        # Key horizontal lines
        def dashed_line(y, color, width=0.8):
            c.setStrokeColor(color)
            c.setLineWidth(width)
            c.setDash(4, 3)
            c.line(chart_x, y, chart_x + chart_w, y)
            c.setDash()

        dashed_line(vah_y + 4, C_VAH, 1.0)
        dashed_line(poc_y + 6, C_POC, 1.5)
        dashed_line(val_y + 4, C_VAL, 1.0)

        # Candle chart (right side)
        candle_x = chart_x + chart_w + 8
        candle_w = w - candle_x - 60

        # Price axis prices (illustrative XAU values)
        prices = [
            (4500, top_y - 8),
            (4490, vah_y + 4),
            (4480, vah_y - 20),
            (4470, poc_y + 6),
            (4460, poc_y - 20),
            (4450, val_y + 4),
            (4440, val_y - 20),
            (4430, bottom_y),
        ]

        # Draw price axis
        c.setFont('Helvetica', 7)
        c.setFillColor(C_GRAY)
        for price, py in prices:
            c.drawString(candle_x + candle_w + 2, py - 3, str(price))
            c.setStrokeColor(colors.HexColor('#F0F0F0'))
            c.setLineWidth(0.3)
            c.setDash(2, 5)
            c.line(chart_x, py, candle_x + candle_w, py)
            c.setDash()

        # Draw labels
        if self.show_labels:
            # VAH label
            c.setFont('Helvetica-Bold', 8.5)
            c.setFillColor(C_VAH)
            c.drawString(label_x, vah_y + 6, 'VAH')
            c.setFont('Helvetica', 7.5)
            c.setFillColor(C_GRAY)
            c.drawString(label_x, vah_y - 4, 'Value Area High')
            c.drawString(label_x, vah_y - 14, 'Resistance zone')

            # POC label
            c.setFont('Helvetica-Bold', 8.5)
            c.setFillColor(C_POC)
            c.drawString(label_x, poc_y + 8, 'POC')
            c.setFont('Helvetica', 7.5)
            c.setFillColor(C_GRAY)
            c.drawString(label_x, poc_y - 2, 'Point of Control')
            c.drawString(label_x, poc_y - 12, 'Sabse zyada trade')

            # VAL label
            c.setFont('Helvetica-Bold', 8.5)
            c.setFillColor(C_VAL)
            c.drawString(label_x, val_y + 6, 'VAL')
            c.setFont('Helvetica', 7.5)
            c.setFillColor(C_GRAY)
            c.drawString(label_x, val_y - 4, 'Value Area Low')
            c.drawString(label_x, val_y - 14, 'Support zone')

            # VA bracket
            c.setStrokeColor(C_GREEN)
            c.setLineWidth(1.5)
            c.setDash()
            mid_y = (vah_y + val_y) / 2
            bx = chart_x + chart_w + 4
            c.line(bx, val_y, bx, vah_y+8)
            c.line(bx, val_y, bx+3, val_y)
            c.line(bx, vah_y+8, bx+3, vah_y+8)
            c.setFont('Helvetica-Bold', 7.5)
            c.setFillColor(C_GREEN)
            c.drawString(bx + 4, mid_y, 'Value')
            c.drawString(bx + 4, mid_y - 10, 'Area')
            c.drawString(bx + 4, mid_y - 20, '(70%)')

        # Legend
        legend_y = 14
        items = [('POC', C_POC), ('Value Area', colors.HexColor('#27AE60')), ('Low Vol', colors.HexColor('#95A5A6'))]
        lx = 10
        for lbl, col in items:
            c.setFillColor(col)
            c.roundRect(lx, legend_y, 12, 8, 2, fill=1, stroke=0)
            c.setFont('Helvetica', 7.5)
            c.setFillColor(C_GRAY)
            c.drawString(lx + 15, legend_y + 1, lbl)
            lx += 70

# ── Trade Setup Diagram ───────────────────────────────────────────────────────
class TradeSetupDiagram(Flowable):
    """Shows a mini profile with entry/SL/TP arrows for a specific setup"""
    def __init__(self, setup_type='long_poc', width=420, height=200):
        super().__init__()
        self.width = width
        self.height = height
        self.setup_type = setup_type

    def draw(self):
        c = self.canv
        w, h = self.width, self.height

        # Background
        c.setFillColor(C_GRAY_LT)
        c.roundRect(0, 0, w, h, 6, fill=1, stroke=0)
        c.setStrokeColor(C_GRAY_BD)
        c.setLineWidth(0.5)
        c.roundRect(0, 0, w, h, 6, fill=0, stroke=1)

        chart_l = 80
        chart_r = w - 100
        chart_cw = chart_r - chart_l

        vah_y  = h - 40
        poc_y  = h - 90
        val_y  = h - 140
        low_y  = h - 180

        # VA background
        c.setFillColor(C_VA_BG)
        c.rect(chart_l, val_y, chart_cw, vah_y - val_y, fill=1, stroke=0)

        def hline(y, color, dash=True, width=1):
            c.setStrokeColor(color)
            c.setLineWidth(width)
            if dash: c.setDash(5, 3)
            else: c.setDash()
            c.line(chart_l, y, chart_r, y)
            c.setDash()

        hline(vah_y, C_VAH, width=1)
        hline(poc_y, C_POC, width=1.5)
        hline(val_y, C_VAL, width=1)

        # Price labels left
        def plabel(y, txt, color):
            c.setFont('Helvetica-Bold', 8)
            c.setFillColor(color)
            c.drawRightString(chart_l - 4, y - 4, txt)

        plabel(vah_y, 'VAH', C_VAH)
        plabel(poc_y, 'POC', C_POC)
        plabel(val_y, 'VAL', C_VAL)

        setup = self.setup_type

        if setup == 'long_poc':
            # Entry at POC, SL below VAL, TP at VAH
            entry_y = poc_y
            sl_y    = low_y + 5
            tp_y    = vah_y + 15

            # Entry candle
            cx = chart_l + chart_cw * 0.35
            c.setFillColor(C_GREEN)
            c.roundRect(cx - 4, entry_y - 5, 8, 20, 1, fill=1, stroke=0)
            c.setStrokeColor(C_GREEN)
            c.setLineWidth(1)
            c.line(cx, entry_y + 15, cx, entry_y + 22)
            c.line(cx, entry_y - 5, cx, entry_y - 10)

            # SL zone
            c.setFillColor(colors.HexColor('#FDECEA'))
            c.rect(chart_l, sl_y, chart_cw, val_y - sl_y, fill=1, stroke=0)
            c.setStrokeColor(C_RED)
            c.setLineWidth(0.8)
            c.setDash(3, 3)
            c.line(chart_l, sl_y, chart_r, sl_y)
            c.setDash()

            # TP line
            c.setFillColor(colors.HexColor('#EAF8EE'))
            c.rect(chart_l, vah_y, chart_cw, tp_y - vah_y, fill=1, stroke=0)
            c.setStrokeColor(C_GREEN)
            c.setLineWidth(0.8)
            c.setDash(3, 3)
            c.line(chart_l, tp_y, chart_r, tp_y)
            c.setDash()

            # Arrows
            arr_x = chart_l + chart_cw * 0.65
            c.setStrokeColor(C_GREEN)
            c.setLineWidth(1.5)
            c.setFillColor(C_GREEN)
            c.line(arr_x, entry_y, arr_x, tp_y)
            # arrowhead up
            c.setFillColor(C_GREEN)
            draw_polygon(c, [(arr_x-4, tp_y+8), (arr_x+4, tp_y+8), (arr_x, tp_y)], fill=1, stroke=0)

            c.setStrokeColor(C_GREEN)
            c.setFillColor(C_GREEN)
            c.setLineWidth(1)
            c.line(arr_x, entry_y, arr_x, sl_y)
            draw_polygon(c, [(arr_x-3, sl_y-6), (arr_x+3, sl_y-6), (arr_x, sl_y)], fill=1, stroke=0)

            # Labels right
            rx = chart_r + 6
            c.setFont('Helvetica-Bold', 8)
            c.setFillColor(C_GREEN)
            c.drawString(rx, tp_y - 4,    'TP')
            c.setFillColor(C_BLUE)
            c.drawString(rx, entry_y - 4, 'BUY')
            c.setFillColor(C_RED)
            c.drawString(rx, sl_y - 4,    'SL')

            # R:R
            rr_ratio = round((tp_y - entry_y) / max(1, entry_y - sl_y), 1)
            c.setFont('Helvetica-Bold', 9)
            c.setFillColor(C_DARK)
            c.drawCentredString(w/2, 8, f'Risk:Reward = 1 : {rr_ratio}  |  Entry: POC  |  SL: VAL ke neeche  |  TP: VAH')

        elif setup == 'short_vah':
            entry_y = vah_y - 5
            sl_y    = vah_y + 30
            tp_y    = poc_y - 10

            cx = chart_l + chart_cw * 0.35
            c.setFillColor(C_RED)
            c.roundRect(cx-4, entry_y - 18, 8, 20, 1, fill=1, stroke=0)
            c.setStrokeColor(C_RED)
            c.setLineWidth(1)
            c.line(cx, entry_y, cx, entry_y+5)
            c.line(cx, entry_y-18, cx, entry_y-24)

            c.setFillColor(colors.HexColor('#FDECEA'))
            c.rect(chart_l, vah_y, chart_cw, sl_y - vah_y, fill=1, stroke=0)
            c.setStrokeColor(C_RED)
            c.setLineWidth(0.8); c.setDash(3,3)
            c.line(chart_l, sl_y, chart_r, sl_y)
            c.setDash()

            arr_x = chart_l + chart_cw * 0.65
            c.setStrokeColor(C_RED)
            c.setFillColor(C_RED)
            c.setLineWidth(1.5)
            c.line(arr_x, entry_y, arr_x, tp_y)
            draw_polygon(c, [(arr_x-4, tp_y+8), (arr_x+4, tp_y+8), (arr_x, tp_y)], fill=1, stroke=0)

            c.setStrokeColor(C_GREEN)
            c.setFillColor(C_GREEN)
            c.setLineWidth(1)
            c.line(arr_x, entry_y, arr_x, sl_y)
            draw_polygon(c, [(arr_x-3, sl_y-6), (arr_x+3, sl_y-6), (arr_x, sl_y)], fill=1, stroke=0)

            rx = chart_r + 6
            c.setFont('Helvetica-Bold', 8)
            c.setFillColor(C_GREEN)
            c.drawString(rx, sl_y - 4, 'SL')
            c.setFillColor(C_RED)
            c.drawString(rx, entry_y - 4, 'SELL')
            c.setFillColor(C_GREEN)
            c.drawString(rx, tp_y - 4, 'TP')

            rr_ratio = round((entry_y - tp_y) / max(1, sl_y - entry_y), 1)
            c.setFont('Helvetica-Bold', 9)
            c.setFillColor(C_DARK)
            c.drawCentredString(w/2, 8, f'Risk:Reward = 1 : {rr_ratio}  |  Entry: VAH Rejection  |  SL: VAH ke upar  |  TP: POC')

        elif setup == 'breakout':
            entry_y = vah_y + 15
            sl_y    = poc_y + 5
            tp_y    = vah_y + 55

            # Breakout candle above VAH
            cx = chart_l + chart_cw * 0.35
            c.setFillColor(C_GREEN)
            c.roundRect(cx-4, vah_y, 8, 30, 1, fill=1, stroke=0)
            c.setStrokeColor(C_GREEN); c.setLineWidth(1)
            c.line(cx, vah_y+30, cx, vah_y+38)
            c.line(cx, vah_y, cx, vah_y-8)

            # Retest candle
            rx2 = chart_l + chart_cw * 0.5
            c.setFillColor(C_RED)
            c.roundRect(rx2-4, vah_y-12, 8, 20, 1, fill=1, stroke=0)

            # Entry candle (bounce)
            ex = chart_l + chart_cw * 0.62
            c.setFillColor(C_GREEN)
            c.roundRect(ex-4, vah_y, 8, 22, 1, fill=1, stroke=0)

            # TP / SL lines
            c.setStrokeColor(C_GREEN); c.setLineWidth(0.8); c.setDash(3,3)
            c.line(chart_l, tp_y, chart_r, tp_y); c.setDash()
            c.setStrokeColor(C_RED); c.setLineWidth(0.8); c.setDash(3,3)
            c.line(chart_l, sl_y, chart_r, sl_y); c.setDash()

            lrx = chart_r + 6
            c.setFont('Helvetica-Bold', 8)
            c.setFillColor(C_GREEN); c.drawString(lrx, tp_y - 4, 'TP')
            c.setFillColor(C_BLUE);  c.drawString(lrx, entry_y - 4, 'BUY')
            c.setFillColor(C_RED);   c.drawString(lrx, sl_y - 4, 'SL')

            c.setFont('Helvetica-Bold', 9); c.setFillColor(C_DARK)
            c.drawCentredString(w/2, 8, 'Entry: VAH Retest ke baad | SL: POC ke neeche | TP: Extension target')


# ── Session Profile Diagram ───────────────────────────────────────────────────
class SessionDiagram(Flowable):
    def __init__(self, width=460, height=180):
        super().__init__()
        self.width = width
        self.height = height

    def draw(self):
        c = self.canv
        w, h = self.width, self.height
        sessions = [
            ('Asian', '21:00-06:00', C_BLUE,   colors.HexColor('#EBF5FB'), 0.0, 0.28),
            ('London','03:00-12:00', C_GREEN,   colors.HexColor('#EAFAF1'), 0.25, 0.3),
            ('NY AM', '08:00-13:00', C_ORANGE,  colors.HexColor('#FEF9E7'), 0.52, 0.24),
            ('NY PM', '13:00-17:00', C_RED,     colors.HexColor('#FDEDEC'), 0.74, 0.22),
        ]
        pad = 8
        bh = h - 50
        by = 35

        # Timeline bar
        c.setFillColor(colors.HexColor('#ECF0F1'))
        c.roundRect(pad, by, w - 2*pad, bh, 6, fill=1, stroke=0)

        for name, time, col, ltcol, start, width_frac in sessions:
            sx = pad + (w - 2*pad) * start + 2
            sw = (w - 2*pad) * width_frac - 4
            c.setFillColor(ltcol)
            c.roundRect(sx, by+2, sw, bh-4, 4, fill=1, stroke=0)
            c.setStrokeColor(col)
            c.setLineWidth(1.2)
            c.roundRect(sx, by+2, sw, bh-4, 4, fill=0, stroke=1)

            # Session name
            c.setFont('Helvetica-Bold', 9)
            c.setFillColor(col)
            c.drawCentredString(sx + sw/2, by + bh - 16, name)

            # POC marker
            poc_y_frac = 0.4 + (sessions.index((name, time, col, ltcol, start, width_frac)) * 0.05)
            poc_y = by + bh * (1 - poc_y_frac)
            c.setStrokeColor(col)
            c.setLineWidth(1.5)
            c.setDash(4, 3)
            c.line(sx + 4, poc_y, sx + sw - 4, poc_y)
            c.setDash()
            c.setFont('Helvetica', 7.5)
            c.setFillColor(col)
            c.drawCentredString(sx + sw/2, poc_y - 10, 'POC')
            c.drawCentredString(sx + sw/2, by + 10, time)

        # Title
        c.setFont('Helvetica-Bold', 10)
        c.setFillColor(C_DARK)
        c.drawCentredString(w/2, h - 12, 'Session-Wise Fixed Volume Profile — Har Session ka Alag POC')


# ── Build PDF ─────────────────────────────────────────────────────────────────
output_path = 'Fixed_Volume_Profile_Guide.pdf'
if os.path.dirname(output_path):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

def on_first_page(canvas, doc):
    canvas.saveState()
    # Deep blue gradient header area
    canvas.setFillColor(colors.HexColor('#0D2B4E'))
    canvas.rect(0, H - 210, W, 210, fill=1, stroke=0)
    # Gold accent strip
    canvas.setFillColor(C_GOLD_MED)
    canvas.rect(0, H - 215, W, 5, fill=1, stroke=0)
    # Decorative circles
    canvas.setFillColor(colors.HexColor('#1A3F6B'))
    canvas.circle(W - 40, H - 30, 80, fill=1, stroke=0)
    canvas.circle(30, H - 180, 60, fill=1, stroke=0)
    # Title
    canvas.setFont('Helvetica-Bold', 28)
    canvas.setFillColor(C_WHITE)
    canvas.drawCentredString(W/2, H - 80, 'Fixed Volume Profile')
    canvas.setFont('Helvetica-Bold', 20)
    canvas.setFillColor(C_GOLD_MED)
    canvas.drawCentredString(W/2, H - 110, 'Complete Trading Guide')
    canvas.setFont('Helvetica', 13)
    canvas.setFillColor(colors.HexColor('#A8C8E8'))
    canvas.drawCentredString(W/2, H - 135, 'XAU/USD | Gold Trading | Step-by-Step in Hindi')
    canvas.setFont('Helvetica', 10)
    canvas.setFillColor(colors.HexColor('#8899AA'))
    canvas.drawCentredString(W/2, H - 160, 'Beginner se Advanced tak — Sab kuch ek jagah')
    # Bottom bar
    canvas.setFillColor(colors.HexColor('#F0F4F8'))
    canvas.rect(0, 0, W, 25, fill=1, stroke=0)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(C_GRAY)
    canvas.drawCentredString(W/2, 8, 'Fixed Volume Profile Trading Guide  |  For Educational Purposes Only')
    canvas.restoreState()

def on_later_pages(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor('#F0F4F8'))
    canvas.rect(0, 0, W, 22, fill=1, stroke=0)
    canvas.setStrokeColor(C_GOLD_MED)
    canvas.setLineWidth(0.8)
    canvas.line(25, 22, W - 25, 22)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(C_GRAY)
    canvas.drawString(25, 7, 'Fixed Volume Profile Guide')
    canvas.drawRightString(W - 25, 7, f'Page {doc.page}')
    # Header line
    canvas.setStrokeColor(C_GOLD_MED)
    canvas.setLineWidth(0.5)
    canvas.line(25, H - 20, W - 25, H - 20)
    canvas.restoreState()

doc = SimpleDocTemplate(
    output_path, pagesize=A4,
    leftMargin=25*mm, rightMargin=25*mm,
    topMargin=22*mm, bottomMargin=20*mm,
    title='Fixed Volume Profile Trading Guide',
    author='Trading Education'
)

story = []
P = Paragraph

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# COVER spacer (header is painted via canvas)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story.append(Spacer(1, 130))

# Table of contents
toc_data = [
    [P('<b>Chapter</b>', ST['tbl_hdr']), P('<b>Topic</b>', ST['tbl_hdr']), P('<b>Page</b>', ST['tbl_hdr'])],
    [P('1', ST['tbl_cell']), P('Volume Profile Kya Hai? — Basic Concepts', ST['tbl_cell']), P('2', ST['tbl_cell'])],
    [P('2', ST['tbl_cell']), P('3 Key Levels — POC, VAH, VAL in Detail', ST['tbl_cell']), P('3', ST['tbl_cell'])],
    [P('3', ST['tbl_cell']), P('Fixed vs. Rolling Profile — Kab Use Karein?', ST['tbl_cell']), P('4', ST['tbl_cell'])],
    [P('4', ST['tbl_cell']), P('Session-Wise Profile — Asian/London/NY Method', ST['tbl_cell']), P('5', ST['tbl_cell'])],
    [P('5', ST['tbl_cell']), P('5 Advanced Trade Setups with Real Examples', ST['tbl_cell']), P('6', ST['tbl_cell'])],
    [P('6', ST['tbl_cell']), P('Stop Loss aur Target — Exact Rules', ST['tbl_cell']), P('9', ST['tbl_cell'])],
    [P('7', ST['tbl_cell']), P('Multi-Timeframe Confluence Strategy', ST['tbl_cell']), P('10', ST['tbl_cell'])],
    [P('8', ST['tbl_cell']), P('Common Mistakes aur Unse Kaise Bachein', ST['tbl_cell']), P('11', ST['tbl_cell'])],
    [P('9', ST['tbl_cell']), P('Quick Reference Cheat Sheet', ST['tbl_cell']), P('12', ST['tbl_cell'])],
]
toc_tbl = Table(toc_data, colWidths=[28, 350, 38])
toc_tbl.setStyle(TableStyle([
    ('BACKGROUND', (0,0),(-1,0), C_BLUE),
    ('BACKGROUND', (0,1),(-1,1), C_GRAY_LT),
    ('BACKGROUND', (0,2),(-1,2), C_WHITE),
    ('ROWBACKGROUNDS', (0,1),(-1,-1), [C_GRAY_LT, C_WHITE]),
    ('BOX', (0,0),(-1,-1), 0.5, C_GRAY_BD),
    ('INNERGRID', (0,0),(-1,-1), 0.3, C_GRAY_BD),
    ('ALIGN', (0,0),(-1,-1), 'CENTER'),
    ('ALIGN', (1,0),(1,-1), 'LEFT'),
    ('LEFTPADDING',(1,0),(1,-1),8),
    ('TOPPADDING', (0,0),(-1,-1), 5),
    ('BOTTOMPADDING', (0,0),(-1,-1), 5),
    ('ROUNDEDCORNERS',[4,4,4,4]),
]))
story.append(P('<b>TABLE OF CONTENTS</b>', ParagraphStyle('toc_h', fontSize=12,
    fontName='Helvetica-Bold', textColor=C_BLUE, alignment=TA_CENTER, leading=16, spaceAfter=8)))
story.append(toc_tbl)

story.append(PageBreak())

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CHAPTER 1
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story += chapter_header(1, 'Volume Profile Kya Hai?')

story.append(P('Volume Profile ek powerful trading tool hai jo yeh batata hai ki <b>kaunsi price par kitna volume trade hua.</b> Normal volume indicator sirf time ke saath volume dikhata hai — lekin Volume Profile price ke saath volume dikhata hai.', ST['body']))
story.append(Spacer(1, 6))
story.append(tip_box('Sochiye: 100 log market mein trade kar rahe hain. 60 log 4,470 ke paas trade karte hain, 20 log 4,490 par, 20 log 4,450 par. Toh 4,470 = HIGH VOLUME area = sabka "fair price". Yahi POC ban jaata hai.', 'info'))
story.append(Spacer(1, 8))

# Comparison table
cmp_data = [
    [P('<b>Normal Volume Indicator</b>', ST['tbl_hdr']), P('<b>Volume Profile</b>', ST['tbl_hdr'])],
    [P('Time ke saath volume dikhata hai', ST['tbl_cell']), P('Price ke saath volume dikhata hai', ST['tbl_cell'])],
    [P('Candle ke neeche bar hoti hai', ST['tbl_cell']), P('Chart ke side par horizontal bar hoti hai', ST['tbl_cell'])],
    [P('Kab trade hua — yeh batata hai', ST['tbl_cell']), P('Kahan trade hua — yeh batata hai', ST['tbl_cell'])],
    [P('Support/resistance nahi dikhata', ST['tbl_cell']), P('Exact S/R levels deta hai', ST['tbl_cell'])],
]
cmp_tbl = Table(cmp_data, colWidths=[225, 225])
cmp_tbl.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0), C_BLUE),
    ('ROWBACKGROUNDS',(0,1),(-1,-1),[C_GRAY_LT, C_WHITE]),
    ('BOX',(0,0),(-1,-1),0.5,C_GRAY_BD),
    ('INNERGRID',(0,0),(-1,-1),0.3,C_GRAY_BD),
    ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
    ('LEFTPADDING',(0,0),(-1,-1),8),
]))
story.append(P('<b>Volume Indicator vs Volume Profile — Fark kya hai?</b>', ST['sec_head']))
story.append(cmp_tbl)
story.append(Spacer(1, 12))

story.append(P('<b>Volume Profile ka Visual — Kaisa dikhta hai?</b>', ST['sec_head']))
story.append(VolumeProfileChart(width=460, height=260, title='Volume Profile Anatomy — XAU/USD Example'))
story.append(P('Upar diagram mein: Orange bar (POC) sabse lamba hai — yahan sabse zyada trading hui. Green zone = Value Area (middle 70% volume). Gray bars = kam volume wale levels.', ST['caption']))

story.append(PageBreak())

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CHAPTER 2
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story += chapter_header(2, '3 Key Levels — POC, VAH, VAL')

# POC
story.append(section_header('1. POC — Point of Control'))
story.append(P('Profile ka <b>sabse lamba bar.</b> Yeh voh price hai jahan iss time period mein sabse zyada buying aur selling hui.', ST['body']))

poc_data = [
    [P('<b>Property</b>', ST['tbl_hdr']), P('<b>Detail</b>', ST['tbl_hdr'])],
    [P('Definition', ST['tbl_cell']),   P('Highest volume price level in selected range', ST['tbl_cell'])],
    [P('Behaviour', ST['tbl_cell']),    P('Market baar baar yahan wapas aata hai — "magnetic" level', ST['tbl_cell'])],
    [P('Trend mein', ST['tbl_cell']),   P('Uptrend: price POC ke upar — POC = support. Downtrend: POC ke neeche — POC = resistance', ST['tbl_cell'])],
    [P('Best Use', ST['tbl_cell']),     P('Entry zone, tightest SL placement, mean reversion target', ST['tbl_cell'])],
    [P('Color (chart)', ST['tbl_cell']),P('Orange/Yellow — profile ka sabse prominent bar', ST['tbl_cell'])],
]
poc_tbl = Table(poc_data, colWidths=[100, 350])
poc_tbl.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0), C_ORANGE),
    ('ROWBACKGROUNDS',(0,1),(-1,-1),[C_ORANGE_LT, C_WHITE]),
    ('BOX',(0,0),(-1,-1),0.5,C_ORANGE),
    ('INNERGRID',(0,0),(-1,-1),0.3,C_GRAY_BD),
    ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
    ('LEFTPADDING',(0,0),(-1,-1),8),
]))
story.append(poc_tbl)
story.append(Spacer(1, 8))
story.append(tip_box('Real Example: Gold (XAU) ki chart par agar 4,470 POC hai aur price 4,480 se girti hai 4,470 par — yahan buy karo. POC pe price bounce karne ki probability bahut high hoti hai.', 'tip'))
story.append(Spacer(1, 10))

# VAH
story.append(section_header('2. VAH — Value Area High'))
story.append(P('<b>Value Area ka upar ka boundary.</b> Middle 70% volume ke zone ka high point. Yeh ek strong resistance hoti hai jab price bahar se andar aane ki koshish kare.', ST['body']))
story.append(tip_box('Rule: Agar price VAH ke upar close kare — bullish breakout confirm. Agar VAH se reject ho — short entry opportunity. Aapki Gold chart mein Asian session ka VAH = 4,520 area tha.', 'rule'))
story.append(Spacer(1, 10))

# VAL
story.append(section_header('3. VAL — Value Area Low'))
story.append(P('<b>Value Area ka neeche ka boundary.</b> Jab price VAL ke paas aaye, yeh strong support hoti hai. Agar VAL break ho jaaye, bearish pressure strong hai.', ST['body']))
story.append(tip_box('CAUTION: VAL break + retest = Short entry. Lekin agar quickly wapas VAL ke andar jaaye = "False Breakdown" — yeh trap hota hai. Confirmation candle ka wait karo.', 'warn'))
story.append(Spacer(1, 10))

# HVN / LVN
story.append(section_header('4. HVN aur LVN — Bonus Levels'))
lvn_data = [
    [P('<b>Level</b>', ST['tbl_hdr']), P('<b>Naam</b>', ST['tbl_hdr']), P('<b>Behaviour</b>', ST['tbl_hdr']), P('<b>Trading Use</b>', ST['tbl_hdr'])],
    [P('HVN', ST['tbl_cell']), P('High Volume Node', ST['tbl_cell']),
     P('Strong S/R — price yahan slow hoti hai', ST['tbl_cell']), P('Entry, target', ST['tbl_cell'])],
    [P('LVN', ST['tbl_cell']), P('Low Volume Node', ST['tbl_cell']),
     P('Price yahan se FAST move karti hai — koi resistance nahi', ST['tbl_cell']), P('Tight SL, fast move expect karo', ST['tbl_cell'])],
]
lvn_tbl = Table(lvn_data, colWidths=[40, 100, 210, 100])
lvn_tbl.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0), C_BLUE),
    ('ROWBACKGROUNDS',(0,1),(-1,-1),[C_BLUE_LT, C_WHITE]),
    ('BOX',(0,0),(-1,-1),0.5,C_GRAY_BD),
    ('INNERGRID',(0,0),(-1,-1),0.3,C_GRAY_BD),
    ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
    ('LEFTPADDING',(0,0),(-1,-1),8),
]))
story.append(lvn_tbl)

story.append(PageBreak())

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CHAPTER 3
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story += chapter_header(3, 'Fixed vs. Rolling Profile — Kab Use Karein?')

story.append(P('Volume Profile do tarah se use hoti hai: <b>Fixed</b> (specific range) aur <b>Rolling/Visible Range</b> (screen dikhta hua sab). Dono ka use alag situations mein hota hai.', ST['body']))
story.append(Spacer(1, 8))

fr_data = [
    [P('<b>Type</b>', ST['tbl_hdr']), P('<b>Kaise Kaam Karta Hai</b>', ST['tbl_hdr']), P('<b>Best Use</b>', ST['tbl_hdr']), P('<b>Example</b>', ST['tbl_hdr'])],
    [P('Fixed Range', ST['tbl_cell']),
     P('Aap manually start aur end date/time select karte ho', ST['tbl_cell']),
     P('Specific session, day, week ya event ka analysis', ST['tbl_cell']),
     P('Sirf Asian session ka profile lagao', ST['tbl_cell'])],
    [P('Visible Range', ST['tbl_cell']),
     P('Jo candles screen par dikh rahi hain unka profile automatically', ST['tbl_cell']),
     P('Quick overview, naya trader ke liye', ST['tbl_cell']),
     P('15m chart khola, sabka ek saath profile', ST['tbl_cell'])],
    [P('Session Volume', ST['tbl_cell']),
     P('Har session automatically alag profile banata hai', ST['tbl_cell']),
     P('Multi-session analysis — BEST METHOD', ST['tbl_cell']),
     P('Asian + London + NY alag alag POC', ST['tbl_cell'])],
    [P('Composite', ST['tbl_cell']),
     P('Multiple sessions combine karke ek profile', ST['tbl_cell']),
     P('Week ya month ka overall picture', ST['tbl_cell']),
     P('Puri week ka POC = week ka fair value', ST['tbl_cell'])],
]
fr_tbl = Table(fr_data, colWidths=[65, 145, 130, 110])
fr_tbl.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0), C_BLUE),
    ('ROWBACKGROUNDS',(0,1),(-1,-1),[C_GRAY_LT, C_WHITE]),
    ('BOX',(0,0),(-1,-1),0.5,C_GRAY_BD),
    ('INNERGRID',(0,0),(-1,-1),0.3,C_GRAY_BD),
    ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
    ('LEFTPADDING',(0,0),(-1,-1),6),
    ('VALIGN',(0,0),(-1,-1),'TOP'),
]))
story.append(fr_tbl)
story.append(Spacer(1, 10))
story.append(tip_box('RECOMMENDED SETUP: TradingView par "Fixed Range Volume Profile" tool use karo. Asian session start se end tak select karo → POC, VAH, VAL note karo. Phir London ke liye. Phir NY ke liye. Teen alag profiles = teen alag "fair prices" = confluence zones milenge.', 'tip'))

story.append(PageBreak())

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CHAPTER 4
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story += chapter_header(4, 'Session-Wise Profile — Asian/London/NY Method')

story.append(P('Gold (XAU/USD) mein session-wise volume profile sabse powerful method hai. Kyunki har session ke alag participants hote hain — Asia ke banks, London ke hedge funds, NY ke institutions. Har session apna "fair price" establish karta hai.', ST['body']))
story.append(Spacer(1, 8))
story.append(SessionDiagram(width=460, height=170))
story.append(P('Upar: Har session ka alag Fixed Profile aur alag POC. Jab do sessions ka POC overlap kare — woh STRONGEST level ban jaata hai.', ST['caption']))
story.append(Spacer(1, 10))

# Session times table
sess_data = [
    [P('<b>Session</b>', ST['tbl_hdr']), P('<b>IST Time</b>', ST['tbl_hdr']),
     P('<b>Character</b>', ST['tbl_hdr']), P('<b>Gold Behaviour</b>', ST['tbl_hdr'])],
    [P('Asian', ST['tbl_cell']),   P('02:30 - 11:30 IST', ST['tbl_cell']),
     P('Low volatility, range-bound', ST['tbl_cell']), P('Range banata hai, London ke liye liquidity set karta hai', ST['tbl_cell'])],
    [P('London', ST['tbl_cell']),  P('08:30 - 17:30 IST', ST['tbl_cell']),
     P('High volatility, breakouts', ST['tbl_cell']), P('Asian range ko break karta hai, strong moves', ST['tbl_cell'])],
    [P('NY AM', ST['tbl_cell']),   P('13:30 - 18:30 IST', ST['tbl_cell']),
     P('Highest volatility, news', ST['tbl_cell']), P('Biggest gold moves, US data pe reaction', ST['tbl_cell'])],
    [P('NY PM', ST['tbl_cell']),   P('18:30 - 22:30 IST', ST['tbl_cell']),
     P('Dwindling, range close', ST['tbl_cell']), P('Consolidation, day ka summary', ST['tbl_cell'])],
]
sess_tbl = Table(sess_data, colWidths=[55, 100, 130, 165])
sess_tbl.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0), C_BLUE),
    ('ROWBACKGROUNDS',(0,1),(-1,-1),[C_GRAY_LT, C_WHITE]),
    ('BOX',(0,0),(-1,-1),0.5,C_GRAY_BD),
    ('INNERGRID',(0,0),(-1,-1),0.3,C_GRAY_BD),
    ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
    ('LEFTPADDING',(0,0),(-1,-1),6),
    ('VALIGN',(0,0),(-1,-1),'TOP'),
]))
story.append(P('<b>Gold Trading Sessions — Indian Standard Time</b>', ST['sec_head']))
story.append(sess_tbl)
story.append(Spacer(1, 8))
story.append(tip_box('Step-by-step: (1) Asian session end par POC note karo. (2) London open par — agar price Asian POC ke upar hai = bullish bias. Neeche hai = bearish. (3) NY AM mein London POC ke saath confluence dhundho — wahan entry lo.', 'rule'))

story.append(PageBreak())

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CHAPTER 5
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story += chapter_header(5, '5 Advanced Trade Setups with Real Examples')

# Setup 1
story.append(section_header('Setup 1: POC Rejection — Easiest Setup'))
story.append(P('Jab price POC par aaye aur <b>reject ho jaaye</b> — yeh sabse reliable entry hoti hai. Market baar baar POC ko "fair value" maanta hai, isiliye wahan se bounce aata hai.', ST['body']))
story.append(TradeSetupDiagram(setup_type='long_poc', width=420, height=190))
story.append(P('Setup 1: Price POC par aaya, bounce diya, long entry liya. SL = VAL ke 3 ticks neeche. TP = VAH. Clean 1:2+ R:R.', ST['caption']))
story.append(Spacer(1, 6))

ex1_data = [
    [P('<b>  LIVE EXAMPLE — XAU/USD 15M (Aapki Chart)</b>', ParagraphStyle('eh', fontSize=10,
        fontName='Helvetica-Bold', textColor=C_WHITE, leading=14))],
    [P('Context: NY AM session. Gold 4,470 ke paas tha. London session ka POC = 4,468.<br/>'
       'Entry Signal: Price 4,468 par aaya, bearish candle ke baad bullish engulfing bana.<br/>'
       'Entry: 4,468 par BUY (market ya limit order)<br/>'
       'Stop Loss: 4,460 (VAL ke 3 ticks neeche) — Risk = 8 points<br/>'
       'Target 1: 4,490 (VAH) — Reward = 22 points — R:R = 1:2.7<br/>'
       'Target 2: Asian session high = 4,510 — R:R = 1:5.25<br/>'
       'Result: Price ne 4,490 hit kiya = 22 point profit on 0.1 lot = $220', ST['ex_body'])],
]
ex1_tbl = Table(ex1_data, colWidths=[452])
ex1_tbl.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0), C_GREEN),
    ('BACKGROUND',(0,1),(-1,1), C_GREEN_LT),
    ('BOX',(0,0),(-1,-1),0.5,C_GREEN),
    ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),
    ('LEFTPADDING',(0,0),(-1,-1),10),
]))
story.append(ex1_tbl)
story.append(Spacer(1, 14))

# Setup 2
story.append(section_header('Setup 2: VAH Rejection — Short Setup'))
story.append(P('Jab price <b>VAH ko test kare aur fail ho jaaye</b> — strong short entry. VAH ke upar close na ho toh bearish pressure strong hai.', ST['body']))
story.append(TradeSetupDiagram(setup_type='short_vah', width=420, height=190))
story.append(P('Setup 2: Price VAH par aaya, rejection candle bana, short entry. SL = VAH ke upar. TP = POC first, then VAL.', ST['caption']))
story.append(Spacer(1, 6))

ex2_data = [
    [P('<b>  LIVE EXAMPLE — XAU/USD (Asian to London Transition)</b>', ParagraphStyle('eh2', fontSize=10,
        fontName='Helvetica-Bold', textColor=C_WHITE, leading=14))],
    [P('Context: Asian session ne 4,480-4,520 range banaya. VAH = 4,520.<br/>'
       'London open par price 4,519 gaya aur doji/shooting star bana.<br/>'
       'Entry: 4,516 par SELL (confirmation ke baad)<br/>'
       'Stop Loss: 4,525 (VAH ke 5 ticks upar) — Risk = 9 points<br/>'
       'Target 1: 4,500 (Asian POC) — Reward = 16 points — R:R = 1:1.7<br/>'
       'Target 2: 4,485 (VAL area) — Reward = 31 points — R:R = 1:3.4', ST['ex_body'])],
]
ex2_tbl = Table(ex2_data, colWidths=[452])
ex2_tbl.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0), C_RED),
    ('BACKGROUND',(0,1),(-1,1), C_RED_LT),
    ('BOX',(0,0),(-1,-1),0.5,C_RED),
    ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),
    ('LEFTPADDING',(0,0),(-1,-1),10),
]))
story.append(ex2_tbl)

story.append(PageBreak())

# Setup 3
story.append(section_header('Setup 3: VA Breakout + Retest — Momentum Setup'))
story.append(P('Jab price <b>Value Area ke bahar close ho</b> aur phir retest kare — strong momentum trade. VAH ya VAL agar new support/resistance ban jaaye toh entry lo.', ST['body']))
story.append(TradeSetupDiagram(setup_type='breakout', width=420, height=190))
story.append(P('Setup 3: Price ne VAH break kiya, retest kiya (VAH = new support), phir bounce — long entry. Strong momentum trade.', ST['caption']))
story.append(Spacer(1, 6))

story.append(tip_box('RULE: Breakout ke baad minimum 2 candle wait karo confirmation ke liye. Agar immediately wapas VA mein ghus jaaye — trap hai, entry mat lo. Yeh "Failed Breakout" hota hai aur opposite direction mein trade karo.', 'warn'))
story.append(Spacer(1, 12))

# Setup 4
story.append(section_header('Setup 4: LVN Speed Trade — Fast Profit Setup'))
story.append(P('LVN (Low Volume Node) areas mein price <b>bahut tezi se move karti hai</b> kyunki yahan koi significant buying ya selling nahi hai. Ek baar price LVN mein ghuse, next HVN tak fast move expect karo.', ST['body']))

lvn_ex_data = [
    [P('<b>  LVN SPEED TRADE — How to Identify</b>', ParagraphStyle('eh3', fontSize=10,
        fontName='Helvetica-Bold', textColor=C_WHITE, leading=14))],
    [P('Step 1: Profile mein thin (short) bars dhundho — yeh LVN hai.<br/>'
       'Step 2: Upar aur neeche ke HVN (thick bars) note karo — yeh targets hain.<br/>'
       'Step 3: Jab price LVN enter kare, entry lo. SL = LVN ke bahar.<br/>'
       'Step 4: TP = next HVN ya POC. Price yahan fast pahunchti hai.<br/><br/>'
       '<b>Gold Example:</b> 4,455-4,462 ek LVN tha (thin bars). Jab price 4,455 cross kiya,<br/>'
       '4,470 (next HVN) tak 7 candles mein pahunch gayi — fast 15 point move.', ST['ex_body'])],
]
lvn_ex_tbl = Table(lvn_ex_data, colWidths=[452])
lvn_ex_tbl.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0), C_ORANGE),
    ('BACKGROUND',(0,1),(-1,1), C_ORANGE_LT),
    ('BOX',(0,0),(-1,-1),0.5,C_ORANGE),
    ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),
    ('LEFTPADDING',(0,0),(-1,-1),10),
]))
story.append(lvn_ex_tbl)
story.append(Spacer(1, 12))

# Setup 5
story.append(section_header('Setup 5: Multi-Session POC Confluence — BEST Setup'))
story.append(P('Jab <b>do ya teen sessions ka POC ek hi price par ya paas mein ho</b> — yeh sabse powerful level hota hai. Institutions wahan positions lete hain.', ST['body']))

conf_data = [
    [P('<b>Session</b>', ST['tbl_hdr']), P('<b>POC Level</b>', ST['tbl_hdr']), P('<b>Confluence?</b>', ST['tbl_hdr']), P('<b>Action</b>', ST['tbl_hdr'])],
    [P('Asian', ST['tbl_cell']),  P('4,468', ST['tbl_cell']), P('', ST['tbl_cell']), P('Note karo', ST['tbl_cell'])],
    [P('London', ST['tbl_cell']), P('4,470', ST['tbl_cell']), P('', ST['tbl_cell']), P('Asian se +2 points', ST['tbl_cell'])],
    [P('NY AM', ST['tbl_cell']),  P('4,469', ST['tbl_cell']),
     P('YES! 3 POC = 4,468-4,470', ParagraphStyle('grn', fontSize=9.5, fontName='Helvetica-Bold', textColor=C_GREEN, leading=13)),
     P('STRONG BUY ZONE!', ParagraphStyle('grn2', fontSize=9.5, fontName='Helvetica-Bold', textColor=C_GREEN, leading=13))],
]
conf_tbl = Table(conf_data, colWidths=[70, 100, 160, 120])
conf_tbl.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0), C_BLUE),
    ('BACKGROUND',(0,3),(-1,3), colors.HexColor('#D5F5E3')),
    ('ROWBACKGROUNDS',(0,1),(0,2),[C_GRAY_LT, C_WHITE]),
    ('BOX',(0,0),(-1,-1),0.8,C_BLUE),
    ('INNERGRID',(0,0),(-1,-1),0.3,C_GRAY_BD),
    ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
    ('LEFTPADDING',(0,0),(-1,-1),8),
    ('BOX',(0,3),(-1,3),1.5,C_GREEN),
]))
story.append(conf_tbl)

story.append(PageBreak())

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CHAPTER 6
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story += chapter_header(6, 'Stop Loss aur Target — Exact Rules')

story.append(P('Volume Profile ka sabse bada advantage yeh hai ki yeh <b>exact SL levels deta hai</b> — guessing nahi, structure-based SL.', ST['body']))
story.append(Spacer(1, 6))

sl_data = [
    [P('<b>Setup</b>', ST['tbl_hdr']), P('<b>Entry</b>', ST['tbl_hdr']),
     P('<b>Stop Loss</b>', ST['tbl_hdr']), P('<b>Target 1</b>', ST['tbl_hdr']), P('<b>Target 2</b>', ST['tbl_hdr'])],
    [P('Long at POC', ST['tbl_cell']),  P('POC par buy', ST['tbl_cell']),
     P('VAL ke 3t neeche', ST['tbl_cell']), P('VAH', ST['tbl_cell']), P('Next HVN', ST['tbl_cell'])],
    [P('Short at VAH', ST['tbl_cell']), P('VAH par sell', ST['tbl_cell']),
     P('VAH ke 3t upar', ST['tbl_cell']), P('POC', ST['tbl_cell']), P('VAL', ST['tbl_cell'])],
    [P('Long at VAL', ST['tbl_cell']),  P('VAL bounce par buy', ST['tbl_cell']),
     P('VAL ke 5t neeche', ST['tbl_cell']), P('POC', ST['tbl_cell']), P('VAH', ST['tbl_cell'])],
    [P('Long Breakout', ST['tbl_cell']), P('VAH retest par buy', ST['tbl_cell']),
     P('POC ke neeche', ST['tbl_cell']), P('+1 ATR', ST['tbl_cell']), P('+2 ATR', ST['tbl_cell'])],
    [P('LVN Speed', ST['tbl_cell']),    P('LVN enter hone par', ST['tbl_cell']),
     P('LVN ke dusre end par', ST['tbl_cell']), P('Next HVN', ST['tbl_cell']), P('POC', ST['tbl_cell'])],
]
sl_tbl = Table(sl_data, colWidths=[85, 95, 100, 80, 90])
sl_tbl.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0), C_BLUE),
    ('ROWBACKGROUNDS',(0,1),(-1,-1),[C_GRAY_LT, C_WHITE]),
    ('BOX',(0,0),(-1,-1),0.5,C_GRAY_BD),
    ('INNERGRID',(0,0),(-1,-1),0.3,C_GRAY_BD),
    ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
    ('LEFTPADDING',(0,0),(-1,-1),6),
]))
story.append(sl_tbl)
story.append(Spacer(1, 8))
story.append(tip_box('"3t" = 3 ticks = XAU mein approximately 30 cents ya 3 pips. Har broker mein tick size alag hoti hai — apne platform par check karo.', 'info'))
story.append(Spacer(1, 10))

story.append(section_header('Position Sizing — Kitna Risk Lein?'))

ps_data = [
    [P('<b>Account Size</b>', ST['tbl_hdr']), P('<b>Max Risk per Trade</b>', ST['tbl_hdr']),
     P('<b>SL = 10 pts, Lot Size</b>', ST['tbl_hdr']), P('<b>Potential Profit (1:2)</b>', ST['tbl_hdr'])],
    [P('$1,000', ST['tbl_cell']),  P('$20 (2%)', ST['tbl_cell']),  P('0.02 lot', ST['tbl_cell']), P('$40', ST['tbl_cell'])],
    [P('$5,000', ST['tbl_cell']),  P('$100 (2%)', ST['tbl_cell']), P('0.10 lot', ST['tbl_cell']), P('$200', ST['tbl_cell'])],
    [P('$10,000', ST['tbl_cell']), P('$200 (2%)', ST['tbl_cell']), P('0.20 lot', ST['tbl_cell']), P('$400', ST['tbl_cell'])],
]
ps_tbl = Table(ps_data, colWidths=[100, 130, 120, 102])
ps_tbl.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0), C_GOLD),
    ('ROWBACKGROUNDS',(0,1),(-1,-1),[C_GOLD_LT, C_WHITE]),
    ('BOX',(0,0),(-1,-1),0.5,C_GOLD),
    ('INNERGRID',(0,0),(-1,-1),0.3,C_GRAY_BD),
    ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
    ('LEFTPADDING',(0,0),(-1,-1),8),
]))
story.append(ps_tbl)
story.append(tip_box('GOLDEN RULE: Kabhi bhi ek trade mein 2% se zyada risk mat lo. Volume Profile bahut accurate levels deta hai — lekin market kabhi 100% predictable nahi hota.', 'warn'))

story.append(PageBreak())

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CHAPTER 7
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story += chapter_header(7, 'Multi-Timeframe Confluence Strategy')

story.append(P('Professional traders sirf ek timeframe nahi dekhte. <b>3-timeframe method</b> use karo: HTF se direction lo, MTF se level confirm karo, LTF se entry lo.', ST['body']))
story.append(Spacer(1, 8))

mtf_data = [
    [P('<b>Timeframe</b>', ST['tbl_hdr']), P('<b>Purpose</b>', ST['tbl_hdr']),
     P('<b>Volume Profile Type</b>', ST['tbl_hdr']), P('<b>What to Find</b>', ST['tbl_hdr'])],
    [P('4H / Daily\n(HTF)', ST['tbl_cell']),
     P('Bias — Kaunsi direction mein trade karein?', ST['tbl_cell']),
     P('Weekly ya Daily Composite Profile', ST['tbl_cell']),
     P('Weekly POC ke upar/neeche? = Bullish/Bearish', ST['tbl_cell'])],
    [P('1H\n(MTF)', ST['tbl_cell']),
     P('Zone confirm karo — kahan entry karein?', ST['tbl_cell']),
     P('Session Fixed Profile (Asian/London)', ST['tbl_cell']),
     P('1H POC, VAH, VAL note karo', ST['tbl_cell'])],
    [P('15M / 5M\n(LTF)', ST['tbl_cell']),
     P('Exact entry timing — kab entry karein?', ST['tbl_cell']),
     P('Current session profile', ST['tbl_cell']),
     P('Rejection candle, engulfing, pin bar dekho', ST['tbl_cell'])],
]
mtf_tbl = Table(mtf_data, colWidths=[70, 140, 125, 115])
mtf_tbl.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0), C_BLUE),
    ('ROWBACKGROUNDS',(0,1),(-1,-1),[C_BLUE_LT, C_WHITE]),
    ('BOX',(0,0),(-1,-1),0.5,C_GRAY_BD),
    ('INNERGRID',(0,0),(-1,-1),0.3,C_GRAY_BD),
    ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),
    ('LEFTPADDING',(0,0),(-1,-1),6),
    ('VALIGN',(0,0),(-1,-1),'TOP'),
]))
story.append(mtf_tbl)
story.append(Spacer(1, 10))

# Decision flow
story.append(section_header('Trade Decision — Step by Step Checklist'))
checklist = [
    ('1', 'Daily/4H chart dekho', 'Price weekly POC ke upar hai? = Bullish. Neeche? = Bearish.', C_BLUE),
    ('2', '1H profile lagao', 'Current session ka POC, VAH, VAL note karo.', C_BLUE),
    ('3', 'Confluence check karo', 'Kya 1H POC aur session POC paas paas hain? = Strong zone.', C_GREEN),
    ('4', '15M pe entry signal dekho', 'Rejection candle, engulfing, pin bar — confirmation ka wait karo.', C_ORANGE),
    ('5', 'SL aur TP set karo', 'SL = VAL/VAH ke paas. TP = opposite boundary ya next session POC.', C_RED),
    ('6', 'R:R check karo', 'Minimum 1:1.5 hona chahiye. 1:2 ya upar ideal hai.', C_GREEN),
]
for num, heading, detail, col in checklist:
    row = [[
        P(f'<b>{num}</b>', ParagraphStyle('num_s', fontSize=11, fontName='Helvetica-Bold',
            textColor=col, alignment=TA_CENTER, leading=14)),
        P(f'<b>{heading}</b><br/><font size="9" color="#444444">{detail}</font>',
          ParagraphStyle('ch_s', fontSize=10, fontName='Helvetica', leading=15))
    ]]
    rt = Table(row, colWidths=[28, 422])
    rt.setStyle(TableStyle([
        ('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('LINEBELOW',(0,0),(-1,-1),0.3,C_GRAY_BD),
        ('BACKGROUND',(0,0),(-1,-1),C_GRAY_LT),
    ]))
    story.append(rt)
story.append(Spacer(1, 8))

story.append(PageBreak())

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CHAPTER 8
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story += chapter_header(8, 'Common Mistakes aur Unse Kaise Bachein')

mistakes = [
    ('Sirf ek session ka profile dekhna',
     'Session profile sirf uss session ke liye valid hai. Har session ka alag profile lagao.',
     'warn'),
    ('POC pe blindly entry lena (no confirmation)',
     'POC ek zone hai, not a guaranteed bounce. Rejection candle ya price action confirm hone ke baad entry lo.',
     'warn'),
    ('LVN mein trade hold karna',
     'LVN mein price fast move karti hai — SL tight rakho ya quickly trail karo. LVN mein hold karna risky hai.',
     'warn'),
    ('HTF bias ignore karna',
     'Agar daily chart bearish hai aur tum 15M par long le rahe ho POC se — yeh 1H mein pooch lo: HTF support karta hai kya?',
     'warn'),
    ('Profile too narrow ya too wide set karna',
     'Narrow = incomplete picture. Wide = bahut average POC milega. Session-specific range select karo — start se end tak.',
     'info'),
    ('Volume Profile ko indicators ke saath confuse karna',
     'VP ke sath RSI ya MACD dhundho — overbought/oversold + VP level = extra confirmation. VP alone kaafi hai par aur tools se strengthen karo.',
     'tip'),
]

for mistake, solution, kind in mistakes:
    err_data = [[
        P(f'<b>Mistake:</b> {mistake}', ParagraphStyle('ms', fontSize=10, fontName='Helvetica-Bold',
            textColor=C_RED, leading=14)),
    ],[
        P(f'<b>Solution:</b> {solution}', ParagraphStyle('ss', fontSize=10, fontName='Helvetica',
            textColor=C_DARK, leading=14)),
    ]]
    et = Table(err_data, colWidths=[452])
    et.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0), C_RED_LT),
        ('BACKGROUND',(0,1),(-1,1), C_GREEN_LT),
        ('BOX',(0,0),(-1,-1),0.5,C_RED),
        ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
        ('LEFTPADDING',(0,0),(-1,-1),10),
    ]))
    story.append(et)
    story.append(Spacer(1, 6))

story.append(PageBreak())

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CHAPTER 9 — CHEAT SHEET
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story += chapter_header(9, 'Quick Reference Cheat Sheet')

story.append(P('Yeh page print karke screen ke paas rakh lo — trading karte waqt quick reference ke liye.', ST['body']))
story.append(Spacer(1, 8))

# Main cheat sheet table
cs_data = [
    [P('<b>LEVEL</b>', ST['tbl_hdr']), P('<b>KYA HOTA HAI</b>', ST['tbl_hdr']),
     P('<b>PRICE ABOVE</b>', ST['tbl_hdr']), P('<b>PRICE AT</b>', ST['tbl_hdr']), P('<b>PRICE BELOW</b>', ST['tbl_hdr'])],
    [P('POC', ParagraphStyle('poc_l', fontSize=10, fontName='Helvetica-Bold', textColor=C_ORANGE, leading=13)),
     P('Highest volume price', ST['tbl_cell']),
     P('Support — buy dips', ST['tbl_green']),
     P('Mean reversion trade', ST['tbl_cell']),
     P('Resistance — sell rallies', ST['tbl_red'])],
    [P('VAH', ParagraphStyle('vah_l', fontSize=10, fontName='Helvetica-Bold', textColor=C_BLUE, leading=13)),
     P('Value Area upper boundary', ST['tbl_cell']),
     P('Bullish — breakout mode', ST['tbl_green']),
     P('Short entry zone', ST['tbl_red']),
     P('Price in VA — mean rev.', ST['tbl_cell'])],
    [P('VAL', ParagraphStyle('val_l', fontSize=10, fontName='Helvetica-Bold', textColor=C_BLUE, leading=13)),
     P('Value Area lower boundary', ST['tbl_cell']),
     P('Price in VA — mean rev.', ST['tbl_cell']),
     P('Long entry zone', ST['tbl_green']),
     P('Bearish — breakdown mode', ST['tbl_red'])],
    [P('HVN', ParagraphStyle('hvn_l', fontSize=10, fontName='Helvetica-Bold', textColor=C_GREEN, leading=13)),
     P('Thick bars = lots of trade', ST['tbl_cell']),
     P('Strong support', ST['tbl_green']),
     P('Price slows here', ST['tbl_cell']),
     P('Strong resistance', ST['tbl_red'])],
    [P('LVN', ParagraphStyle('lvn_l', fontSize=10, fontName='Helvetica-Bold', textColor=C_RED, leading=13)),
     P('Thin bars = little trade', ST['tbl_cell']),
     P('Price speeds up here', ST['tbl_cell']),
     P('Fast move expected', ST['tbl_cell']),
     P('Price speeds up here', ST['tbl_cell'])],
]
cs_tbl = Table(cs_data, colWidths=[40, 110, 92, 92, 116])
cs_tbl.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0), C_DARK),
    ('ROWBACKGROUNDS',(0,1),(-1,-1),[C_GRAY_LT, C_WHITE]),
    ('BOX',(0,0),(-1,-1),0.8,C_DARK),
    ('INNERGRID',(0,0),(-1,-1),0.3,C_GRAY_BD),
    ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),
    ('LEFTPADDING',(0,0),(-1,-1),6),
    ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
]))
story.append(cs_tbl)
story.append(Spacer(1, 10))

# Entry rules quick ref
entry_quick = [
    [P('<b>SETUP</b>', ST['tbl_hdr']), P('<b>ENTRY TRIGGER</b>', ST['tbl_hdr']),
     P('<b>SL</b>', ST['tbl_hdr']), P('<b>MIN R:R</b>', ST['tbl_hdr'])],
    [P('POC Long', ST['tbl_cell']),    P('Bullish candle at POC', ST['tbl_cell']),    P('VAL -3t', ST['tbl_cell']),   P('1:1.5', ST['tbl_green'])],
    [P('POC Short', ST['tbl_cell']),   P('Bearish candle at POC', ST['tbl_cell']),    P('VAH +3t', ST['tbl_cell']),   P('1:1.5', ST['tbl_green'])],
    [P('VAH Short', ST['tbl_cell']),   P('Rejection at VAH', ST['tbl_cell']),         P('VAH +5t', ST['tbl_cell']),   P('1:2', ST['tbl_green'])],
    [P('VAL Long', ST['tbl_cell']),    P('Bounce at VAL', ST['tbl_cell']),            P('VAL -5t', ST['tbl_cell']),   P('1:2', ST['tbl_green'])],
    [P('Breakout', ST['tbl_cell']),    P('Retest after close outside VA', ST['tbl_cell']), P('POC',ST['tbl_cell']),  P('1:2', ST['tbl_green'])],
    [P('LVN Speed', ST['tbl_cell']),   P('Price enters LVN zone', ST['tbl_cell']),    P('LVN far edge', ST['tbl_cell']), P('1:1.5', ST['tbl_green'])],
]
eq_tbl = Table(entry_quick, colWidths=[80, 190, 80, 100])
eq_tbl.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0), C_GOLD),
    ('ROWBACKGROUNDS',(0,1),(-1,-1),[C_GOLD_LT, C_WHITE]),
    ('BOX',(0,0),(-1,-1),0.5,C_GOLD),
    ('INNERGRID',(0,0),(-1,-1),0.3,C_GRAY_BD),
    ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
    ('LEFTPADDING',(0,0),(-1,-1),8),
]))
story.append(P('<b>Entry Rules — Quick Reference</b>', ST['sec_head']))
story.append(eq_tbl)
story.append(Spacer(1, 10))

story.append(tip_box(
    'FINAL MANTRA: "Profile batata hai KAHAN trade karo. Price action batata hai KAB entry lo. '
    'R:R batata hai AYA TRADE LENA HAI YA NAHI." Teeno align ho tabhI trade lo.',
    'rule'))

story.append(Spacer(1, 14))
# Footer note
story.append(divider(C_GRAY_BD))
story.append(P('<i>This guide is for educational purposes only. Trading involves significant risk. '
               'Always paper trade first before using real money. Past performance does not guarantee future results.</i>',
               ParagraphStyle('disc', fontSize=8, fontName='Helvetica-Oblique', textColor=C_GRAY,
               alignment=TA_CENTER, leading=12)))

# ── Build ─────────────────────────────────────────────────────────────────────
doc.build(story,
          onFirstPage=on_first_page,
          onLaterPages=on_later_pages)

print(f"PDF created: {output_path}")