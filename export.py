"""
export.py — Genera Excel con gráficas renderizadas como imágenes PNG.
Las imágenes se insertan directamente en el archivo, garantizando
visualización correcta en Excel, OnlyOffice, LibreOffice y Google Sheets.
"""

import io
import math
import tempfile
import os
from typing import List

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.drawing.image import Image as XLImage
from openpyxl.utils import get_column_letter

# ── Colores ──────────────────────────────────────────────────────────────────
C_DARK_BLUE  = "1F4E79"
C_MED_BLUE   = "2E75B6"
C_LIGHT_BLUE = "BDD7EE"
C_ORANGE     = "C55A11"
C_GREEN_D    = "375623"
C_GREEN_L    = "E2EFDA"
C_RED        = "C00000"
C_GRAY_L     = "F2F2F2"
C_WHITE      = "FFFFFF"

THIN   = Side(border_style="thin", color="AAAAAA")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

# Paleta matplotlib consistente
MPL_COLORS = ["#2E75B6", "#ED7D31", "#70AD47", "#C00000", "#FFC000", "#7030A0"]

def _fill(h): return PatternFill("solid", fgColor=h)
def _font(color=C_WHITE, bold=True, size=10, name="Arial"):
    return Font(color=color, bold=bold, size=size, name=name)
def _align(h="center", v="center", wrap=False):
    return Alignment(horizontal=h, vertical=v, wrap_text=wrap)

def _hdr(cell, text, bg=C_DARK_BLUE, fg=C_WHITE):
    cell.value = text
    cell.font = _font(fg, True, 10)
    cell.fill = _fill(bg)
    cell.alignment = _align(wrap=True)
    cell.border = BORDER

def _cell(cell, value, bold=False, color="000000", bg=C_WHITE, align="center", fmt=None):
    cell.value = value
    cell.font = _font(color, bold, 10)
    cell.fill = _fill(bg)
    cell.alignment = _align(align)
    cell.border = BORDER
    if fmt:
        cell.number_format = fmt

def _autowidth(ws, mn=10, mx=28):
    for col in ws.columns:
        w = max((len(str(c.value or "")) for c in col), default=mn)
        ws.column_dimensions[get_column_letter(col[0].column)].width = min(max(w+2, mn), mx)

# ── Estadísticas muestrales (n-1) ────────────────────────────────────────────
def _stat(vals):
    n = len(vals)
    if n == 0:
        return {k: 0 for k in ["n","media","varianza","desv_est","minimo","q1","mediana","q3","maximo","iqr","cv"]}
    media = sum(vals) / n
    varianza = sum((v-media)**2 for v in vals) / max(n-1, 1)   # n-1 MUESTRAL
    desv = math.sqrt(varianza)
    sv = sorted(vals)
    def pct(d, p):
        i = (len(d)-1)*p/100
        lo, hi = int(i), min(int(i)+1, len(d)-1)
        return d[lo]+(d[hi]-d[lo])*(i-lo)
    q1, med, q3 = pct(sv,25), pct(sv,50), pct(sv,75)
    cv = abs(desv/media*100) if media!=0 else float("inf")
    return dict(n=n, media=round(media,4), varianza=round(varianza,4),
                desv_est=round(desv,4), minimo=round(min(vals),4),
                q1=round(q1,4), mediana=round(med,4), q3=round(q3,4),
                maximo=round(max(vals),4), iqr=round(q3-q1,4), cv=round(cv,2))

def _pearson(x, y):
    n = len(x)
    if n < 2: return 0.0
    mx, my = sum(x)/n, sum(y)/n
    num = sum((x[i]-mx)*(y[i]-my) for i in range(n))
    den = math.sqrt(sum((v-mx)**2 for v in x)*sum((v-my)**2 for v in y))
    return round(num/den, 4) if den else 0.0

def _nb_pmf(r, k, p):
    if k < r or p <= 0 or p >= 1: return 0.0
    return round(math.comb(k-1,r-1)*(p**r)*((1-p)**(k-r)), 6)

def _make_bins(vals, n_bins=6):
    if not vals: return []
    lo, hi = min(vals), max(vals)
    if lo == hi: lo -= 1; hi += 1
    step = (hi-lo)/n_bins
    return [(round(lo+i*step,3), round(lo+(i+1)*step,3),
             sum(1 for v in vals if lo+i*step <= v <= lo+(i+1)*step))
            for i in range(n_bins)]

# ── Helpers matplotlib ────────────────────────────────────────────────────────
def _fig_to_img(fig, tmpdir, name):
    """Guarda figura matplotlib como PNG y retorna ruta."""
    path = os.path.join(tmpdir, f"{name}.png")
    fig.savefig(path, dpi=130, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return path

def _insert_img(ws, img_path, anchor, width_px=480, height_px=300):
    """Inserta imagen PNG en la hoja de cálculo."""
    img = XLImage(img_path)
    img.width  = width_px
    img.height = height_px
    ws.add_image(img, anchor)

def _style_ax(ax, title, xlabel="", ylabel=""):
    ax.set_title(title, fontsize=11, fontweight="bold", pad=8, color="#1F4E79")
    ax.set_xlabel(xlabel, fontsize=9, color="#555555")
    ax.set_ylabel(ylabel, fontsize=9, color="#555555")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.tick_params(labelsize=8)
    ax.grid(axis="y", alpha=0.3, linestyle="--")

# =============================================================================
# GRÁFICAS como imágenes
# =============================================================================

def _chart_stat_means(ax_vals, var_names, tmpdir):
    """Barras verticales: medias de los 6 ejes."""
    medias_acc = [_stat(v)["media"] for v in ax_vals[:3]]
    medias_gyr = [_stat(v)["media"] for v in ax_vals[3:]]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4))
    fig.patch.set_facecolor("white")

    # Acelerómetro
    bars = ax1.bar(["Accel X","Accel Y","Accel Z"], medias_acc,
                   color=MPL_COLORS[:3], edgecolor="white", linewidth=0.5)
    for b in bars:
        ax1.text(b.get_x()+b.get_width()/2, b.get_height()+0.001,
                 f"{b.get_height():.4f}", ha="center", va="bottom", fontsize=8)
    _style_ax(ax1, "Media Acelerómetro (g)", "Eje", "Valor (g)")
    ax1.axhline(0, color="gray", linewidth=0.5)

    # Giroscopio
    bars2 = ax2.bar(["Gyro X","Gyro Y","Gyro Z"], medias_gyr,
                    color=MPL_COLORS[3:], edgecolor="white", linewidth=0.5)
    for b in bars2:
        ypos = b.get_height() + (0.2 if b.get_height() >= 0 else -0.8)
        ax2.text(b.get_x()+b.get_width()/2, ypos,
                 f"{b.get_height():.4f}", ha="center", va="bottom", fontsize=8)
    _style_ax(ax2, "Media Giroscopio (°/s)", "Eje", "Valor (°/s)")
    ax2.axhline(0, color="gray", linewidth=0.5)

    plt.tight_layout()
    return _fig_to_img(fig, tmpdir, "stat_means")


def _chart_histograms(ax_vals, var_names, units, tmpdir):
    """6 histogramas de columnas verticales."""
    fig, axes = plt.subplots(2, 3, figsize=(14, 8))
    fig.patch.set_facecolor("white")
    fig.suptitle("Distribución de Frecuencias — Histogramas por Eje",
                 fontsize=12, fontweight="bold", color="#1F4E79", y=1.01)
    axes = axes.flatten()

    for i, (vals, name, unit) in enumerate(zip(ax_vals, var_names, units)):
        ax = axes[i]
        bins = _make_bins(vals, n_bins=6)
        labels = [f"{b[0]}\na {b[1]}" for b in bins]
        freqs  = [b[2] for b in bins]
        color  = MPL_COLORS[i]

        bars = ax.bar(range(len(bins)), freqs, color=color,
                      edgecolor="white", linewidth=0.5, alpha=0.85)
        ax.set_xticks(range(len(bins)))
        ax.set_xticklabels(labels, fontsize=7)
        ax.set_yticks(range(0, max(freqs)+2))

        for b, f in zip(bars, freqs):
            if f > 0:
                ax.text(b.get_x()+b.get_width()/2, f+0.1,
                        str(f), ha="center", va="bottom", fontsize=8, fontweight="bold")

        _style_ax(ax, f"Histograma {name}", "Intervalo ({unit})", "Frecuencia")
        ax.set_ylim(0, max(freqs)+2 if freqs else 2)

    plt.tight_layout()
    return _fig_to_img(fig, tmpdir, "histogramas")


def _chart_correlation(corr_matrix, var_names, tmpdir):
    """Heatmap de correlación."""
    n = len(var_names)
    fig, ax = plt.subplots(figsize=(7, 6))
    fig.patch.set_facecolor("white")

    data = np.array(corr_matrix)
    # Colormap: rojo=negativo, verde=positivo
    im = ax.imshow(data, cmap="RdYlGn", vmin=-1, vmax=1, aspect="auto")
    plt.colorbar(im, ax=ax, shrink=0.8)

    ax.set_xticks(range(n)); ax.set_yticks(range(n))
    ax.set_xticklabels(var_names, fontsize=9, rotation=30, ha="right")
    ax.set_yticklabels(var_names, fontsize=9)

    for i in range(n):
        for j in range(n):
            val = data[i,j]
            color = "white" if abs(val) > 0.6 else "black"
            ax.text(j, i, f"{val:.2f}", ha="center", va="center",
                    fontsize=9, color=color, fontweight="bold" if i==j else "normal")

    ax.set_title("Matriz de Correlación Pearson — MPU6050",
                 fontsize=11, fontweight="bold", color="#1F4E79", pad=10)
    plt.tight_layout()
    return _fig_to_img(fig, tmpdir, "correlacion")


def _chart_nb(r, p, pmf_data, tmpdir):
    """Gráfico de barras VERTICALES de la Binomial Negativa."""
    ks = [d[0] for d in pmf_data]
    probs = [d[1] for d in pmf_data]

    fig, ax = plt.subplots(figsize=(10, 5))
    fig.patch.set_facecolor("white")

    bars = ax.bar(ks, probs, color="#7030A0", edgecolor="white",
                  linewidth=0.5, alpha=0.85)
    for b, prob in zip(bars, probs):
        if prob > 0.005:
            ax.text(b.get_x()+b.get_width()/2, b.get_height()+0.002,
                    f"{prob:.4f}", ha="center", va="bottom", fontsize=7.5)

    _style_ax(ax, f"BN(r={r}, p={p:.4f}) — P(X=k)",
              "k (total de disparos)", "Probabilidad P(X=k)")
    ax.set_xticks(ks)
    ax.set_xlim(min(ks)-0.5, max(ks)+0.5)

    # Línea del valor esperado
    ex = r/p
    ax.axvline(ex, color="#C00000", linestyle="--", linewidth=1.5,
               label=f"E[X] = {ex:.2f}")
    ax.legend(fontsize=9)
    plt.tight_layout()
    return _fig_to_img(fig, tmpdir, "binomial_negativa")


def _chart_evolution(records, tmpdir):
    """Líneas de evolución por disparo — acelerómetro y giroscopio."""
    disp = list(range(1, len(records)+1))
    ax_data = [(r.accel_x, r.accel_y, r.accel_z,
                r.gyro_x,  r.gyro_y,  r.gyro_z) for r in records]

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 9))
    fig.patch.set_facecolor("white")

    # Acelerómetro
    for ci, (label, color) in enumerate(zip(
            ["Accel X","Accel Y","Accel Z"], MPL_COLORS[:3])):
        vals = [row[ci] for row in ax_data]
        ax1.plot(disp, vals, marker="o", markersize=4, linewidth=1.8,
                 color=color, label=label)
    _style_ax(ax1, "Acelerómetro por Disparo (g)", "Número de disparo", "Valor (g)")
    ax1.set_xticks(disp)
    ax1.axhline(0, color="gray", linewidth=0.5)
    ax1.legend(fontsize=9, loc="upper right")

    # Giroscopio
    for ci, (label, color) in enumerate(zip(
            ["Gyro X","Gyro Y","Gyro Z"], MPL_COLORS[3:])):
        vals = [row[ci+3] for row in ax_data]
        ax2.plot(disp, vals, marker="o", markersize=4, linewidth=1.8,
                 color=color, label=label)
    _style_ax(ax2, "Giroscopio por Disparo (°/s)", "Número de disparo", "Valor (°/s)")
    ax2.set_xticks(disp)
    ax2.axhline(0, color="gray", linewidth=0.5)
    ax2.legend(fontsize=9, loc="upper right")

    plt.tight_layout()
    return _fig_to_img(fig, tmpdir, "evolucion")


# =============================================================================
# FUNCIÓN PRINCIPAL
# =============================================================================
def generate_excel(records) -> bytes:
    n = len(records)
    ax = [r.accel_x for r in records]
    ay = [r.accel_y for r in records]
    az = [r.accel_z for r in records]
    gx = [r.gyro_x  for r in records]
    gy = [r.gyro_y  for r in records]
    gz = [r.gyro_z  for r in records]

    ax_vals   = [ax, ay, az, gx, gy, gz]
    var_names = ["Accel X","Accel Y","Accel Z","Gyro X","Gyro Y","Gyro Z"]
    units     = ["g","g","g","°/s","°/s","°/s"]

    wb = openpyxl.Workbook()

    with tempfile.TemporaryDirectory() as tmpdir:

        # ── Pre-render todas las imágenes ─────────────────────────────────
        img_means = _chart_stat_means(ax_vals, var_names, tmpdir)
        img_hist  = _chart_histograms(ax_vals, var_names, units, tmpdir)

        # Matriz de correlación
        corr = [[_pearson(ax_vals[i], ax_vals[j])
                 for j in range(6)] for i in range(6)]
        img_corr  = _chart_correlation(corr, var_names, tmpdir)

        # Binomial negativa
        umbral = 10.0
        exitos = sum(1 for v in gz if abs(v) < umbral)
        p_real = exitos/n if n > 0 else 0.5
        r_obj  = 3
        p_mod  = max(p_real, 0.01)
        k_max  = min(r_obj + int(r_obj/p_mod*3), 30)
        pmf_data = [(k, _nb_pmf(r_obj,k,p_mod))
                    for k in range(r_obj, k_max+1)]
        img_nb    = _chart_nb(r_obj, p_mod, pmf_data, tmpdir)
        img_evol  = _chart_evolution(records, tmpdir)

        # ================================================================
        # HOJA 1 — Datos crudos
        # ================================================================
        ws1 = wb.active
        ws1.title = "Datos"
        ws1.sheet_view.showGridLines = False

        ws1["A1"] = f"DATOS CRUDOS DEL SENSOR MPU6050 — n = {n} registros"
        ws1["A1"].font = _font(C_DARK_BLUE, True, 13)
        ws1["A1"].alignment = _align("left")
        ws1.merge_cells("A1:I1")
        ws1.row_dimensions[1].height = 22

        hdrs = ["N°","Timestamp","Disparo","Accel X (g)","Accel Y (g)",
                "Accel Z (g)","Gyro X (°/s)","Gyro Y (°/s)","Gyro Z (°/s)"]
        for c,h in enumerate(hdrs,1):
            _hdr(ws1.cell(3,c), h)
        ws1.row_dimensions[3].height = 20

        for ri, rec in enumerate(records, 4):
            bg = C_GRAY_L if ri%2==0 else C_WHITE
            vals = [ri-3, str(rec.timestamp)[:19], rec.disparo,
                    rec.accel_x, rec.accel_y, rec.accel_z,
                    rec.gyro_x,  rec.gyro_y,  rec.gyro_z]
            for ci,v in enumerate(vals,1):
                fmt = "0.0000" if isinstance(v, float) else None
                _cell(ws1.cell(ri,ci), v, bg=bg, fmt=fmt)
        _autowidth(ws1)

        # ================================================================
        # HOJA 2 — Estadística
        # ================================================================
        ws2 = wb.create_sheet("Estadística")
        ws2.sheet_view.showGridLines = False

        ws2["A1"] = f"ESTADÍSTICA DESCRIPTIVA — n = {n} registros válidos"
        ws2["A1"].font = _font(C_DARK_BLUE, True, 13)
        ws2.merge_cells("A1:N1")
        ws2["A1"].alignment = _align("left")

        nota = ("Nota: CV = Desv.Est./|Media|×100  ·  IQR = Q3−Q1  "
                "·  ✓ CV<30% estable  ·  △ 30–100%  ·  ▲ 100–300%  ·  ✗ >300%")
        ws2["A2"] = nota
        ws2["A2"].font = Font(italic=True, size=9, color="666666", name="Arial")
        ws2.merge_cells("A2:N2")

        sh = ["Variable","Unidad","N","Media","Varianza","Desv. Est.",
              "Mínimo","Q1 (25%)","Mediana","Q3 (75%)","Máximo","IQR","CV (%)","Estabilidad"]
        for c,h in enumerate(sh,1):
            _hdr(ws2.cell(3,c), h, bg=C_MED_BLUE)
        ws2.row_dimensions[3].height = 20

        for ri,(name,(vals,unit)) in enumerate(
                zip(var_names, zip(ax_vals,units)), 4):
            s  = _stat(vals)
            bg = C_GRAY_L if ri%2==0 else C_WHITE
            cv = s["cv"]
            if cv < 30:      stxt,sbg,sfg = "✓ Estable",  C_GREEN_L,   C_GREEN_D
            elif cv < 100:   stxt,sbg,sfg = "△ Moderada","FFF2CC",    "7F6000"
            elif cv < 300:   stxt,sbg,sfg = "▲ Alta",    "FCE4D6",    C_ORANGE
            else:            stxt,sbg,sfg = "✗ Muy alta","FFE6E6",    C_RED

            row = [name,unit,s["n"],s["media"],s["varianza"],s["desv_est"],
                   s["minimo"],s["q1"],s["mediana"],s["q3"],
                   s["maximo"],s["iqr"],s["cv"],stxt]
            for ci,v in enumerate(row,1):
                c = ws2.cell(ri,ci)
                _cell(c, v, bg=bg, fmt="0.0000" if isinstance(v,float) else None)
                if ci==1: c.font=_font("000000",True,10)
                if ci==14:
                    c.fill=_fill(sbg); c.font=_font(sfg,True,10)

        _autowidth(ws2)
        # Insertar imagen de medias
        _insert_img(ws2, img_means, "P3", width_px=580, height_px=280)

        # ================================================================
        # HOJA 3 — Frecuencias
        # ================================================================
        ws3 = wb.create_sheet("Frecuencias")
        ws3.sheet_view.showGridLines = False

        ws3["A1"] = "DISTRIBUCIÓN DE FRECUENCIAS — bins ajustados al rango real"
        ws3["A1"].font = _font(C_WHITE, True, 13)
        ws3["A1"].fill = _fill(C_GREEN_D)
        ws3.merge_cells("A1:R1")
        ws3["A1"].alignment = _align("left")

        col_starts = [1,4,7,10,13,16]
        for idx,(name,vals,unit) in enumerate(zip(var_names,ax_vals,units)):
            cs = col_starts[idx]
            bg_h = C_MED_BLUE if idx<3 else C_ORANGE
            # título variable
            tc = ws3.cell(2,cs)
            _hdr(tc, f"{name} ({unit})", bg=bg_h)
            ws3.merge_cells(start_row=2,start_column=cs,end_row=2,end_column=cs+2)
            # cabeceras
            _hdr(ws3.cell(3,cs),   "Intervalo",   bg=C_DARK_BLUE)
            _hdr(ws3.cell(3,cs+1), "Frec. Abs.",  bg=C_DARK_BLUE)
            _hdr(ws3.cell(3,cs+2), "Frec. Rel.%", bg=C_DARK_BLUE)

            bins = _make_bins(vals, 6)
            total = sum(b[2] for b in bins)
            for bi,(lo,hi,freq) in enumerate(bins):
                row = 4+bi
                bg  = C_GRAY_L if bi%2==0 else C_WHITE
                rel = round(freq/total*100,1) if total else 0
                _cell(ws3.cell(row,cs),   f"{lo} a {hi}", bg=bg, align="center")
                fc = ws3.cell(row,cs+1)
                _cell(fc, freq, bg=bg,
                      color=C_MED_BLUE if freq>0 else "AAAAAA",
                      bold=freq>0)
                rc = ws3.cell(row,cs+2)
                _cell(rc, rel, bg=bg, fmt='0.0"%"')

        _autowidth(ws3, mn=8, mx=18)
        # Imagen de histogramas
        _insert_img(ws3, img_hist, "A11", width_px=900, height_px=520)

        # ================================================================
        # HOJA 4 — Correlación
        # ================================================================
        ws4 = wb.create_sheet("Correlación")
        ws4.sheet_view.showGridLines = False

        ws4["A1"] = "MATRIZ DE CORRELACIÓN PEARSON — 6 ejes del MPU6050"
        ws4["A1"].font = _font(C_DARK_BLUE, True, 13)
        ws4.merge_cells("A1:H1")
        ws4["A1"].alignment = _align("left")

        for ci,name in enumerate(var_names,2): _hdr(ws4.cell(2,ci), name)
        for ri,name in enumerate(var_names,3): _hdr(ws4.cell(ri,1), name)

        for ri,vi in enumerate(ax_vals):
            for ci,vj in enumerate(ax_vals):
                r  = corr[ri][ci]
                cell = ws4.cell(ri+3, ci+2)
                cell.value = r; cell.number_format="0.0000"
                cell.border = BORDER; cell.alignment = _align()
                if ri==ci:
                    cell.fill=_fill(C_DARK_BLUE); cell.font=_font(C_WHITE,True,10)
                elif abs(r)>=0.8:
                    cell.fill=_fill(C_GREEN_L); cell.font=_font(C_GREEN_D,True,10)
                elif abs(r)>=0.5:
                    cell.fill=_fill("FFF2CC"); cell.font=_font("7F6000",True,10)
                else:
                    cell.fill=_fill(C_WHITE); cell.font=_font("000000",False,10)

        ws4["A11"]="Interpretación: |r|≥0.8 fuerte (verde) · 0.5–0.8 moderada (amarillo) · <0.5 débil"
        ws4["A11"].font=Font(italic=True,size=9,color="666666",name="Arial")
        ws4.merge_cells("A11:H11")
        _autowidth(ws4)
        _insert_img(ws4, img_corr, "J2", width_px=460, height_px=380)

        # ================================================================
        # HOJA 5 — Probabilístico
        # ================================================================
        ws5 = wb.create_sheet("Probabilístico")
        ws5.sheet_view.showGridLines = False

        ws5["A1"]="MODELO PROBABILÍSTICO — Distribución Binomial Negativa"
        ws5["A1"].font=_font(C_DARK_BLUE,True,13)
        ws5.merge_cells("A1:J1"); ws5["A1"].alignment=_align("left")

        ws5["A3"]="Definición del experimento"
        ws5["A3"].font=_font("000000",True,11)
        ctx=[("Sensor","MPU6050 — Acelerómetro + Giroscopio"),
             ("Evento de éxito (X=1)",f"Gyro Z < {umbral} °/s → disparo estable"),
             ("Evento de fallo (X=0)",f"Gyro Z ≥ {umbral} °/s → disparo inestable"),
             ("Estimación de p",f"Basada en {n} disparos: {exitos}/{n} estables")]
        for ri,(k,v) in enumerate(ctx,4):
            ws5.cell(ri,1).value=k; ws5.cell(ri,1).font=_font("000000",True,10)
            ws5.cell(ri,1).border=BORDER; ws5.cell(ri,1).fill=_fill(C_GRAY_L)
            ws5.cell(ri,1).alignment=_align("left")
            ws5.cell(ri,2).value=v; ws5.cell(ri,2).font=_font("000000",False,10)
            ws5.cell(ri,2).border=BORDER; ws5.cell(ri,2).alignment=_align("left")
            ws5.merge_cells(start_row=ri,start_column=2,end_row=ri,end_column=6)

        ws5["A9"]="Parámetros del modelo BN(r, p)"
        ws5["A9"].font=_font("000000",True,11)
        ex_val = r_obj/p_mod
        var_val= r_obj*(1-p_mod)/p_mod**2
        params=[("r (éxitos deseados)",r_obj,"Disparos estables objetivo"),
                ("p (prob. éxito)",round(p_mod,4),f"Estimado: {exitos}/{n} disparos estables"),
                ("E[X] = r/p",round(ex_val,4),"Disparos esperados hasta r éxitos"),
                ("Var[X] = r(1-p)/p²",round(var_val,4),"Varianza del número de disparos"),
                ("σ[X]",round(math.sqrt(var_val),4),"Desv. estándar")]
        for c,h in enumerate(["Parámetro","Valor","Interpretación"],1):
            _hdr(ws5.cell(10,c), h, bg=C_MED_BLUE)
        ws5.merge_cells(start_row=10,start_column=3,end_row=10,end_column=7)

        for ri,(p,v,i) in enumerate(params,11):
            bg=C_GRAY_L if ri%2==0 else C_WHITE
            _cell(ws5.cell(ri,1),p,bold=True,bg=bg,align="left",color="000000")
            _cell(ws5.cell(ri,2),v,bold=True,bg=bg,color=C_MED_BLUE,fmt="0.0000")
            _cell(ws5.cell(ri,3),i,bg=bg,color="000000",align="left")
            ws5.merge_cells(start_row=ri,start_column=3,end_row=ri,end_column=7)

        ws5["A17"]="Distribución de probabilidad P(X=k)"
        ws5["A17"].font=_font("000000",True,11)
        for c,h in enumerate(["k (total disparos)","P(X=k)","P(X≤k) acumulada"],1):
            _hdr(ws5.cell(18,c), h, bg=C_DARK_BLUE)
        ws5.merge_cells(start_row=18,start_column=3,end_row=18,end_column=5)

        acum=0.0
        for ki,(_k,_p) in enumerate(pmf_data):
            acum=round(acum+_p,6); row=19+ki; bg=C_GRAY_L if ki%2==0 else C_WHITE
            _cell(ws5.cell(row,1),_k,bg=bg)
            _cell(ws5.cell(row,2),_p,bg=bg,fmt="0.000000")
            _cell(ws5.cell(row,3),acum,bg=bg,fmt="0.0000")
            ws5.merge_cells(start_row=row,start_column=3,end_row=row,end_column=5)

        _autowidth(ws5)
        _insert_img(ws5, img_nb, "H3", width_px=560, height_px=340)

        # ================================================================
        # HOJA 6 — Gráficas
        # ================================================================
        ws6 = wb.create_sheet("Gráficas")
        ws6.sheet_view.showGridLines = False

        ws6["A1"]="EVOLUCIÓN POR DISPARO — Medias de cada eje"
        ws6["A1"].font=_font(C_DARK_BLUE,True,13)
        ws6.merge_cells("A1:H1"); ws6["A1"].alignment=_align("left")

        gh=["Disparo","Accel X (g)","Accel Y (g)","Accel Z (g)",
            "Gyro X (°/s)","Gyro Y (°/s)","Gyro Z (°/s)"]
        for c,h in enumerate(gh,1): _hdr(ws6.cell(2,c),h)

        for ri,rec in enumerate(records,3):
            bg=C_GRAY_L if ri%2==0 else C_WHITE
            rd=[rec.disparo,rec.accel_x,rec.accel_y,rec.accel_z,
                rec.gyro_x,rec.gyro_y,rec.gyro_z]
            for ci,v in enumerate(rd,1):
                _cell(ws6.cell(ri,ci),v,bg=bg,
                      fmt="0.0000" if isinstance(v,float) else None)

        _autowidth(ws6)
        _insert_img(ws6, img_evol, "I2", width_px=700, height_px=560)

        # ── Guardar ──────────────────────────────────────────────────────
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return buf.read()