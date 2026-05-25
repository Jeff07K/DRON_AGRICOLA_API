"""
export.py — Genera un archivo Excel con estadísticas y gráficas correctas.

Hojas:
  1. Datos       — Datos crudos del sensor
  2. Estadística — Estadística descriptiva completa (varianza MUESTRAL n-1)
  3. Frecuencias — Histogramas con bins dinámicos ajustados a los datos reales
  4. Correlación — Matriz de correlación Pearson entre los 6 ejes
  5. Probabilístico — Modelo binomial negativa aplicado a los disparos
  6. Gráficas    — Evolución temporal por eje y por disparo
"""

import io
import math
from typing import List

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.chart import BarChart, LineChart, ScatterChart, Reference
from openpyxl.chart.series import SeriesLabel
from openpyxl.utils import get_column_letter

# ─── Paleta de colores ───────────────────────────────────────────────────────
C_DARK_BLUE   = "1F4E79"
C_MED_BLUE    = "2E75B6"
C_LIGHT_BLUE  = "BDD7EE"
C_ORANGE      = "C55A11"
C_YELLOW      = "FFC000"
C_GREEN_DARK  = "375623"
C_GREEN_MED   = "70AD47"
C_GREEN_LIGHT = "E2EFDA"
C_RED         = "C00000"
C_GRAY_LIGHT  = "F2F2F2"
C_GRAY_MED    = "D9D9D9"
C_WHITE       = "FFFFFF"

# ─── Estilos reutilizables ───────────────────────────────────────────────────
THIN = Side(border_style="thin", color="AAAAAA")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

def _fill(hex_color: str) -> PatternFill:
    return PatternFill("solid", fgColor=hex_color)

def _font(color=C_WHITE, bold=True, size=10, name="Arial") -> Font:
    return Font(color=color, bold=bold, size=size, name=name)

def _align(h="center", v="center", wrap=False) -> Alignment:
    return Alignment(horizontal=h, vertical=v, wrap_text=wrap)

def _hdr(cell, text, bg=C_DARK_BLUE, fg=C_WHITE, bold=True, size=10):
    cell.value = text
    cell.font = _font(fg, bold, size)
    cell.fill = _fill(bg)
    cell.alignment = _align(wrap=True)
    cell.border = BORDER

def _cell(cell, value, bold=False, color="000000", bg=None, align="center"):
    cell.value = value
    cell.font = _font(color, bold, size=10)
    if bg:
        cell.fill = _fill(bg)
    cell.alignment = _align(align)
    cell.border = BORDER

def _autowidth(ws, min_w=10, max_w=30):
    for col in ws.columns:
        col_letter = get_column_letter(col[0].column)
        width = max((len(str(c.value or "")) for c in col), default=min_w)
        ws.column_dimensions[col_letter].width = min(max(width + 2, min_w), max_w)

# ─── Estadísticas muestrales (n-1) ──────────────────────────────────────────
def _stat(values: list) -> dict:
    n = len(values)
    if n == 0:
        return dict(n=0, media=0, varianza=0, desv_est=0,
                    minimo=0, q1=0, mediana=0, q3=0, maximo=0,
                    iqr=0, cv=0)
    media = sum(values) / n
    # Varianza MUESTRAL (n-1) — corrección de Bessel
    varianza = sum((v - media) ** 2 for v in values) / max(n - 1, 1)
    desv_est = math.sqrt(varianza)
    sv = sorted(values)

    def percentile(data, p):
        idx = (len(data) - 1) * p / 100
        lo, hi = int(idx), min(int(idx) + 1, len(data) - 1)
        return data[lo] + (data[hi] - data[lo]) * (idx - lo)

    q1  = percentile(sv, 25)
    med = percentile(sv, 50)
    q3  = percentile(sv, 75)
    iqr = q3 - q1
    cv  = abs(desv_est / media * 100) if media != 0 else float("inf")

    return dict(
        n=n,
        media=round(media, 4),
        varianza=round(varianza, 4),
        desv_est=round(desv_est, 4),
        minimo=round(min(values), 4),
        q1=round(q1, 4),
        mediana=round(med, 4),
        q3=round(q3, 4),
        maximo=round(max(values), 4),
        iqr=round(iqr, 4),
        cv=round(cv, 2),
    )

# ─── Bins dinámicos basados en los datos reales ──────────────────────────────
def _make_bins(values: list, n_bins: int = 6):
    """Calcula intervalos dinámicos ajustados al rango real de los datos."""
    if not values:
        return []
    lo, hi = min(values), max(values)
    if lo == hi:
        lo -= 1; hi += 1
    step = (hi - lo) / n_bins
    bins = []
    for i in range(n_bins):
        b_lo = lo + i * step
        b_hi = lo + (i + 1) * step
        freq = sum(1 for v in values if b_lo <= v <= b_hi)
        bins.append((round(b_lo, 3), round(b_hi, 3), freq))
    return bins

# ─── Correlación de Pearson ──────────────────────────────────────────────────
def _pearson(x: list, y: list) -> float:
    n = len(x)
    if n < 2:
        return 0.0
    mx, my = sum(x)/n, sum(y)/n
    num = sum((x[i]-mx)*(y[i]-my) for i in range(n))
    den = math.sqrt(sum((v-mx)**2 for v in x) * sum((v-my)**2 for v in y))
    return round(num/den, 4) if den else 0.0

# ─── Binomial negativa P(X=k|r,p) ────────────────────────────────────────────
def _nb_pmf(r: int, k: int, p: float) -> float:
    if k < r or p <= 0 or p >= 1:
        return 0.0
    c = math.comb(k - 1, r - 1)
    return round(c * (p ** r) * ((1 - p) ** (k - r)), 6)


# =============================================================================
# FUNCIÓN PRINCIPAL
# =============================================================================
def generate_excel(records) -> bytes:
    wb = openpyxl.Workbook()

    # Extraer listas de valores
    ax = [r.accel_x for r in records]
    ay = [r.accel_y for r in records]
    az = [r.accel_z for r in records]
    gx = [r.gyro_x  for r in records]
    gy = [r.gyro_y  for r in records]
    gz = [r.gyro_z  for r in records]
    disparos = [r.disparo for r in records]
    n = len(records)

    variables = {
        "Accel X": (ax, "g"),
        "Accel Y": (ay, "g"),
        "Accel Z": (az, "g"),
        "Gyro X":  (gx, "°/s"),
        "Gyro Y":  (gy, "°/s"),
        "Gyro Z":  (gz, "°/s"),
    }

    # =========================================================================
    # HOJA 1 — Datos crudos
    # =========================================================================
    ws1 = wb.active
    ws1.title = "Datos"
    ws1.sheet_view.showGridLines = False
    ws1.row_dimensions[1].height = 30
    ws1.row_dimensions[2].height = 20

    ws1["A1"] = f"DATOS CRUDOS DEL SENSOR MPU6050 — n = {n} registros"
    ws1["A1"].font = _font(C_DARK_BLUE, True, 12)
    ws1["A1"].alignment = _align("left")
    ws1.merge_cells("A1:I1")

    headers = ["N°", "Timestamp", "Disparo", "Accel X (g)", "Accel Y (g)",
               "Accel Z (g)", "Gyro X (°/s)", "Gyro Y (°/s)", "Gyro Z (°/s)"]
    for c, h in enumerate(headers, 1):
        _hdr(ws1.cell(3, c), h)

    for ri, rec in enumerate(records, 4):
        bg = C_GRAY_LIGHT if (ri % 2 == 0) else C_WHITE
        row_vals = [ri - 3, str(rec.timestamp)[:19], rec.disparo,
                    rec.accel_x, rec.accel_y, rec.accel_z,
                    rec.gyro_x,  rec.gyro_y,  rec.gyro_z]
        for ci, val in enumerate(row_vals, 1):
            c = ws1.cell(ri, ci)
            fmt = "0.0000" if isinstance(val, float) else None
            _cell(c, val, bg=bg)
            if fmt:
                c.number_format = fmt

    _autowidth(ws1)

    # =========================================================================
    # HOJA 2 — Estadística descriptiva
    # =========================================================================
    ws2 = wb.create_sheet("Estadística")
    ws2.sheet_view.showGridLines = False

    ws2["A1"] = f"ESTADÍSTICA DESCRIPTIVA — n = {n} registros válidos"
    ws2["A1"].font = _font(C_DARK_BLUE, True, 12)
    ws2.merge_cells("A1:L1")
    ws2["A1"].alignment = _align("left")

    # Nota metodológica
    ws2["A2"] = ("Nota: CV = Desv.Est. / |Media| × 100  ·  IQR = Q3 − Q1  "
                 "·  ✓ CV<30% = estable  ·  △ 30–100%  ·  ▲ 100–300%  ·  ✗ >300%")
    ws2["A2"].font = Font(italic=True, size=9, color="666666", name="Arial")
    ws2.merge_cells("A2:L2")

    stat_hdrs = ["Variable", "Unidad", "N", "Media", "Varianza", "Desv. Est.",
                 "Mínimo", "Q1 (25%)", "Mediana", "Q3 (75%)", "Máximo", "IQR",
                 "CV (%)", "Estabilidad"]
    for c, h in enumerate(stat_hdrs, 1):
        _hdr(ws2.cell(3, c), h, bg=C_MED_BLUE)

    units = {"Accel X": "g", "Accel Y": "g", "Accel Z": "g",
             "Gyro X": "°/s", "Gyro Y": "°/s", "Gyro Z": "°/s"}

    for ri, (name, (vals, unit)) in enumerate(variables.items(), 4):
        s = _stat(vals)
        bg = C_GRAY_LIGHT if ri % 2 == 0 else C_WHITE

        # Estabilidad basada en CV
        cv = s["cv"]
        if cv < 30:
            stab_txt, stab_bg, stab_fg = "✓ Estable", C_GREEN_LIGHT, C_GREEN_DARK
        elif cv < 100:
            stab_txt, stab_bg, stab_fg = "△ Moderada", "FFF2CC", "7F6000"
        elif cv < 300:
            stab_txt, stab_bg, stab_fg = "▲ Alta", "FCE4D6", C_ORANGE
        else:
            stab_txt, stab_bg, stab_fg = "✗ Muy alta", "FFE6E6", C_RED

        row = [name, unit, s["n"], s["media"], s["varianza"], s["desv_est"],
               s["minimo"], s["q1"], s["mediana"], s["q3"], s["maximo"],
               s["iqr"], s["cv"], stab_txt]

        for ci, val in enumerate(row, 1):
            c = ws2.cell(ri, ci)
            _cell(c, val, bg=bg)
            if ci == 1:
                c.font = _font("000000", True, 10)
            if ci >= 4 and isinstance(val, float):
                c.number_format = "0.0000"
            if ci == 14:  # Estabilidad
                c.fill = _fill(stab_bg)
                c.font = _font(stab_fg, True, 10)

    _autowidth(ws2)

    # --- Gráfico: Media Acelerómetro (columna vertical) ----------------------
    chart_accel = BarChart()
    chart_accel.type = "col"          # ← VERTICAL (columnas), no horizontal
    chart_accel.grouping = "clustered"
    chart_accel.title = "Media Acelerómetro (g)"
    chart_accel.y_axis.title = "Valor (g)"
    chart_accel.x_axis.title = "Eje"
    chart_accel.style = 10
    chart_accel.width = 14
    chart_accel.height = 10

    # Datos: filas 4,5,6 (Accel X,Y,Z) columna 4 (Media)
    data_ref = Reference(ws2, min_col=4, max_col=4, min_row=3, max_row=6)
    cats_ref = Reference(ws2, min_col=1, max_col=1, min_row=4, max_row=6)
    chart_accel.add_data(data_ref, titles_from_data=True)
    chart_accel.set_categories(cats_ref)
    ws2.add_chart(chart_accel, "P3")

    # --- Gráfico: Media Giroscopio (columna vertical) ------------------------
    chart_gyro = BarChart()
    chart_gyro.type = "col"
    chart_gyro.grouping = "clustered"
    chart_gyro.title = "Media Giroscopio (°/s)"
    chart_gyro.y_axis.title = "Valor (°/s)"
    chart_gyro.x_axis.title = "Eje"
    chart_gyro.style = 10
    chart_gyro.width = 14
    chart_gyro.height = 10

    data_ref2 = Reference(ws2, min_col=4, max_col=4, min_row=3, max_row=9)
    # Solo filas 7,8,9 (Gyro X,Y,Z)
    data_ref2 = Reference(ws2, min_col=4, max_col=4, min_row=6, max_row=9)
    cats_ref2 = Reference(ws2, min_col=1, max_col=1, min_row=7, max_row=9)
    chart_gyro.add_data(data_ref2, titles_from_data=False)
    chart_gyro.set_categories(cats_ref2)
    ws2.add_chart(chart_gyro, "P20")

    # =========================================================================
    # HOJA 3 — Frecuencias con bins DINÁMICOS
    # =========================================================================
    ws3 = wb.create_sheet("Frecuencias")
    ws3.sheet_view.showGridLines = False

    ws3["A1"] = "DISTRIBUCIÓN DE FRECUENCIAS — bins ajustados al rango real"
    ws3["A1"].font = _font(C_WHITE, True, 12)
    ws3["A1"].fill = _fill(C_GREEN_DARK)
    ws3.merge_cells("A1:R1")
    ws3["A1"].alignment = _align("left")

    # Posiciones de columna para cada variable (3 accel + 3 gyro)
    var_list = [
        ("Accel X (g)", ax),
        ("Accel Y (g)", ay),
        ("Accel Z (g)", az),
        ("Gyro X (°/s)", gx),
        ("Gyro Y (°/s)", gy),
        ("Gyro Z (°/s)", gz),
    ]

    col_starts = [1, 4, 7, 10, 13, 16]  # columnas A, D, G, J, M, P
    chart_positions = ["A14", "D14", "G14", "J14", "M14", "P14"]
    freq_row_start = 3

    for idx, ((vname, vvals), col_s, chart_pos) in enumerate(
            zip(var_list, col_starts, chart_positions)):

        # Título de variable
        title_cell = ws3.cell(2, col_s)
        title_cell.value = vname
        _hdr(title_cell, vname, bg=C_MED_BLUE if idx < 3 else C_ORANGE)
        ws3.merge_cells(
            start_row=2, start_column=col_s,
            end_row=2, end_column=col_s + 2
        )

        # Cabeceras
        _hdr(ws3.cell(freq_row_start, col_s),     "Intervalo", bg=C_DARK_BLUE)
        _hdr(ws3.cell(freq_row_start, col_s + 1), "Frec. Abs.", bg=C_DARK_BLUE)
        _hdr(ws3.cell(freq_row_start, col_s + 2), "Frec. Rel.%", bg=C_DARK_BLUE)

        # Bins dinámicos
        bins = _make_bins(vvals, n_bins=6)
        total_freq = sum(b[2] for b in bins)

        for bi, (b_lo, b_hi, freq) in enumerate(bins):
            row = freq_row_start + 1 + bi
            bg = C_GRAY_LIGHT if bi % 2 == 0 else C_WHITE
            rel = round(freq / total_freq * 100, 1) if total_freq else 0

            label_cell = ws3.cell(row, col_s)
            label_cell.value = f"{b_lo} a {b_hi}"
            label_cell.font = _font("000000", False, 10)
            label_cell.border = BORDER
            label_cell.fill = _fill(bg)
            label_cell.alignment = _align("center")

            freq_cell = ws3.cell(row, col_s + 1)
            freq_cell.value = freq
            freq_cell.font = _font(C_MED_BLUE if freq > 0 else "AAAAAA", freq > 0, 10)
            freq_cell.border = BORDER
            freq_cell.fill = _fill(bg)
            freq_cell.alignment = _align("center")

            rel_cell = ws3.cell(row, col_s + 2)
            rel_cell.value = rel
            rel_cell.number_format = '0.0"%"'
            rel_cell.font = _font("000000", False, 10)
            rel_cell.border = BORDER
            rel_cell.fill = _fill(bg)
            rel_cell.alignment = _align("center")

        # --- Histograma de COLUMNAS (vertical) para esta variable -----------
        hist = BarChart()
        hist.type = "col"          # ← COLUMNA VERTICAL, no bar horizontal
        hist.grouping = "clustered"
        hist.title = f"Histograma {vname}"
        hist.y_axis.title = "Frecuencia"
        hist.x_axis.title = "Intervalo"
        hist.style = 10
        hist.width = 12
        hist.height = 10

        data_r = Reference(ws3,
                           min_col=col_s + 1, max_col=col_s + 1,
                           min_row=freq_row_start,
                           max_row=freq_row_start + len(bins))
        cats_r = Reference(ws3,
                           min_col=col_s, max_col=col_s,
                           min_row=freq_row_start + 1,
                           max_row=freq_row_start + len(bins))
        hist.add_data(data_r, titles_from_data=True)
        hist.set_categories(cats_r)
        ws3.add_chart(hist, chart_pos)

    _autowidth(ws3, min_w=8, max_w=18)

    # =========================================================================
    # HOJA 4 — Correlación
    # =========================================================================
    ws4 = wb.create_sheet("Correlación")
    ws4.sheet_view.showGridLines = False

    ws4["A1"] = "MATRIZ DE CORRELACIÓN PEARSON — 6 ejes del MPU6050"
    ws4["A1"].font = _font(C_DARK_BLUE, True, 12)
    ws4.merge_cells("A1:H1")
    ws4["A1"].alignment = _align("left")

    var_names = list(variables.keys())
    var_vals  = [v for v, _ in variables.values()]

    # Cabeceras
    for ci, name in enumerate(var_names, 2):
        _hdr(ws4.cell(2, ci), name, bg=C_DARK_BLUE)
    for ri, name in enumerate(var_names, 3):
        _hdr(ws4.cell(ri, 1), name, bg=C_DARK_BLUE)

    # Valores de correlación con semáforo de color
    for ri, vi in enumerate(var_vals):
        for ci, vj in enumerate(var_vals):
            r = _pearson(vi, vj)
            cell = ws4.cell(ri + 3, ci + 2)
            cell.value = r
            cell.number_format = "0.0000"
            cell.border = BORDER
            cell.alignment = _align("center")
            cell.font = _font("000000", abs(r) >= 0.7, 10)
            # Color: verde fuerte = correlación alta, blanco = baja
            abs_r = abs(r)
            if ri == ci:  # diagonal
                cell.fill = _fill(C_DARK_BLUE)
                cell.font = _font(C_WHITE, True, 10)
            elif abs_r >= 0.8:
                cell.fill = _fill(C_GREEN_LIGHT)
            elif abs_r >= 0.5:
                cell.fill = _fill("FFF2CC")
            elif abs_r >= 0.3:
                cell.fill = _fill(C_GRAY_LIGHT)
            else:
                cell.fill = _fill(C_WHITE)

    ws4["A11"] = "Interpretación: |r| ≥ 0.8 = correlación fuerte (verde) · 0.5–0.8 = moderada (amarillo) · <0.3 = débil (blanco)"
    ws4["A11"].font = Font(italic=True, size=9, color="666666", name="Arial")
    ws4.merge_cells("A11:H11")

    _autowidth(ws4)

    # =========================================================================
    # HOJA 5 — Probabilístico (Binomial Negativa)
    # =========================================================================
    ws5 = wb.create_sheet("Probabilístico")
    ws5.sheet_view.showGridLines = False

    ws5["A1"] = "MODELO PROBABILÍSTICO — Distribución Binomial Negativa"
    ws5["A1"].font = _font(C_DARK_BLUE, True, 12)
    ws5.merge_cells("A1:J1")
    ws5["A1"].alignment = _align("left")

    # Definición del experimento
    ws5["A3"] = "Definición del experimento"
    ws5["A3"].font = _font("000000", True, 11)

    context = [
        ("Sensor", "MPU6050 — Acelerómetro + Giroscopio"),
        ("Evento de éxito (X=1)", "Gyro Z < 10 °/s  →  disparo estable"),
        ("Evento de fallo (X=0)", "Gyro Z ≥ 10 °/s  →  disparo inestable"),
        ("Estimación de p", f"Basada en {n} disparos registrados"),
    ]
    for ri, (k, v) in enumerate(context, 4):
        ws5.cell(ri, 1).value = k
        ws5.cell(ri, 1).font = _font("000000", True, 10)
        ws5.cell(ri, 1).border = BORDER
        ws5.cell(ri, 1).fill = _fill(C_GRAY_LIGHT)
        ws5.cell(ri, 1).alignment = _align("left")
        ws5.cell(ri, 2).value = v
        ws5.cell(ri, 2).font = _font("000000", False, 10)
        ws5.cell(ri, 2).border = BORDER
        ws5.cell(ri, 2).alignment = _align("left")
        ws5.merge_cells(start_row=ri, start_column=2, end_row=ri, end_column=6)

    # Calcular p real de los datos
    umbral_gz = 10.0
    exitos_reales = sum(1 for v in gz if abs(v) < umbral_gz)
    p_real = round(exitos_reales / n, 4) if n > 0 else 0.5

    # Parámetros del modelo
    r_obj = 3   # éxitos deseados
    p_mod = p_real if p_real > 0 else 0.5

    ws5["A9"] = "Parámetros del modelo BN(r, p)"
    ws5["A9"].font = _font("000000", True, 11)

    params = [
        ("r (éxitos deseados)", r_obj, "Disparos estables objetivo"),
        ("p (prob. éxito)", p_mod, f"Estimado: {exitos_reales}/{n} disparos estables"),
        ("E[X] = r/p", round(r_obj / p_mod, 4), "Disparos esperados hasta r éxitos"),
        ("Var[X] = r(1-p)/p²", round(r_obj*(1-p_mod)/p_mod**2, 4), "Varianza del número de disparos"),
        ("σ[X]", round(math.sqrt(r_obj*(1-p_mod)/p_mod**2), 4), "Desv. estándar del número de disparos"),
    ]

    _hdr(ws5.cell(10, 1), "Parámetro",  bg=C_MED_BLUE)
    _hdr(ws5.cell(10, 2), "Valor",      bg=C_MED_BLUE)
    _hdr(ws5.cell(10, 3), "Interpretación", bg=C_MED_BLUE)
    ws5.merge_cells(start_row=10, start_column=3, end_row=10, end_column=7)

    for ri, (param, val, interp) in enumerate(params, 11):
        bg = C_GRAY_LIGHT if ri % 2 == 0 else C_WHITE
        ws5.cell(ri, 1).value = param
        ws5.cell(ri, 1).font = _font("000000", True, 10)
        ws5.cell(ri, 1).border = BORDER
        ws5.cell(ri, 1).fill = _fill(bg)
        ws5.cell(ri, 2).value = val
        ws5.cell(ri, 2).font = _font(C_MED_BLUE, True, 10)
        ws5.cell(ri, 2).border = BORDER
        ws5.cell(ri, 2).fill = _fill(bg)
        ws5.cell(ri, 2).number_format = "0.0000"
        ws5.cell(ri, 3).value = interp
        ws5.cell(ri, 3).font = _font("000000", False, 10)
        ws5.cell(ri, 3).border = BORDER
        ws5.cell(ri, 3).fill = _fill(bg)
        ws5.merge_cells(start_row=ri, start_column=3, end_row=ri, end_column=7)

    # Tabla PMF — P(X=k)
    ws5["A17"] = "Distribución de probabilidad P(X=k) — Binomial Negativa"
    ws5["A17"].font = _font("000000", True, 11)

    _hdr(ws5.cell(18, 1), "k (total disparos)", bg=C_DARK_BLUE)
    _hdr(ws5.cell(18, 2), "P(X=k)",             bg=C_DARK_BLUE)
    _hdr(ws5.cell(18, 3), "P(X≤k) acumulada",   bg=C_DARK_BLUE)
    ws5.merge_cells(start_row=18, start_column=3, end_row=18, end_column=5)

    k_max = min(r_obj + int(r_obj / p_mod * 3), 30)
    acum = 0.0
    pmf_row_start = 19
    for ki, k in enumerate(range(r_obj, k_max + 1)):
        p_k = _nb_pmf(r_obj, k, p_mod)
        acum = round(acum + p_k, 6)
        bg = C_GRAY_LIGHT if ki % 2 == 0 else C_WHITE
        row = pmf_row_start + ki
        ws5.cell(row, 1).value = k
        ws5.cell(row, 1).fill = _fill(bg)
        ws5.cell(row, 1).border = BORDER
        ws5.cell(row, 1).alignment = _align("center")
        ws5.cell(row, 2).value = p_k
        ws5.cell(row, 2).fill = _fill(bg)
        ws5.cell(row, 2).border = BORDER
        ws5.cell(row, 2).number_format = "0.000000"
        ws5.cell(row, 2).alignment = _align("center")
        ws5.cell(row, 3).value = acum
        ws5.cell(row, 3).fill = _fill(bg)
        ws5.cell(row, 3).border = BORDER
        ws5.cell(row, 3).number_format = "0.0000"
        ws5.cell(row, 3).alignment = _align("center")
        ws5.merge_cells(start_row=row, start_column=3, end_row=row, end_column=5)

    # Gráfico PMF
    pmf_end_row = pmf_row_start + (k_max - r_obj)
    chart_nb = BarChart()
    chart_nb.type = "col"
    chart_nb.title = f"BN(r={r_obj}, p={p_mod}) — P(X=k)"
    chart_nb.y_axis.title = "Probabilidad"
    chart_nb.x_axis.title = "k (total disparos)"
    chart_nb.style = 10
    chart_nb.width = 16
    chart_nb.height = 12

    data_nb = Reference(ws5, min_col=2, max_col=2,
                        min_row=18, max_row=pmf_end_row)
    cats_nb = Reference(ws5, min_col=1, max_col=1,
                        min_row=pmf_row_start, max_row=pmf_end_row)
    chart_nb.add_data(data_nb, titles_from_data=True)
    chart_nb.set_categories(cats_nb)
    ws5.add_chart(chart_nb, "H3")

    _autowidth(ws5)

    # =========================================================================
    # HOJA 6 — Gráficas de evolución por disparo
    # =========================================================================
    ws6 = wb.create_sheet("Gráficas")
    ws6.sheet_view.showGridLines = False

    ws6["A1"] = "EVOLUCIÓN POR DISPARO — Medias de cada eje"
    ws6["A1"].font = _font(C_DARK_BLUE, True, 12)
    ws6.merge_cells("A1:H1")
    ws6["A1"].alignment = _align("left")

    # Tabla de datos para gráficas
    evo_hdrs = ["Disparo", "Accel X (g)", "Accel Y (g)", "Accel Z (g)",
                "Gyro X (°/s)", "Gyro Y (°/s)", "Gyro Z (°/s)"]
    for ci, h in enumerate(evo_hdrs, 1):
        _hdr(ws6.cell(2, ci), h, bg=C_DARK_BLUE)

    for ri, rec in enumerate(records, 3):
        bg = C_GRAY_LIGHT if (ri % 2 == 0) else C_WHITE
        row_data = [rec.disparo, rec.accel_x, rec.accel_y, rec.accel_z,
                    rec.gyro_x, rec.gyro_y, rec.gyro_z]
        for ci, val in enumerate(row_data, 1):
            c = ws6.cell(ri, ci)
            _cell(c, val, bg=bg)
            if isinstance(val, float):
                c.number_format = "0.0000"

    last_data_row = 2 + n

    # --- Gráfico Acelerómetro (líneas) ----------------------------------------
    lc_a = LineChart()
    lc_a.title = "Acelerómetro por Disparo (g)"
    lc_a.y_axis.title = "Valor (g)"
    lc_a.x_axis.title = "Número de disparo"
    lc_a.style = 10
    lc_a.width = 20
    lc_a.height = 12

    for col, color in [(2, "4472C4"), (3, "ED7D31"), (4, "70AD47")]:
        ref = Reference(ws6, min_col=col, max_col=col,
                        min_row=2, max_row=last_data_row)
        lc_a.add_data(ref, titles_from_data=True)

    cats_ref = Reference(ws6, min_col=1, max_col=1,
                         min_row=3, max_row=last_data_row)
    lc_a.set_categories(cats_ref)
    ws6.add_chart(lc_a, "I2")

    # --- Gráfico Giroscopio (líneas) ------------------------------------------
    lc_g = LineChart()
    lc_g.title = "Giroscopio por Disparo (°/s)"
    lc_g.y_axis.title = "Valor (°/s)"
    lc_g.x_axis.title = "Número de disparo"
    lc_g.style = 10
    lc_g.width = 20
    lc_g.height = 12

    for col, color in [(5, "FF0000"), (6, "FFC000"), (7, "00B050")]:
        ref = Reference(ws6, min_col=col, max_col=col,
                        min_row=2, max_row=last_data_row)
        lc_g.add_data(ref, titles_from_data=True)

    lc_g.set_categories(cats_ref)
    ws6.add_chart(lc_g, "I22")

    _autowidth(ws6)

    # =========================================================================
    # Guardar
    # =========================================================================
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()