"""
export.py — Genera un archivo Excel con:
  • Hoja 1: Datos crudos del sensor
  • Hoja 2: Estadística descriptiva (media, varianza, desv. est., min, max)
  • Hoja 3: Distribución de frecuencias para Accel X y Gyro X
"""
import io
from typing import List

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.chart import BarChart, ScatterChart, Reference
from openpyxl.chart.series import DataPoint
from openpyxl.utils import get_column_letter

from models import SensorData


# ─── Colores (igual que el documento PDF) ────────────────────────────────────
HEADER_FILL   = PatternFill("solid", fgColor="1F4E79")   # Azul oscuro
STAT_FILL     = PatternFill("solid", fgColor="FFC000")   # Amarillo/naranja
FREQ_FILL     = PatternFill("solid", fgColor="2E75B6")   # Azul
WHITE_FONT    = Font(color="FFFFFF", bold=True)
BLACK_BOLD    = Font(bold=True)
THIN          = Side(border_style="thin", color="AAAAAA")
BORDER        = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def _stat(values: list) -> dict:
    """Calcula estadísticas básicas de una lista de valores."""
    n = len(values)
    if n == 0:
        return {"media": 0, "varianza": 0, "desv_est": 0, "min": 0, "max": 0}
    media = sum(values) / n
    varianza = sum((v - media) ** 2 for v in values) / n
    import math
    desv_est = math.sqrt(varianza)
    return {
        "media": round(media, 4),
        "varianza": round(varianza, 4),
        "desv_est": round(desv_est, 4),
        "min": round(min(values), 4),
        "max": round(max(values), 4),
    }


def _apply_header(cell, text: str):
    cell.value = text
    cell.font = WHITE_FONT
    cell.fill = HEADER_FILL
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell.border = BORDER


def _apply_stat_header(cell, text: str):
    cell.value = text
    cell.font = BLACK_BOLD
    cell.fill = STAT_FILL
    cell.alignment = Alignment(horizontal="center")
    cell.border = BORDER


def generate_excel(records: List[SensorData]) -> bytes:
    """
    Genera el archivo Excel completo y lo retorna como bytes
    para enviarlo como descarga desde FastAPI.
    """
    wb = openpyxl.Workbook()

    # =========================================================================
    # HOJA 1 — Datos crudos
    # =========================================================================
    ws1 = wb.active
    ws1.title = "Datos Sensor"

    headers = ["N°", "Timestamp", "Disparo", "Accel X", "Accel Y", "Accel Z",
               "Gyro X", "Gyro Y", "Gyro Z"]
    for col, h in enumerate(headers, 1):
        _apply_header(ws1.cell(row=1, column=col), h)

    for row_idx, rec in enumerate(records, 2):
        ws1.cell(row=row_idx, column=1).value  = row_idx - 1
        ws1.cell(row=row_idx, column=2).value  = str(rec.timestamp)[:19]
        ws1.cell(row=row_idx, column=3).value  = rec.disparo
        ws1.cell(row=row_idx, column=4).value  = rec.accel_x
        ws1.cell(row=row_idx, column=5).value  = rec.accel_y
        ws1.cell(row=row_idx, column=6).value  = rec.accel_z
        ws1.cell(row=row_idx, column=7).value  = rec.gyro_x
        ws1.cell(row=row_idx, column=8).value  = rec.gyro_y
        ws1.cell(row=row_idx, column=9).value  = rec.gyro_z
        for col in range(1, 10):
            ws1.cell(row=row_idx, column=col).border = BORDER
            ws1.cell(row=row_idx, column=col).alignment = Alignment(horizontal="center")

    # Autoajustar columnas
    for col in ws1.columns:
        max_len = max((len(str(c.value or "")) for c in col), default=8)
        ws1.column_dimensions[get_column_letter(col[0].column)].width = max_len + 4

    # =========================================================================
    # HOJA 2 — Estadística descriptiva
    # =========================================================================
    ws2 = wb.create_sheet("Estadística")

    variables = {
        "Accel X": [r.accel_x for r in records],
        "Accel Y": [r.accel_y for r in records],
        "Accel Z": [r.accel_z for r in records],
        "Gyro X":  [r.gyro_x  for r in records],
        "Gyro Y":  [r.gyro_y  for r in records],
        "Gyro Z":  [r.gyro_z  for r in records],
    }

    stat_headers = ["Variable", "Media", "Varianza", "Desv. Est.", "Mínimo", "Máximo"]
    for col, h in enumerate(stat_headers, 1):
        _apply_stat_header(ws2.cell(row=1, column=col), h)

    for row_idx, (name, vals) in enumerate(variables.items(), 2):
        s = _stat(vals)
        ws2.cell(row=row_idx, column=1).value = name
        ws2.cell(row=row_idx, column=2).value = s["media"]
        ws2.cell(row=row_idx, column=3).value = s["varianza"]
        ws2.cell(row=row_idx, column=4).value = s["desv_est"]
        ws2.cell(row=row_idx, column=5).value = s["min"]
        ws2.cell(row=row_idx, column=6).value = s["max"]
        for col in range(1, 7):
            ws2.cell(row=row_idx, column=col).border = BORDER
            ws2.cell(row=row_idx, column=col).alignment = Alignment(horizontal="center")
        ws2.cell(row=row_idx, column=1).font = BLACK_BOLD

    for col in ws2.columns:
        max_len = max((len(str(c.value or "")) for c in col), default=8)
        ws2.column_dimensions[get_column_letter(col[0].column)].width = max_len + 4

    # ─── Gráfico de barras: medias de aceleraciones ──────────────────────────
    chart = BarChart()
    chart.type = "col"
    chart.title = "Medias de Aceleración por Eje"
    chart.y_axis.title = "Valor"
    chart.x_axis.title = "Variable"
    data_ref   = Reference(ws2, min_col=2, min_row=1, max_row=4)   # Media rows 2-4 (X,Y,Z)
    labels_ref = Reference(ws2, min_col=1, min_row=2, max_row=4)
    chart.add_data(data_ref, titles_from_data=True)
    chart.set_categories(labels_ref)
    chart.shape = 4
    ws2.add_chart(chart, "H2")

    # =========================================================================
    # HOJA 3 — Distribución de frecuencias
    # =========================================================================
    ws3 = wb.create_sheet("Frecuencias")

    # Distribución Accel X
    ws3["A1"] = "Distribución Accel X"
    ws3["A1"].font = BLACK_BOLD
    ws3["A1"].fill = PatternFill("solid", fgColor="BDD7EE")

    accel_x_vals = [r.accel_x for r in records]
    bins_ax = [(0.1, 0.3), (0.4, 0.6), (0.7, 1.0)]
    _apply_stat_header(ws3["A2"], "Intervalo")
    _apply_stat_header(ws3["B2"], "Frecuencia")

    for i, (lo, hi) in enumerate(bins_ax, 3):
        freq = sum(1 for v in accel_x_vals if lo <= v <= hi)
        ws3.cell(row=i, column=1).value = f"{lo}–{hi}"
        ws3.cell(row=i, column=2).value = freq
        ws3.cell(row=i, column=1).border = BORDER
        ws3.cell(row=i, column=2).border = BORDER

    # Distribución Gyro X
    ws3["D1"] = "Distribución Gyro X"
    ws3["D1"].font = BLACK_BOLD
    ws3["D1"].fill = PatternFill("solid", fgColor="BDD7EE")

    gyro_x_vals = [r.gyro_x for r in records]
    bins_gx = [(0.01, 0.04), (0.04, 0.07), (0.07, 0.10)]
    _apply_stat_header(ws3["D2"], "Intervalo")
    _apply_stat_header(ws3["E2"], "Frecuencia")

    for i, (lo, hi) in enumerate(bins_gx, 3):
        freq = sum(1 for v in gyro_x_vals if lo <= v <= hi)
        ws3.cell(row=i, column=4).value = f"{lo}–{hi}"
        ws3.cell(row=i, column=5).value = freq
        ws3.cell(row=i, column=4).border = BORDER
        ws3.cell(row=i, column=5).border = BORDER

    # ─── Histograma Accel X ───────────────────────────────────────────────────
    bar1 = BarChart()
    bar1.type = "col"
    bar1.title = "Distribución de Aceleración en Eje X"
    bar1.y_axis.title = "Frecuencia"
    bar1.x_axis.title = "Intervalo"
    d1 = Reference(ws3, min_col=2, min_row=2, max_row=5)
    l1 = Reference(ws3, min_col=1, min_row=3, max_row=5)
    bar1.add_data(d1, titles_from_data=True)
    bar1.set_categories(l1)
    ws3.add_chart(bar1, "A7")

    # ─── Histograma Gyro X ────────────────────────────────────────────────────
    bar2 = BarChart()
    bar2.type = "col"
    bar2.title = "Distribución de Velocidad Angular Eje X"
    bar2.y_axis.title = "Frecuencia"
    bar2.x_axis.title = "Intervalo"
    d2 = Reference(ws3, min_col=5, min_row=2, max_row=5)
    l2 = Reference(ws3, min_col=4, min_row=3, max_row=5)
    bar2.add_data(d2, titles_from_data=True)
    bar2.set_categories(l2)
    ws3.add_chart(bar2, "H7")

    # ─── Dispersión Accel X vs Accel Y ───────────────────────────────────────
    # (usa hoja de datos crudos)
    scatter = ScatterChart()
    scatter.title = "Relación Accel X vs Accel Y"
    scatter.y_axis.title = "Accel Y"
    scatter.x_axis.title = "Accel X"
    xvals = Reference(ws1, min_col=4, min_row=2, max_row=len(records)+1)
    yvals = Reference(ws1, min_col=5, min_row=2, max_row=len(records)+1)
    from openpyxl.chart import Series
    series = Series(yvals, xvals, title="Accel X vs Y")
    scatter.series.append(series)
    ws3.add_chart(scatter, "A25")

    # =========================================================================
    # Guardar en buffer y retornar bytes
    # =========================================================================
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.read()
