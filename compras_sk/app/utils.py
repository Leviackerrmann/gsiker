from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from datetime import datetime
import os


def generar_pdf_solicitud(solicitud):
    """Genera un PDF de la solicitud de compra con formato Fusionplast"""

    filename = f"solicitud_{solicitud.numero_solicitud}.pdf"
    filepath = os.path.join('/tmp', filename)

    # Crear documento
    doc = SimpleDocTemplate(
        filepath,
        pagesize=letter,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch
    )
    elements = []
    styles = getSampleStyleSheet()

    # Colores (PDF mantiene verde corporativo)
    color_primary = colors.HexColor('#00B050')
    color_gris = colors.HexColor('#D9D9D9')

    # Estilo para texto en celdas (wrap)
    cell_style = ParagraphStyle(
        'CellStyle',
        parent=styles['Normal'],
        fontSize=7,
        leading=8,
        wordWrap='CJK'
    )

    # Estilo más compacto para UNIDAD (para textos largos)
    unit_style = ParagraphStyle(
        'UnitStyle',
        parent=cell_style,
        fontSize=6,
        leading=7,
        wordWrap='CJK'
    )

    # Obtener nombre de la empresa
    nombre_empresa = solicitud.empresa or 'FUSIONPLAST'

    # Ruta del logo
    logo_filename = f"{nombre_empresa}.png"
    logo_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        'static',
        'logos',
        logo_filename
    )

    # Verificar si existe el logo en .png, si no, buscar .jpg
    if not os.path.exists(logo_path):
        logo_filename = f"{nombre_empresa}.jpg"
        logo_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            'static',
            'logos',
            logo_filename
        )

    # Encabezado con logo o texto si no hay logo
    if os.path.exists(logo_path):
        try:
            logo = RLImage(logo_path, width=2 * inch, height=0.6 * inch, kind='proportional')
            encabezado_data = [
                [logo, '', "Fecha:\nN° SC:", f"{solicitud.fecha.strftime('%d/%m/%Y')}\n{solicitud.numero_solicitud}"]
            ]
        except Exception as e:
            print(f"Error al cargar logo: {e}")
            encabezado_data = [
                [nombre_empresa, '', "Fecha:\nN° SC:", f"{solicitud.fecha.strftime('%d/%m/%Y')}\n{solicitud.numero_solicitud}"]
            ]
    else:
        encabezado_data = [
            [nombre_empresa, '', "Fecha:\nN° SC:", f"{solicitud.fecha.strftime('%d/%m/%Y')}\n{solicitud.numero_solicitud}"]
        ]

    encabezado_table = Table(encabezado_data, colWidths=[2.5 * inch, 2 * inch, 1 * inch, 1.5 * inch])
    encabezado_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (0, 0), 16),
        ('TEXTCOLOR', (0, 0), (0, 0), color_primary),
        ('FONTSIZE', (2, 0), (3, 0), 9),
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (2, 0), (3, 0), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))

    elements.append(encabezado_table)
    elements.append(Spacer(1, 0.1 * inch))

    # Sección Solicitante
    solicitante_titulo = Paragraph("<b>Solicitante</b>", styles['Normal'])
    elements.append(solicitante_titulo)

    solicitante_data = [
        ["Empresa:", solicitud.empresa or '', "Área:", solicitud.area or ''],
        ["Cargo:", solicitud.cargo_solicitante or '', "Nombre:", solicitud.nombre_solicitante or '']
    ]

    solicitante_table = Table(solicitante_data, colWidths=[0.8 * inch, 2.2 * inch, 0.8 * inch, 2.7 * inch])
    solicitante_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.black),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
    ]))

    elements.append(solicitante_table)
    elements.append(Spacer(1, 0.15 * inch))

    # Tabla de items
    items_data = [['N°', 'Código SKU', 'Descripción', 'COMENTARIO', 'Cantidad', 'Unidad', 'Destino', 'Fecha requerido']]

    for idx, item in enumerate(solicitud.items, 1):
        fecha_entrega_str = item.fecha_entrega.strftime('%d/%m/%Y') if item.fecha_entrega else 'N/A'
        unidad_texto = item.unidad_override or item.sku.unidad_medida or 'UND'

        items_data.append([
            str(idx),
            Paragraph(item.sku.codigo_sku or '', cell_style),
            Paragraph(item.sku.descripcion or '', cell_style),
            Paragraph(item.observaciones or 'N/A', cell_style),
            Paragraph(str(item.cantidad), cell_style),
            Paragraph(unidad_texto, unit_style),  # ✅ FIX: wrap para unidad
            Paragraph(item.destino or '', cell_style),
            Paragraph(fecha_entrega_str, cell_style),
        ])

    # Fila TOTAL
    total_cantidad = sum([item.cantidad for item in solicitud.items]) if solicitud.items else 0
    items_data.append(['TOTAL', '', '', '', str(total_cantidad), '', '', ''])

    # ✅ FIX: Columna Unidad más ancha
    items_table = Table(
        items_data,
        colWidths=[
            0.3 * inch,  # N°
            0.7 * inch,  # Código SKU
            2.1 * inch,  # Descripción (un poco menos)
            1.0 * inch,  # Comentario
            0.6 * inch,  # Cantidad
            1.1 * inch,  # Unidad (más ancha)
            0.9 * inch,  # Destino
            0.9 * inch   # Fecha requerido
        ]
    )

    total_row = len(items_data) - 1

    items_table.setStyle(TableStyle([
        # Encabezado verde
        ('BACKGROUND', (0, 0), (-1, 0), color_primary),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 7),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, 0), 'MIDDLE'),

        # Contenido
        ('FONTSIZE', (0, 1), (-1, -2), 7),
        ('VALIGN', (0, 1), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 1), (0, -1), 'CENTER'),
        ('ALIGN', (4, 1), (4, -1), 'CENTER'),
        ('ALIGN', (5, 1), (5, -1), 'CENTER'),

        # Fila TOTAL con verde
        ('BACKGROUND', (0, total_row), (-1, total_row), color_primary),
        ('TEXTCOLOR', (0, total_row), (-1, total_row), colors.white),
        ('FONTNAME', (0, total_row), (-1, total_row), 'Helvetica-Bold'),

        # TOTAL no se corta (ocupa varias columnas)
        ('SPAN', (0, total_row), (3, total_row)),
        ('ALIGN', (0, total_row), (3, total_row), 'LEFT'),
        ('LEFTPADDING', (0, total_row), (3, total_row), 8),
        ('RIGHTPADDING', (0, total_row), (3, total_row), 8),

        # Bordes
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),

        # Padding general
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),

        # compactar N°
        ('LEFTPADDING', (0, 0), (0, -1), 2),
        ('RIGHTPADDING', (0, 0), (0, -1), 2),
    ]))

    elements.append(items_table)
    elements.append(Spacer(1, 0.3 * inch))

    # Sección de firmas
    firmas_data = [
        ['Solicitado por:', solicitud.nombre_solicitante or '', '', 'Autorizado por:', solicitud.jefe_nombre or ''],
        ['', '', '', '', ''],
        ['Cargo:', solicitud.cargo_solicitante or '', '', 'Cargo:', solicitud.jefe_cargo or '']
    ]

    firmas_table = Table(firmas_data, colWidths=[1 * inch, 2 * inch, 0.5 * inch, 1.2 * inch, 2 * inch])
    firmas_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (3, 0), (3, -1), 'Helvetica-Bold'),
        ('LINEABOVE', (1, 1), (1, 1), 1, colors.black),
        ('LINEABOVE', (4, 1), (4, 1), 1, colors.black),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
    ]))

    elements.append(firmas_table)

    # Construir PDF
    doc.build(elements)

    return filepath