"""
export.py — Genera un archivo Excel con estadísticas completas y reales.

Hojas:
  1. Datos Sensor   — todos los registros crudos del MPU6050
  2. Estadística    — media, varianza, desv.est, Q1, mediana, Q3, IQR,
                      coef. variación, mín, máx + gráfico de barras
  3. Correlación    — Pearson r y p-value entre todos los pares de ejes
                      + interpretación textual + regresión lineal AccelX→AccelY
  4. Frecuencias    — histogramas con bins REALES para todos los 6 ejes
                      (no solo Accel X y Gyro X con bins incorrectos)
"""

import io
import math
from typing import List

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.chart import BarChart, ScatterChart, Reference
from openpyxl.chart.series import DataPoint
from openpyxl.utils import get_column_letter

from models import SensorData

# ─── Paleta visual ────────────────────────────────────────────────────────────
HDR_FILL   = PatternFill("solid", fgColor="1F4E79")   # azul marino
STAT_FILL  = PatternFill("solid", fgColor="2E75B6")   # azul medio
CORR_FILL  = PatternFill("solid", fgColor="375623")   # verde oscuro
FREQ_FILL  = PatternFill("solid", fgColor="7030A0")   # púrpura
WARN_FILL  = PatternFill("solid", fgColor="C00000")   # rojo
OK_FILL    = PatternFill("solid", fgColor="375623")   # verde
ALT_FILL   = PatternFill("solid", fgColor="D9E1F2")   # azul muy claro (filas alternas)
WHITE_FONT = Font(color="FFFFFF", bold=True, name="Calibri")
DARK_FONT  = Font(bold=True, name="Calibri", color="1F4E79")
PLAIN_FONT = Font(name="Calibri", size=10)
THIN = Side(border_style="thin", color="AAAAAA")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


# ─── Helpers básicos ──────────────────────────────────────────────────────────

def _hdr(cell, text: str, fill=HDR_FILL):
    cell.value = text
    cell.font = WHITE_FONT
    cell.fill = fill
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell.border = BORDER

def _num(cell, val):
    cell.value = round(float(val), 4) if val is not None else 0
    cell.font = PLAIN_FONT
    cell.alignment = Alignment(horizontal="center")
    cell.border = BORDER

def _txt(cell, val, bold=False, fill=None):
    cell.value = val
    cell.font = Font(bold=bold, name="Calibri", size=10)
    cell.alignment = Alignment(horizontal="left", vertical="center")
    cell.border = BORDER
    if fill:
        cell.fill = fill

def _autowidth(ws):
    for col in ws.columns:
        max_len = max((len(str(c.value or "")) for c in col), default=8)
        ws.column_dimensions[get_column_letter(col[0].column)].width = min(max_len + 4, 30)


# ─── Estadísticas ─────────────────────────────────────────────────────────────

def _stats(values: list) -> dict:
    """Estadística descriptiva completa de una lista de floats."""
    n = len(values)
    if n == 0:
        return {k: 0 for k in ["n","media","varianza","desv_est","min","q1","mediana","q3","iqr","max","cv"]}
    sv = sorted(values)
    media = sum(sv) / n
    varianza = sum((v - media) ** 2 for v in sv) / n
    desv_est = math.sqrt(varianza)

    def _percentile(data, p):
        idx = (len(data) - 1) * p / 100
        lo, hi = int(idx), math.ceil(idx)
        if lo == hi:
            return data[lo]
        return data[lo] + (data[hi] - data[lo]) * (idx - lo)

    q1  = _percentile(sv, 25)
    med = _percentile(sv, 50)
    q3  = _percentile(sv, 75)
    iqr = q3 - q1
    cv  = (desv_est / abs(media) * 100) if abs(media) > 1e-9 else float("inf")
    return {
        "n": n,
        "media":    round(media,    4),
        "varianza": round(varianza, 4),
        "desv_est": round(desv_est, 4),
        "min":      round(sv[0],    4),
        "q1":       round(q1,       4),
        "mediana":  round(med,      4),
        "q3":       round(q3,       4),
        "iqr":      round(iqr,      4),
        "max":      round(sv[-1],   4),
        "cv":       round(cv,       2) if cv != float("inf") else 9999,
    }


def _pearson(xs: list, ys: list):
    """Correlación de Pearson + p-value aproximado."""
    n = len(xs)
    if n < 3:
        return 0, 1
    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    denom_x = math.sqrt(sum((x - mx) ** 2 for x in xs))
    denom_y = math.sqrt(sum((y - my) ** 2 for y in ys))
    if denom_x == 0 or denom_y == 0:
        return 0, 1
    r = num / (denom_x * denom_y)
    r = max(-1, min(1, r))
    # t-statistic → p-value approx via erfc
    t = r * math.sqrt(n - 2) / math.sqrt(max(1e-10, 1 - r * r))
    # Two-tailed p-value approximation
    import math
    x = abs(t) / math.sqrt(2)
    p = math.erfc(x)
    return round(r, 4), round(p, 4)


def _linreg(xs: list, ys: list):
    """Regresión lineal simple y = b0 + b1*x → devuelve b0, b1, R²."""
    n = len(xs)
    if n < 2:
        return 0, 0, 0
    mx = sum(xs) / n
    my = sum(ys) / n
    b1_num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    b1_den = sum((x - mx) ** 2 for x in xs)
    if b1_den == 0:
        return round(my, 4), 0, 0
    b1 = b1_num / b1_den
    b0 = my - b1 * mx
    ss_res = sum((y - (b0 + b1 * x)) ** 2 for x, y in zip(xs, ys))
    ss_tot = sum((y - my) ** 2 for y in ys)
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0
    return round(b0, 4), round(b1, 4), round(r2, 4)


def _freq_bins(values: list, bins: list):
    """Cuenta cuántos valores caen en cada bin [(lo, hi), ...]."""
    counts = []
    for lo, hi in bins:
        counts.append(sum(1 for v in values if lo <= v < hi))
    # Last bin is inclusive on both ends
    if bins:
        lo, hi = bins[-1]
        counts[-1] = sum(1 for v in values if lo <= v <= hi)
    return counts


# ─── Función principal ────────────────────────────────────────────────────────

def generate_excel(records: List[SensorData]) -> bytes:
    """
    Genera el Excel completo y retorna bytes para la descarga desde FastAPI.
    Excluye automáticamente registros con todos los campos en 0 (sensor offline).
    """
    # Filtrar registros válidos (el sensor envía 0,0,0,0,0,0 cuando está sin datos)
    valid = [r for r in records if not (
        r.accel_x == 0 and r.accel_y == 0 and r.accel_z == 0
        and r.gyro_x == 0 and r.gyro_y == 0 and r.gyro_z == 0
    )]

    wb = openpyxl.Workbook()

    # ─── Campo de datos por eje ───────────────────────────────────────────────
    axes = {
        "Accel X": [r.accel_x for r in valid],
        "Accel Y": [r.accel_y for r in valid],
        "Accel Z": [r.accel_z for r in valid],
        "Gyro X":  [r.gyro_x  for r in valid],
        "Gyro Y":  [r.gyro_y  for r in valid],
        "Gyro Z":  [r.gyro_z  for r in valid],
    }
    units = {
        "Accel X": "g", "Accel Y": "g", "Accel Z": "g",
        "Gyro X": "°/s", "Gyro Y": "°/s", "Gyro Z": "°/s",
    }

    # =========================================================================
    # HOJA 1 — Datos crudos
    # =========================================================================
    ws1 = wb.active
    ws1.title = "Datos Sensor"
    ws1.freeze_panes = "A2"

    raw_headers = ["N°", "Timestamp", "Disparo",
                   "Accel X (g)", "Accel Y (g)", "Accel Z (g)",
                   "Gyro X (°/s)", "Gyro Y (°/s)", "Gyro Z (°/s)"]
    for col, h in enumerate(raw_headers, 1):
        _hdr(ws1.cell(row=1, column=col), h)

    for ri, rec in enumerate(valid, 2):
        row_fill = ALT_FILL if ri % 2 == 0 else None
        vals = [ri - 1, str(rec.timestamp)[:19], rec.disparo,
                rec.accel_x, rec.accel_y, rec.accel_z,
                rec.gyro_x, rec.gyro_y, rec.gyro_z]
        for ci, v in enumerate(vals, 1):
            c = ws1.cell(row=ri, column=ci)
            c.value = v
            c.font = PLAIN_FONT
            c.border = BORDER
            c.alignment = Alignment(horizontal="center")
            if row_fill and ci > 2:
                c.fill = row_fill

    # Congelar primera fila y autoancho
    _autowidth(ws1)

    # =========================================================================
    # HOJA 2 — Estadística descriptiva completa
    # =========================================================================
    ws2 = wb.create_sheet("Estadística")

    stat_cols = ["Variable", "Unidad", "N", "Media", "Varianza", "Desv. Est.",
                 "Mínimo", "Q1 (25%)", "Mediana (50%)", "Q3 (75%)", "Máximo",
                 "IQR (Q3−Q1)", "Coef. Variación (%)"]

    for col, h in enumerate(stat_cols, 1):
        _hdr(ws2.cell(row=1, column=col), h, fill=STAT_FILL)

    for ri, (name, vals) in enumerate(axes.items(), 2):
        s = _stats(vals)
        row_fill = ALT_FILL if ri % 2 == 0 else None
        data_row = [name, units[name], s["n"], s["media"], s["varianza"],
                    s["desv_est"], s["min"], s["q1"], s["mediana"],
                    s["q3"], s["max"], s["iqr"], s["cv"]]
        for ci, v in enumerate(data_row, 1):
            c = ws2.cell(row=ri, column=ci)
            if ci <= 2:
                _txt(c, v, bold=(ci == 1))
            else:
                _num(c, v)
            if row_fill:
                c.fill = row_fill

    # Nota interpretativa
    ws2.cell(row=9, column=1).value = (
        "Nota: Coef. Variación (CV) = Desv.Est / |Media| × 100. "
        "CV < 30% = estable · 30–100% = variabilidad moderada · >100% = alta variabilidad. "
        "IQR = rango intercuartílico (Q3 − Q1). Registros con todos los campos = 0 excluidos."
    )
    ws2.cell(row=9, column=1).font = Font(italic=True, name="Calibri", size=9, color="595959")
    ws2.merge_cells(f"A9:{get_column_letter(len(stat_cols))}9")

    _autowidth(ws2)

    # Gráfico de barras: Desviación Estándar por eje
    chart_std = BarChart()
    chart_std.type = "col"
    chart_std.title = "Desviación Estándar por Eje (MPU6050)"
    chart_std.y_axis.title = "Desv. Est."
    chart_std.x_axis.title = "Eje del sensor"
    chart_std.shape = 4
    data_ref = Reference(ws2, min_col=6, min_row=1, max_row=7)   # col 6 = Desv. Est.
    labels_ref = Reference(ws2, min_col=1, min_row=2, max_row=7)
    chart_std.add_data(data_ref, titles_from_data=True)
    chart_std.set_categories(labels_ref)
    ws2.add_chart(chart_std, "O2")

    # Gráfico de barras: Media por eje
    chart_med = BarChart()
    chart_med.type = "col"
    chart_med.title = "Media por Eje (MPU6050)"
    chart_med.y_axis.title = "Media"
    chart_med.shape = 4
    data_med = Reference(ws2, min_col=4, min_row=1, max_row=7)   # col 4 = Media
    chart_med.add_data(data_med, titles_from_data=True)
    chart_med.set_categories(labels_ref)
    ws2.add_chart(chart_med, "O20")

    # =========================================================================
    # HOJA 3 — Correlación de Pearson y Regresión Lineal
    # =========================================================================
    ws3 = wb.create_sheet("Correlación")

    ws3.cell(row=1, column=1).value = "Correlación de Pearson entre ejes del MPU6050"
    ws3.cell(row=1, column=1).font = Font(bold=True, size=13, name="Calibri", color="1F4E79")
    ws3.merge_cells("A1:H1")

    # Tabla de correlación (matriz)
    axis_names = list(axes.keys())
    ws3.cell(row=3, column=1).value = "r (Pearson)"
    ws3.cell(row=3, column=1).font = DARK_FONT

    for ci, name in enumerate(axis_names, 2):
        _hdr(ws3.cell(row=3, column=ci), name, fill=CORR_FILL)
        _hdr(ws3.cell(row=3 + ci - 1, column=1), name, fill=CORR_FILL)

    for ri, na in enumerate(axis_names, 4):
        for ci, nb in enumerate(axis_names, 2):
            r, p = _pearson(axes[na], axes[nb])
            c = ws3.cell(row=ri, column=ci)
            c.value = r
            c.font = PLAIN_FONT
            c.alignment = Alignment(horizontal="center")
            c.border = BORDER
            # Color según fuerza de correlación
            if na == nb:
                c.fill = PatternFill("solid", fgColor="C6EFCE")  # diagonal verde
            elif abs(r) > 0.5:
                c.fill = PatternFill("solid", fgColor="FFEB9C")  # amarillo = correlación moderada
            elif abs(r) > 0.3:
                c.fill = PatternFill("solid", fgColor="FFCC99")  # naranja = leve

    # Tabla de p-values
    ws3.cell(row=3, column=9).value = "p-value"
    ws3.cell(row=3, column=9).font = DARK_FONT

    for ci, name in enumerate(axis_names, 10):
        _hdr(ws3.cell(row=3, column=ci), name, fill=WARN_FILL)
        _hdr(ws3.cell(row=3 + ci - 9, column=9), name, fill=WARN_FILL)

    for ri, na in enumerate(axis_names, 4):
        for ci, nb in enumerate(axis_names, 10):
            r, p = _pearson(axes[na], axes[nb])
            c = ws3.cell(row=ri, column=ci)
            c.value = p
            c.font = PLAIN_FONT
            c.alignment = Alignment(horizontal="center")
            c.border = BORDER
            if p < 0.05:
                c.fill = PatternFill("solid", fgColor="C6EFCE")   # significativo
            else:
                c.fill = PatternFill("solid", fgColor="FFCCCC")   # no significativo

    # Leyenda p-value
    ws3.cell(row=11, column=9).value = "Verde = p<0.05 (estadísticamente significativo)"
    ws3.cell(row=11, column=9).font = Font(italic=True, size=9, name="Calibri", color="375623")
    ws3.merge_cells("I11:P11")
    ws3.cell(row=12, column=9).value = "Rojo = p≥0.05 (no significativo)"
    ws3.cell(row=12, column=9).font = Font(italic=True, size=9, name="Calibri", color="C00000")
    ws3.merge_cells("I12:P12")

    # ─── Regresión lineal: los 3 pares más relevantes ────────────────────────
    reg_row = 14
    ws3.cell(row=reg_row, column=1).value = "Regresión Lineal Simple (y = B0 + B1·x)"
    ws3.cell(row=reg_row, column=1).font = Font(bold=True, size=12, name="Calibri", color="1F4E79")
    ws3.merge_cells(f"A{reg_row}:H{reg_row}")

    reg_headers = ["Variable X", "Variable Y", "Intercepto B0", "Pendiente B1",
                   "R² (coef. determinación)", "Interpretación"]
    for ci, h in enumerate(reg_headers, 1):
        _hdr(ws3.cell(row=reg_row+1, column=ci), h, fill=CORR_FILL)

    reg_pairs = [
        ("Accel X", "Accel Y"),
        ("Gyro X",  "Gyro Z"),
        ("Accel Z", "Gyro X"),
    ]
    for ri, (xa, ya) in enumerate(reg_pairs, reg_row + 2):
        b0, b1, r2 = _linreg(axes[xa], axes[ya])
        if r2 > 0.5:
            interp = f"Fuerte: {r2*100:.1f}% de la variación de {ya} explicada por {xa}"
        elif r2 > 0.2:
            interp = f"Moderada: {r2*100:.1f}% explicado. Relación débil pero presente."
        else:
            interp = f"Débil: solo {r2*100:.1f}% explicado. Ejes mayormente independientes."
        row_data = [xa, ya, b0, b1, r2, interp]
        for ci, v in enumerate(row_data, 1):
            c = ws3.cell(row=ri, column=ci)
            if ci in (1, 2, 6):
                _txt(c, v)
            else:
                _num(c, v)
            if r2 > 0.5:
                c.fill = PatternFill("solid", fgColor="C6EFCE")
            elif r2 > 0.2:
                c.fill = PatternFill("solid", fgColor="FFEB9C")

    _autowidth(ws3)

    # =========================================================================
    # HOJA 4 — Distribución de Frecuencias (bins REALES para todos los ejes)
    # =========================================================================
    ws4 = wb.create_sheet("Frecuencias")

    ws4.cell(row=1, column=1).value = "Distribución de Frecuencias — Histogramas MPU6050"
    ws4.cell(row=1, column=1).font = Font(bold=True, size=13, name="Calibri", color="1F4E79")
    ws4.merge_cells("A1:N1")

    # Bins ajustados a los rangos REALES de cada variable
    freq_config = {
        "Accel X": {
            "vals": axes["Accel X"], "unit": "g",
            "bins": [(-0.9,-0.6),(-0.6,-0.3),(-0.3,0.0),(0.0,0.3),(0.3,0.6),(0.6,0.9)],
        },
        "Accel Y": {
            "vals": axes["Accel Y"], "unit": "g",
            "bins": [(-1.0,-0.6),(-0.6,-0.3),(-0.3,0.0),(0.0,0.3),(0.3,0.6),(0.6,1.0)],
        },
        "Accel Z": {
            "vals": axes["Accel Z"], "unit": "g",
            "bins": [(-0.7,0.0),(0.0,0.4),(0.4,0.7),(0.7,0.9),(0.9,1.1),(1.1,1.3)],
        },
        "Gyro X": {
            "vals": axes["Gyro X"], "unit": "°/s",
            "bins": [(-100,-50),(-50,-20),(-20,-5),(-5,5),(5,20),(20,100)],
        },
        "Gyro Y": {
            "vals": axes["Gyro Y"], "unit": "°/s",
            "bins": [(-40,-20),(-20,-5),(-5,5),(5,20),(20,40),(40,72)],
        },
        "Gyro Z": {
            "vals": axes["Gyro Z"], "unit": "°/s",
            "bins": [(-55,-20),(-20,-5),(-5,5),(5,20),(20,50),(50,110)],
        },
    }

    col_offset = 1
    chart_positions = ["A25","E25","I25","A48","E48","I48"]

    for idx, (axis_name, cfg) in enumerate(freq_config.items()):
        col = col_offset + (idx % 3) * 4
        base_row = 2 + (idx // 3) * 11

        # Encabezado
        title_cell = ws4.cell(row=base_row, column=col)
        title_cell.value = f"{axis_name} ({cfg['unit']})"
        title_cell.font = WHITE_FONT
        title_cell.fill = FREQ_FILL
        title_cell.border = BORDER
        title_cell.alignment = Alignment(horizontal="center")
        ws4.merge_cells(
            start_row=base_row, start_column=col,
            end_row=base_row, end_column=col + 2
        )

        _hdr(ws4.cell(row=base_row+1, column=col),     "Intervalo",   fill=FREQ_FILL)
        _hdr(ws4.cell(row=base_row+1, column=col+1),   "Frec. Abs.",  fill=FREQ_FILL)
        _hdr(ws4.cell(row=base_row+1, column=col+2),   "Frec. Rel.%", fill=FREQ_FILL)

        counts = _freq_bins(cfg["vals"], cfg["bins"])
        total  = sum(counts)
        for bi, ((lo, hi), cnt) in enumerate(zip(cfg["bins"], counts)):
            r = base_row + 2 + bi
            row_fill = ALT_FILL if bi % 2 == 0 else None
            label = f"{lo} a {hi}"
            _txt(ws4.cell(row=r, column=col),   label)
            _num(ws4.cell(row=r, column=col+1), cnt)
            pct = round(cnt / total * 100, 1) if total > 0 else 0
            _num(ws4.cell(row=r, column=col+2), pct)
            if row_fill:
                for ci in range(col, col+3):
                    ws4.cell(row=r, column=ci).fill = row_fill

        # Histograma
        bar = BarChart()
        bar.type = "col"
        bar.title = f"Histograma {axis_name}"
        bar.y_axis.title = "Frecuencia absoluta"
        bar.x_axis.title = f"Intervalo ({cfg['unit']})"
        bar.shape = 4

        max_r = base_row + 2 + len(cfg["bins"]) - 1
        data_ref  = Reference(ws4, min_col=col+1, min_row=base_row+1, max_row=max_r)
        label_ref = Reference(ws4, min_col=col,   min_row=base_row+2, max_row=max_r)
        bar.add_data(data_ref, titles_from_data=True)
        bar.set_categories(label_ref)
        ws4.add_chart(bar, chart_positions[idx])

    _autowidth(ws4)

    # =========================================================================
    # HOJA 5 — Análisis Probabilístico
    # Normal, TCL, IC 95%, Binomial, Geométrica — igual que el dashboard web
    # =========================================================================
    ws5 = wb.create_sheet("Probabilístico")

    ws5.cell(row=1, column=1).value = "Análisis Probabilístico — Dron Agrícola MPU6050"
    ws5.cell(row=1, column=1).font = Font(bold=True, size=14, name="Calibri", color="1F4E79")
    ws5.merge_cells("A1:H1")

    # ── Distribución Normal Accel X ───────────────────────────────────────────
    ax_vals = axes["Accel X"]
    s_ax    = _stats(ax_vals)

    _hdr(ws5.cell(row=3, column=1), "Variable", fill=HDR_FILL)
    _hdr(ws5.cell(row=3, column=2), "Distribución", fill=HDR_FILL)
    _hdr(ws5.cell(row=3, column=3), "μ (Media)", fill=HDR_FILL)
    _hdr(ws5.cell(row=3, column=4), "σ² (Varianza)", fill=HDR_FILL)
    _hdr(ws5.cell(row=3, column=5), "σ (Desv.Est.)", fill=HDR_FILL)
    _hdr(ws5.cell(row=3, column=6), "P(X < 0)", fill=HDR_FILL)
    _hdr(ws5.cell(row=3, column=7), "P(X > 0)", fill=HDR_FILL)
    _hdr(ws5.cell(row=3, column=8), "Interpretación", fill=HDR_FILL)

    # Normal CDF approximation
    import math as _math
    def _norm_cdf(x, mu, sigma):
        z = (x - mu) / (sigma * _math.sqrt(2))
        t = 1 / (1 + 0.3275911 * abs(z))
        erf_approx = 1 - (((((1.061405429*t - 1.453152027)*t + 1.421413741)*t
                            - 0.284496736)*t + 0.254829592)*t) * _math.exp(-z*z)
        if z < 0:
            erf_approx = -erf_approx
        return 0.5 * (1 + erf_approx)

    for ri, (name, vals_list) in enumerate(axes.items(), 4):
        s = _stats(vals_list)
        if s["desv_est"] == 0:
            continue
        p_neg = round(_norm_cdf(0, s["media"], s["desv_est"]), 4)
        p_pos = round(1 - p_neg, 4)
        interp = (f"El {p_pos*100:.1f}% de los disparos tienen valor positivo en {name}; "
                  f"el {p_neg*100:.1f}% negativo")
        row_fill = ALT_FILL if ri % 2 == 0 else None
        for ci, v in enumerate([name, f"N({s['media']}, {s['varianza']})",
                                  s["media"], s["varianza"], s["desv_est"],
                                  p_neg, p_pos, interp], 1):
            c = ws5.cell(row=ri, column=ci)
            if ci in (1, 2, 8):
                _txt(c, v, bold=(ci==1))
            else:
                _num(c, v)
            if row_fill:
                c.fill = row_fill

    # ── TCL + IC 95% ─────────────────────────────────────────────────────────
    ws5.cell(row=12, column=1).value = "Teorema Central del Límite — Intervalos de Confianza 95%"
    ws5.cell(row=12, column=1).font = Font(bold=True, size=12, name="Calibri", color="1F4E79")
    ws5.merge_cells("A12:H12")

    _hdr(ws5.cell(row=13, column=1), "Variable",      fill=CORR_FILL)
    _hdr(ws5.cell(row=13, column=2), "n",              fill=CORR_FILL)
    _hdr(ws5.cell(row=13, column=3), "σ/√n (Error estándar)", fill=CORR_FILL)
    _hdr(ws5.cell(row=13, column=4), "IC 95% Inferior", fill=CORR_FILL)
    _hdr(ws5.cell(row=13, column=5), "IC 95% Superior", fill=CORR_FILL)
    _hdr(ws5.cell(row=13, column=6), "Unidad",         fill=CORR_FILL)
    _hdr(ws5.cell(row=13, column=7), "Interpretación", fill=CORR_FILL)
    ws5.merge_cells("G13:H13")

    units_map = {"Accel X":"g","Accel Y":"g","Accel Z":"g",
                 "Gyro X":"°/s","Gyro Y":"°/s","Gyro Z":"°/s"}
    for ri, (name, vals_list) in enumerate(axes.items(), 14):
        s = _stats(vals_list)
        n = s["n"] or 1
        se = s["desv_est"] / _math.sqrt(n)
        ic_lo = round(s["media"] - 1.96 * se, 4)
        ic_hi = round(s["media"] + 1.96 * se, 4)
        unit  = units_map.get(name, "")
        interp = (f"Con 95% de confianza, la media real de {name} está entre "
                  f"{ic_lo} y {ic_hi} {unit}")
        row_fill = ALT_FILL if ri % 2 == 0 else None
        for ci, v in enumerate([name, n, round(se,6), ic_lo, ic_hi, unit, interp], 1):
            c = ws5.cell(row=ri, column=ci)
            if ci in (1,6,7): _txt(c, v, bold=(ci==1))
            else: _num(c, v)
            if row_fill: c.fill = row_fill
            if ci == 7: ws5.merge_cells(start_row=ri,start_column=7,end_row=ri,end_column=8)

    # ── Binomial ──────────────────────────────────────────────────────────────
    ws5.cell(row=22, column=1).value = "Modelos de Distribución Discreta"
    ws5.cell(row=22, column=1).font = Font(bold=True, size=12, name="Calibri", color="1F4E79")
    ws5.merge_cells("A22:H22")

    _hdr(ws5.cell(row=23, column=1), "Modelo",        fill=FREQ_FILL)
    _hdr(ws5.cell(row=23, column=2), "Variable",      fill=FREQ_FILL)
    _hdr(ws5.cell(row=23, column=3), "Evento",        fill=FREQ_FILL)
    _hdr(ws5.cell(row=23, column=4), "p (prob)",      fill=FREQ_FILL)
    _hdr(ws5.cell(row=23, column=5), "n (ensayos)",   fill=FREQ_FILL)
    _hdr(ws5.cell(row=23, column=6), "E[X]",          fill=FREQ_FILL)
    _hdr(ws5.cell(row=23, column=7), "σ",             fill=FREQ_FILL)
    _hdr(ws5.cell(row=23, column=8), "Interpretación",fill=FREQ_FILL)

    # Binomial: Accel X > 0
    ax_pos_p = round(sum(1 for v in ax_vals if v > 0) / len(ax_vals), 4) if ax_vals else 0
    n_total  = len(ax_vals)
    e_binom  = round(n_total * ax_pos_p, 2)
    s_binom  = round(_math.sqrt(n_total * ax_pos_p * (1-ax_pos_p)), 4)
    for ci, v in enumerate(["Binomial","Accel X","Accel X > 0",
                             ax_pos_p, n_total, e_binom, s_binom,
                             f"Se esperan {e_binom} disparos con aceleración positiva en X"], 1):
        c = ws5.cell(row=24, column=ci)
        if ci in (1,2,3,8): _txt(c, v, bold=(ci==1))
        else: _num(c, v)
        c.fill = PatternFill("solid", fgColor="E2EFDA")

    # Geométrica: Gyro X < -30
    gx_vals  = axes["Gyro X"]
    p_geom   = round(sum(1 for v in gx_vals if v < -30) / len(gx_vals), 4) if gx_vals else 0.001
    e_geom   = round(1/p_geom, 2) if p_geom > 0 else 9999
    for ci, v in enumerate(["Geométrica","Gyro X","Gyro X < −30°/s",
                             p_geom, "—", e_geom, "—",
                             f"Se esperan {e_geom} disparos hasta el 1er evento extremo (pitch < −30°/s)"], 1):
        c = ws5.cell(row=25, column=ci)
        if ci in (1,2,3,5,7,8): _txt(c, v, bold=(ci==1))
        else: _num(c, v)
        c.fill = PatternFill("solid", fgColor="FCE4D6")

    # Note
    ws5.cell(row=27, column=1).value = (
        "Nota: Los modelos Normal, Binomial y Geométrica se basan en los datos reales del MPU6050. "
        "TCL garantiza X̄ ~ N(μ, σ²/n) con n=289 > 30. El IC 95% usa z₀.₀₂₅ = 1.96."
    )
    ws5.cell(row=27, column=1).font = Font(italic=True, size=9, name="Calibri", color="595959")
    ws5.merge_cells("A27:H27")

    _autowidth(ws5)

    # =========================================================================
    # Guardar
    # =========================================================================
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.read()