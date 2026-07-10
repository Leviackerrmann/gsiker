import hashlib
import os
from datetime import datetime, timezone as dt_tz
from flask import Blueprint, render_template, request, jsonify, session, redirect, url_for, send_file, current_app
from werkzeug.exceptions import HTTPException
from flask_wtf.csrf import CSRFError
import secrets
from sqlalchemy import func, cast, Integer, text
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash, check_password_hash
from app import db
from app.models import SKU, Solicitud, ItemSolicitud, Usuario, Identidad, AdminUser, Empresa, AuditoriaSolicitud

bp = Blueprint('main', __name__)


@bp.errorhandler(CSRFError)
def handle_csrf_error(e):
    api_paths = ('/set-identidad', '/buscar-usuarios', '/registrar-usuario',
                 '/guardar-solicitud', '/actualizar-solicitud', '/sidebar-count',
                 '/admin/solicitud/', '/admin/eliminar', '/admin/desvincular',
                 '/admin/definir-pin', '/admin/crear-admin', '/admin/empresa',
                 '/admin/cambiar-clave', '/verificar-identidad',
                 '/admin/login')
    if any(request.path.startswith(p) for p in api_paths):
        return jsonify({'success': False, 'message': 'Error de seguridad (CSRF). Recarga la página e intenta de nuevo.'}), 400
    return e


def generar_token():
    raw = secrets.token_urlsafe(32)
    h = hashlib.sha256(raw.encode()).hexdigest()
    return raw, h


def get_usuario_sistema():
    usuario = Usuario.query.filter_by(email='sistema@empresa.com').first()
    if not usuario:
        usuario = Usuario(
            nombre='Usuario del Sistema',
            email='sistema@empresa.com',
            password=generate_password_hash('sistema')
        )
        db.session.add(usuario)
        db.session.commit()
    return usuario


PREFIJOS = {
    'ACCESORIOS/COMPONENTES': 'ACC',
    'CONSUMIBLES GENERALES': 'CG',
    'HERRAMIENTAS': 'HER',
    'INSUMOS INDIRECTOS DE PRODUCCION': 'INS',
    'MATERIA PRIMA': 'MP',
    'REPUESTOS': 'REP',
    'SERVICIOS': 'SRV'
}


def generar_codigo_sku(categoria: str) -> str:
    categoria_norm = (categoria or '').strip().upper()
    prefijo = PREFIJOS.get(categoria_norm, 'GEN')
    num_part = cast(func.split_part(SKU.codigo_sku, '-', 2), Integer)
    max_num = (
        db.session.query(func.max(num_part))
        .filter(SKU.codigo_sku.like(f'{prefijo}-%'))
        .filter(SKU.codigo_sku.op('~')(f'^{prefijo}-\\d+$'))
        .scalar()
    )
    nuevo_numero = (max_num or 0) + 1
    return f"{prefijo}-{nuevo_numero:05d}"


def aplicar_orden(base, model, sort_by, sort_order, default_sort='fecha', default_order='desc'):
    if sort_by and hasattr(model, sort_by):
        col = getattr(model, sort_by)
    else:
        col = getattr(model, default_sort)
    if sort_order == 'asc':
        base = base.order_by(col.asc())
    else:
        base = base.order_by(col.desc())
    return base


# =========================
# Identidad del usuario
# =========================

@bp.route('/verificar-identidad')
def verificar_identidad():
    identidad = session.get('identidad')
    if identidad:
        existe = Identidad.query.filter_by(nombre=identidad).first()
        if existe:
            return jsonify({'valida': True})
    return jsonify({'valida': False})


@bp.route('/buscar-usuarios')
def buscar_usuarios():
    q = (request.args.get('q', '') or '').strip()
    if len(q) < 1:
        return jsonify({'usuarios': []})
    usuarios = (
        db.session.query(Identidad.nombre, Identidad.device_token_hash)
        .filter(Identidad.nombre.ilike(f'%{q}%'))
        .distinct()
        .order_by(Identidad.nombre)
        .limit(10)
        .all()
    )
    data = []
    for nombre, token_hash in usuarios:
        data.append({
            'nombre': nombre,
            'vinculado': token_hash is not None
        })
    return jsonify({'usuarios': data})

@bp.route('/sidebar-count')
def sidebar_count():
    identidad = session.get('identidad')
    if not identidad:
        return jsonify({'count': 0})
    count = Solicitud.query.filter(Solicitud.nombre_solicitante == identidad).count()
    return jsonify({'count': count})


@bp.route('/set-identidad', methods=['POST'])
def set_identidad():
    data = request.get_json(silent=True) or {}
    nombre = (data.get('nombre') or '').strip()
    token = (data.get('device_token') or '').strip()
    pin = (data.get('pin_code') or '').strip()
    if not nombre:
        return jsonify({'success': False, 'message': 'Nombre requerido'}), 400

    identidad = Identidad.query.filter_by(nombre=nombre).first()
    if not identidad:
        return jsonify({'success': False, 'message': 'Usuario no encontrado'}), 404

    if identidad.device_token_hash:
        token_hash = hashlib.sha256(token.encode()).hexdigest() if token else ''
        if token_hash == identidad.device_token_hash:
            session['identidad'] = nombre
            return jsonify({'success': True, 'nombre': nombre})

        if not identidad.pin_hash:
            return jsonify({'success': False, 'message': f'"{nombre}" no tiene código PIN asignado. Contacte al administrador.'}), 403

        if not pin:
            return jsonify({
                'success': False,
                'needs_pin': True,
                'message': f'"{nombre}" está vinculado a otro equipo. Ingrese su código PIN.'
            }), 403

        pin_hash = hashlib.sha256(pin.encode()).hexdigest()
        if pin_hash != identidad.pin_hash:
            return jsonify({'success': False, 'needs_pin': True, 'message': 'Código PIN incorrecto'}), 403

        session['identidad'] = nombre
        return jsonify({'success': True, 'nombre': nombre})

    if not token:
        return jsonify({'success': False, 'message': 'Token del dispositivo requerido'}), 400

    nuevo_hash = hashlib.sha256(token.encode()).hexdigest()
    dueno = Identidad.query.filter(
        Identidad.device_token_hash == nuevo_hash,
        Identidad.nombre != nombre
    ).first()
    if dueno:
        if pin:
            if not identidad.pin_hash:
                return jsonify({'success': False, 'message': f'"{nombre}" no tiene código PIN asignado. Contacte al administrador.'}), 403
            pin_hash = hashlib.sha256(pin.encode()).hexdigest()
            if pin_hash != identidad.pin_hash:
                return jsonify({
                    'success': False,
                    'needs_pin': True,
                    'message': 'Código PIN incorrecto'
                }), 403
            session['identidad'] = nombre
            return jsonify({'success': True, 'nombre': nombre})

        if identidad.pin_hash:
            return jsonify({
                'success': False,
                'needs_pin': True,
                'message': f'Este equipo pertenece a "{dueno.nombre}". Ingrese su código PIN de "{nombre}" para acceso temporal.'
            }), 403

        return jsonify({
            'success': False,
            'message': f'Este equipo pertenece a "{dueno.nombre}". "{nombre}" no tiene PIN. Contacte al administrador.'
        }), 403

    identidad.device_token_hash = nuevo_hash
    db.session.commit()
    session['identidad'] = nombre
    return jsonify({'success': True, 'nombre': nombre})


@bp.route('/registrar-usuario', methods=['POST'])
def registrar_usuario():
    data = request.get_json(silent=True) or {}
    nombre = (data.get('nombre') or '').strip()
    token = (data.get('device_token') or '').strip()
    pin = (data.get('pin_code') or '').strip()

    if not token:
        return jsonify({'success': False, 'message': 'Token del dispositivo requerido'}), 400
    if not pin or not pin.isdigit() or len(pin) != 4:
        return jsonify({'success': False, 'message': 'Debe ingresar un código PIN de exactamente 4 dígitos'}), 400

    partes = nombre.split()
    if len(partes) < 2:
        return jsonify({'success': False, 'message': 'Debe ingresar nombre y apellido'}), 400

    nombre_part, apellido_part = partes[0], partes[-1]
    if not nombre_part[0].isupper() or not apellido_part[0].isupper():
        return jsonify({
            'success': False,
            'message': 'La primera letra del nombre y del apellido debe ser mayúscula'
        }), 400

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    pin_hash = hashlib.sha256(pin.encode()).hexdigest()

    vinculado_a = Identidad.query.filter(
        Identidad.device_token_hash == token_hash,
        Identidad.nombre != nombre
    ).first()
    if vinculado_a:
        return jsonify({
            'success': False,
            'message': f'Este equipo ya está vinculado a "{vinculado_a.nombre}". Debe desvincularlo desde el panel Admin.'
        }), 409

    existente = Identidad.query.filter_by(nombre=nombre).first()
    if existente:
        if existente.device_token_hash:
            return jsonify({'success': False, 'message': f'"{nombre}" ya está registrado y vinculado a otro equipo'}), 409
        existente.device_token_hash = token_hash
        existente.pin_hash = pin_hash
        db.session.commit()
    else:
        identidad = Identidad(nombre=nombre, device_token_hash=token_hash, pin_hash=pin_hash)
        try:
            db.session.add(identidad)
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            return jsonify({'success': False, 'message': 'Error al registrar el usuario'}), 500

    session['identidad'] = nombre
    return jsonify({'success': True, 'nombre': nombre, 'device_token': token})


# =========================
# Rutas principales
# =========================

@bp.route('/')
def index():
    solicitud_edit = None
    edit_mode = False
    solicitud_id = request.args.get('editar')
    if solicitud_id:
        try:
            solicitud_edit = db.session.get(Solicitud, int(solicitud_id))
            if solicitud_edit:
                edit_mode = True
        except (ValueError, TypeError):
            pass

    identidad = session.get('identidad')
    base = Solicitud.query
    if identidad:
        base = base.filter(Solicitud.nombre_solicitante == identidad)

    stats = {
        'total': base.count(),
        'total_skus': SKU.query.count(),
    }
    ultima = base.order_by(Solicitud.fecha.desc()).first()
    empresas = Empresa.query.filter_by(activa=True).order_by(Empresa.nombre).all()
    return render_template(
        'solicitud.html',
        stats=stats,
        ultima=ultima,
        solicitud=solicitud_edit,
        edit_mode=edit_mode,
        empresas=empresas
    )


@bp.route('/mis-solicitudes')
def mis_solicitudes():
    query = (request.args.get('q', '') or '').strip()
    desde = (request.args.get('desde', '') or '').strip()
    hasta = (request.args.get('hasta', '') or '').strip()
    page = request.args.get('page', 1, type=int)
    sort_by = (request.args.get('sort_by', 'fecha') or '').strip()
    sort_order = (request.args.get('sort_order', 'desc') or '').strip()
    identidad = session.get('identidad')

    base = Solicitud.query
    if identidad:
        base = base.filter(Solicitud.nombre_solicitante == identidad)

    if query:
        base = base.filter(
            (Solicitud.numero_solicitud.ilike(f'%{query}%')) |
            (Solicitud.empresa.ilike(f'%{query}%')) |
            (Solicitud.area.ilike(f'%{query}%'))
        )

    if desde:
        try:
            desde_fecha = datetime.strptime(desde, '%Y-%m-%d')
            base = base.filter(Solicitud.fecha >= desde_fecha)
        except ValueError:
            pass

    if hasta:
        try:
            hasta_fecha = datetime.strptime(hasta, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
            base = base.filter(Solicitud.fecha <= hasta_fecha)
        except ValueError:
            pass

    base = aplicar_orden(base, Solicitud, sort_by, sort_order)
    solicitudes = base.paginate(page=page, per_page=10, error_out=False)
    return render_template('mis_solicitudes.html',
                           solicitudes=solicitudes, query=query, desde=desde, hasta=hasta,
                           sort_by=sort_by, sort_order=sort_order)


@bp.route('/solicitud/<int:id>')
def solicitud_detalle(id):
    solicitud = Solicitud.query.get_or_404(id)
    auditoria = AuditoriaSolicitud.query.filter_by(solicitud_id=id).order_by(AuditoriaSolicitud.timestamp.desc()).all()
    return render_template('solicitud_detalle.html', solicitud=solicitud, auditoria=auditoria)


@bp.route('/solicitud/<int:id>/json')
def solicitud_json(id):
    solicitud = Solicitud.query.get_or_404(id)
    return jsonify({
        'success': True,
        'solicitud': {
            'id': solicitud.id,
            'numero_solicitud': solicitud.numero_solicitud,
            'empresa': solicitud.empresa,
            'area': solicitud.area,
            'nombre_solicitante': solicitud.nombre_solicitante,
            'cargo_solicitante': solicitud.cargo_solicitante,
            'jefe_nombre': solicitud.jefe_nombre,
            'jefe_cargo': solicitud.jefe_cargo,
            'items': [{
                'sku_id': item.sku_id,
                'cantidad': item.cantidad,
                'observaciones': item.observaciones,
                'destino': item.destino,
                'fecha_entrega': item.fecha_entrega.strftime('%Y-%m-%d') if item.fecha_entrega else '',
                'unidad_override': item.unidad_override,
                'sku_codigo': item.sku.codigo_sku if item.sku else '',
                'sku_descripcion': item.sku.descripcion if item.sku else '',
                'sku_unidad': item.sku.unidad_medida if item.sku else ''
            } for item in solicitud.items]
        }
    })


@bp.route('/dashboard')
def dashboard():
    identidad = session.get('identidad')
    if not identidad:
        return redirect('/')

    total_solicitudes = Solicitud.query.filter_by(nombre_solicitante=identidad).count()

    solicitudes_por_mes = (
        db.session.query(
            func.extract('year', Solicitud.fecha).label('year'),
            func.extract('month', Solicitud.fecha).label('month'),
            func.count().label('count')
        )
        .filter(Solicitud.nombre_solicitante == identidad)
        .group_by(text('year'), text('month'))
        .order_by(text('year'), text('month'))
        .all()
    )

    solicitudes_por_empresa = (
        db.session.query(Solicitud.empresa, func.count().label('count'))
        .filter(Solicitud.nombre_solicitante == identidad)
        .group_by(Solicitud.empresa)
        .order_by(func.count().desc())
        .all()
    )

    top_skus = (
        db.session.query(
            SKU.codigo_sku, SKU.descripcion,
            func.sum(ItemSolicitud.cantidad).label('total')
        )
        .join(ItemSolicitud, ItemSolicitud.sku_id == SKU.id)
        .join(Solicitud, ItemSolicitud.solicitud_id == Solicitud.id)
        .filter(Solicitud.nombre_solicitante == identidad)
        .group_by(SKU.id)
        .order_by(func.sum(ItemSolicitud.cantidad).desc())
        .limit(10)
        .all()
    )

    mes_labels = []
    mes_values = []
    for row in solicitudes_por_mes:
        mes_labels.append(f"{int(row.year)}-{int(row.month):02d}")
        mes_values.append(row.count)

    return render_template('dashboard.html',
                           total_solicitudes=total_solicitudes,
                           mes_labels=mes_labels,
                           mes_values=mes_values,
                           solicitudes_por_empresa=solicitudes_por_empresa,
                           top_skus=top_skus)


@bp.route('/catalogo-sku')
def catalogo_sku():
    query = (request.args.get('q', '') or '').strip()
    categoria = (request.args.get('categoria', '') or '').strip()
    page = request.args.get('page', 1, type=int)
    sort_by = (request.args.get('sort_by', 'codigo_sku') or '').strip()
    sort_order = (request.args.get('sort_order', 'asc') or '').strip()

    base = SKU.query
    if query:
        try:
            base = base.filter(
                SKU.search_vector.op('@@')(func.plainto_tsquery('spanish', query))
            )
            base = base.order_by(
                func.ts_rank(SKU.search_vector, func.plainto_tsquery('spanish', query)).desc()
            )
            sort_by = None
        except Exception:
            base = SKU.query.filter(
                (SKU.codigo_sku.ilike(f'%{query}%')) |
                (SKU.descripcion.ilike(f'%{query}%'))
            )
    if categoria:
        base = base.filter(SKU.categoria == categoria.upper())

    base = aplicar_orden(base, SKU, sort_by, sort_order)
    skus = base.paginate(page=page, per_page=25, error_out=False)

    cats = (
        db.session.query(SKU.categoria)
        .filter(SKU.categoria.isnot(None))
        .distinct()
        .order_by(SKU.categoria)
        .all()
    )
    categorias = [c[0] for c in cats]

    return render_template('catalogo_sku.html', skus=skus, query=query, categoria=categoria,
                           categorias=categorias, sort_by=sort_by, sort_order=sort_order)


@bp.route('/buscar-sku')
def buscar_sku():
    try:
        query = (request.args.get('q', '') or '').strip()
        if len(query) < 1:
            return jsonify({'skus': []})

        try:
            base = SKU.query.filter(
                SKU.search_vector.op('@@')(func.plainto_tsquery('spanish', query))
            )
            base = base.order_by(
                func.ts_rank(SKU.search_vector, func.plainto_tsquery('spanish', query)).desc()
            )
        except Exception:
            base = SKU.query.filter(
                (SKU.codigo_sku.ilike(f'%{query}%')) |
                (SKU.descripcion.ilike(f'%{query}%'))
            ).order_by(SKU.codigo_sku.asc())

        skus = base.limit(10).all()
        return jsonify({
            'skus': [{
                'id': s.id,
                'codigo': s.codigo_sku,
                'descripcion': s.descripcion,
                'unidad': s.unidad_medida
            } for s in skus]
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error en búsqueda: {str(e)}'}), 500


@bp.route('/crear-sku', methods=['POST'])
def crear_sku():
    data = request.get_json(silent=True) or {}
    usuario = get_usuario_sistema()
    descripcion = (data.get('descripcion') or '').strip()
    categoria = (data.get('categoria') or '').strip()
    subcategoria = (data.get('subcategoria') or '').strip()
    unidad = (data.get('unidad') or 'Unidad').strip()

    try:
        precio = float(data.get('precio', 0) or 0)
    except (TypeError, ValueError):
        precio = 0

    if not descripcion:
        return jsonify({'success': False, 'message': 'La descripción es obligatoria'}), 400
    if not categoria:
        return jsonify({'success': False, 'message': 'La categoría es obligatoria'}), 400

    for _ in range(5):
        codigo_sku = generar_codigo_sku(categoria)
        sku = SKU(
            codigo_sku=codigo_sku,
            descripcion=descripcion,
            subcategoria=subcategoria,
            unidad_medida=unidad,
            precio_referencia=precio,
            categoria=categoria.strip().upper(),
            creado_por=usuario.id
        )
        try:
            db.session.add(sku)
            db.session.commit()
            return jsonify({
                'success': True,
                'sku_id': sku.id,
                'codigo_sku': sku.codigo_sku
            }), 201
        except IntegrityError:
            db.session.rollback()
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'message': f'Error interno: {str(e)}'}), 500

    return jsonify({
        'success': False,
        'message': 'No se pudo generar un código SKU único, intente de nuevo.'
    }), 409


@bp.route('/crear-solicitud', methods=['POST'])
def crear_solicitud():
    try:
        data = request.get_json(silent=True) or {}
        usuario = get_usuario_sistema()
        identidad = session.get('identidad', '')
        ultimo = Solicitud.query.order_by(Solicitud.id.desc()).first()
        numero = f"SC-{(ultimo.id + 1) if ultimo else 1:05d}"

        solicitud = Solicitud(
            numero_solicitud=numero,
            usuario_id=usuario.id,
            empresa=data.get('empresa', ''),
            area=data.get('area', ''),
            cargo_solicitante=data.get('cargo', ''),
            nombre_solicitante=identidad or data.get('nombre', ''),
            jefe_nombre=data.get('jefe_nombre', ''),
            jefe_cargo=data.get('jefe_cargo', '')
        )
        db.session.add(solicitud)
        db.session.flush()

        items_data = data.get('items', [])
        for item in items_data:
            sku_id = item.get('sku_id')
            if sku_id is None or (isinstance(sku_id, (int, float)) and sku_id < 1):
                return jsonify({'success': False, 'message': 'Uno de los items no tiene SKU válido. Elimínelo y agréguelo de nuevo.'}), 400

        for item in items_data:
            fecha_entrega = None
            if item.get('fecha_entrega'):
                try:
                    fecha_entrega = datetime.strptime(item['fecha_entrega'], '%Y-%m-%d').date()
                except Exception:
                    fecha_entrega = None
            item_solicitud = ItemSolicitud(
                solicitud_id=solicitud.id,
                sku_id=int(item['sku_id']),
                cantidad=max(int(item.get('cantidad', 1) or 1), 1),
                observaciones=item.get('observaciones', ''),
                destino=item.get('destino', ''),
                fecha_entrega=fecha_entrega,
                unidad_override=item.get('unidad')
            )
            db.session.add(item_solicitud)

        db.session.flush()
        db.session.add(AuditoriaSolicitud(
            solicitud_id=solicitud.id,
            accion='creada',
            descripcion=f"Solicitud creada por {identidad}",
            identidad_nombre=identidad
        ))
        db.session.commit()
        return jsonify({'success': True, 'solicitud_id': solicitud.id})

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Error al guardar solicitud: {str(e)}'}), 500


@bp.route('/actualizar-solicitud/<int:id>', methods=['POST'])
def actualizar_solicitud(id):
    from werkzeug.exceptions import HTTPException
    solicitud = Solicitud.query.get_or_404(id)
    try:
        data = request.get_json(silent=True) or {}
        solicitud.empresa = data.get('empresa', solicitud.empresa)
        solicitud.area = data.get('area', solicitud.area)
        solicitud.cargo_solicitante = data.get('cargo', solicitud.cargo_solicitante)
        solicitud.jefe_nombre = data.get('jefe_nombre', solicitud.jefe_nombre)
        solicitud.jefe_cargo = data.get('jefe_cargo', solicitud.jefe_cargo)

        items_data = data.get('items', [])
        for item in items_data:
            sku_id = item.get('sku_id')
            if sku_id is None or (isinstance(sku_id, (int, float)) and sku_id < 1):
                return jsonify({'success': False, 'message': 'Uno de los items no tiene SKU válido. Elimínelo y agréguelo de nuevo.'}), 400

        ItemSolicitud.query.filter_by(solicitud_id=solicitud.id).delete()

        for item in items_data:
            fecha_entrega = None
            if item.get('fecha_entrega'):
                try:
                    fecha_entrega = datetime.strptime(item['fecha_entrega'], '%Y-%m-%d').date()
                except Exception:
                    fecha_entrega = None
            item_solicitud = ItemSolicitud(
                solicitud_id=solicitud.id,
                sku_id=int(item['sku_id']),
                cantidad=max(int(item.get('cantidad', 1) or 1), 1),
                observaciones=item.get('observaciones', ''),
                destino=item.get('destino', ''),
                fecha_entrega=fecha_entrega,
                unidad_override=item.get('unidad')
            )
            db.session.add(item_solicitud)

        db.session.commit()
        return jsonify({'success': True, 'solicitud_id': solicitud.id})

    except HTTPException:
        raise
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Error al actualizar solicitud: {str(e)}'}), 500


@bp.route('/generar-pdf/<int:solicitud_id>')
def generar_pdf(solicitud_id):
    from werkzeug.exceptions import HTTPException
    solicitud = Solicitud.query.get_or_404(solicitud_id)
    try:
        from app.utils import generar_pdf_solicitud
        pdf_path = generar_pdf_solicitud(solicitud)
        download = request.args.get('download') == '1'
        return send_file(pdf_path, as_attachment=download)
    except HTTPException:
        raise
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error al generar PDF: {str(e)}'}), 500


# =========================
# Admin panel
# =========================

@bp.before_request
def verificar_admin():
    if request.path.startswith('/admin') and request.path != '/admin/login':
        if not session.get('admin_user'):
            return redirect(url_for('main.admin_login'))


@bp.app_context_processor
def inject_static_url():
    def static_url(filename):
        path = os.path.join(current_app.static_folder, filename)
        version = int(os.path.getmtime(path)) if os.path.exists(path) else 0
        return url_for('static', filename=filename) + f'?v={version}'
    return dict(static_url=static_url)


@bp.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()

        # Seed default admin if not exists
        admin = AdminUser.query.filter_by(username=username).first()
        if not admin:
            admin = AdminUser.query.filter_by(username='admin').first()
            if not admin:
                admin = AdminUser(
                    username='admin',
                    password_hash=generate_password_hash('admin2026'),
                    rol='superadmin'
                )
                db.session.add(admin)
                db.session.commit()

        if admin and admin.check_password(password):
            session['admin_user'] = {'id': admin.id, 'username': admin.username, 'rol': admin.rol}
            return redirect(url_for('main.admin_dashboard'))
        return render_template('admin_login.html', error='Usuario o contraseña incorrectos')
    return render_template('admin_login.html')


@bp.route('/admin')
def admin_dashboard():
    usuarios = Identidad.query.order_by(Identidad.nombre).all()
    admin_users = AdminUser.query.order_by(AdminUser.username).all()

    total_solicitudes = Solicitud.query.count()
    total_usuarios = Identidad.query.count()
    total_skus = SKU.query.count()
    now = datetime.now(dt_tz.utc)
    solicitudes_mes = Solicitud.query.filter(
        Solicitud.fecha >= now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    ).count()

    counts = db.session.query(
        Solicitud.nombre_solicitante, func.count(Solicitud.id)
    ).filter(Solicitud.nombre_solicitante.isnot(None)
    ).group_by(Solicitud.nombre_solicitante).all()
    solicitudes_dict = {n: c for n, c in counts}

    empresas = Empresa.query.order_by(Empresa.nombre).all()

    return render_template('admin.html', usuarios=usuarios, admin_users=admin_users,
                           current_admin=session.get('admin_user', {}),
                           total_solicitudes=total_solicitudes,
                           total_usuarios=total_usuarios,
                           total_skus=total_skus,
                           solicitudes_mes=solicitudes_mes,
                           solicitudes_dict=solicitudes_dict,
                           empresas=empresas)


@bp.route('/admin/desvincular/<int:id>', methods=['POST'])
def admin_desvincular(id):
    identidad = Identidad.query.get_or_404(id)
    identidad.device_token_hash = None
    db.session.commit()
    return jsonify({'success': True, 'nombre': identidad.nombre})


@bp.route('/admin/eliminar/<int:id>', methods=['POST'])
def admin_eliminar(id):
    identidad = Identidad.query.get_or_404(id)
    nombre = identidad.nombre
    db.session.delete(identidad)
    db.session.commit()
    return jsonify({'success': True, 'nombre': nombre})


@bp.route('/admin/eliminar-multiples', methods=['POST'])
def admin_eliminar_multiples():
    data = request.get_json(silent=True) or {}
    ids = data.get('ids', [])
    if not ids or not isinstance(ids, list):
        return jsonify({'success': False, 'message': 'No se recibieron IDs válidos'}), 400

    count = 0
    for id in ids:
        identidad = db.session.get(Identidad, int(id))
        if identidad:
            db.session.delete(identidad)
            count += 1
    db.session.commit()
    return jsonify({'success': True, 'count': count})


@bp.route('/admin/definir-pin/<int:id>', methods=['POST'])
def admin_definir_pin(id):
    data = request.get_json(silent=True) or {}
    pin = (data.get('pin_code') or '').strip()
    if not pin or not pin.isdigit() or len(pin) != 4:
        return jsonify({'success': False, 'message': 'El PIN debe tener exactamente 4 dígitos'}), 400
    identidad = Identidad.query.get_or_404(id)
    identidad.pin_hash = hashlib.sha256(pin.encode()).hexdigest()
    db.session.commit()
    return jsonify({'success': True, 'nombre': identidad.nombre, 'tiene_pin': True})


@bp.route('/admin/crear-admin', methods=['POST'])
def admin_crear_admin():
    current = session.get('admin_user', {})
    if current.get('rol') != 'superadmin':
        return jsonify({'success': False, 'message': 'Solo superadmin puede crear administradores'}), 403

    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()
    rol = (data.get('rol') or 'admin').strip()

    if not username or len(username) < 3:
        return jsonify({'success': False, 'message': 'Usuario debe tener al menos 3 caracteres'}), 400
    if not password or len(password) < 6:
        return jsonify({'success': False, 'message': 'Contraseña debe tener al menos 6 caracteres'}), 400
    if rol not in ('admin', 'viewer'):
        return jsonify({'success': False, 'message': 'Rol inválido'}), 400

    existente = AdminUser.query.filter_by(username=username).first()
    if existente:
        return jsonify({'success': False, 'message': 'El usuario ya existe'}), 409

    admin = AdminUser(
        username=username,
        password_hash=generate_password_hash(password),
        rol=rol
    )
    db.session.add(admin)
    db.session.commit()
    return jsonify({'success': True, 'username': username, 'rol': rol}), 201


@bp.route('/admin/eliminar-admin/<int:id>', methods=['POST'])
def admin_eliminar_admin(id):
    current = session.get('admin_user', {})
    if current.get('rol') != 'superadmin':
        return jsonify({'success': False, 'message': 'Solo superadmin puede eliminar administradores'}), 403
    admin = AdminUser.query.get_or_404(id)
    if admin.username == 'admin':
        return jsonify({'success': False, 'message': 'No se puede eliminar el administrador principal'}), 400
    db.session.delete(admin)
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/admin/solicitudes')
def admin_solicitudes():
    q = (request.args.get('q', '') or '').strip()
    solicitante = (request.args.get('solicitante', '') or '').strip()
    empresa = (request.args.get('empresa', '') or '').strip()
    desde = (request.args.get('desde', '') or '').strip()
    hasta = (request.args.get('hasta', '') or '').strip()
    page = request.args.get('page', 1, type=int)
    sort_by = (request.args.get('sort_by', 'fecha') or '').strip()
    sort_order = (request.args.get('sort_order', 'desc') or '').strip()

    base = Solicitud.query

    if q:
        base = base.filter(
            (Solicitud.numero_solicitud.ilike(f'%{q}%')) |
            (Solicitud.empresa.ilike(f'%{q}%')) |
            (Solicitud.area.ilike(f'%{q}%')) |
            (Solicitud.nombre_solicitante.ilike(f'%{q}%'))
        )
    if solicitante:
        base = base.filter(Solicitud.nombre_solicitante == solicitante)
    if empresa:
        base = base.filter(Solicitud.empresa == empresa)
    if desde:
        try:
            desde_fecha = datetime.strptime(desde, '%Y-%m-%d')
            base = base.filter(Solicitud.fecha >= desde_fecha)
        except ValueError:
            pass
    if hasta:
        try:
            hasta_fecha = datetime.strptime(hasta, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
            base = base.filter(Solicitud.fecha <= hasta_fecha)
        except ValueError:
            pass

    base = aplicar_orden(base, Solicitud, sort_by, sort_order)
    solicitudes = base.paginate(page=page, per_page=20, error_out=False)

    usuarios = Identidad.query.order_by(Identidad.nombre).all()
    empresas_list = [r[0] for r in db.session.query(Solicitud.empresa).distinct().order_by(Solicitud.empresa).all() if r[0]]

    solicitante_stats = None
    if solicitante:
        qs = Solicitud.query.filter(Solicitud.nombre_solicitante == solicitante)
        total_items = db.session.query(func.sum(ItemSolicitud.cantidad)) \
            .join(Solicitud) \
            .filter(Solicitud.nombre_solicitante == solicitante) \
            .scalar() or 0
        primera = qs.order_by(Solicitud.fecha.asc()).first()
        ultima = qs.order_by(Solicitud.fecha.desc()).first()
        solicitante_stats = {
            'nombre': solicitante,
            'total': qs.count(),
            'total_items': total_items,
            'primera': primera,
            'ultima': ultima,
        }

    return render_template('admin_solicitudes.html',
                           solicitudes=solicitudes, q=q,
                           solicitante=solicitante, empresa=empresa,
                           desde=desde, hasta=hasta,
                           usuarios=usuarios, empresas=empresas_list,
                           sort_by=sort_by, sort_order=sort_order,
                           solicitante_stats=solicitante_stats)


@bp.route('/admin/solicitudes/exportar')
def admin_solicitudes_exportar():
    q = (request.args.get('q', '') or '').strip()
    solicitante = (request.args.get('solicitante', '') or '').strip()
    empresa = (request.args.get('empresa', '') or '').strip()
    desde = (request.args.get('desde', '') or '').strip()
    hasta = (request.args.get('hasta', '') or '').strip()

    base = Solicitud.query

    if q:
        base = base.filter(
            (Solicitud.numero_solicitud.ilike(f'%{q}%')) |
            (Solicitud.empresa.ilike(f'%{q}%')) |
            (Solicitud.area.ilike(f'%{q}%')) |
            (Solicitud.nombre_solicitante.ilike(f'%{q}%'))
        )
    if solicitante:
        base = base.filter(Solicitud.nombre_solicitante == solicitante)
    if empresa:
        base = base.filter(Solicitud.empresa == empresa)
    if desde:
        try:
            base = base.filter(Solicitud.fecha >= datetime.strptime(desde, '%Y-%m-%d'))
        except ValueError:
            pass
    if hasta:
        try:
            base = base.filter(Solicitud.fecha <= datetime.strptime(hasta, '%Y-%m-%d').replace(hour=23, minute=59, second=59))
        except ValueError:
            pass

    solicitudes = base.order_by(Solicitud.fecha.desc()).all()

    import csv
    import io
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['N° Solicitud', 'Fecha', 'Solicitante', 'Empresa', 'Area', 'Items'])
    for s in solicitudes:
        writer.writerow([
            s.numero_solicitud,
            s.fecha.strftime('%d/%m/%Y') if s.fecha else '',
            s.nombre_solicitante or '',
            s.empresa or '',
            s.area or '',
            len(s.items)
        ])

    from flask import make_response
    response = make_response(output.getvalue())
    response.headers['Content-Type'] = 'text/csv; charset=utf-8'
    response.headers['Content-Disposition'] = 'attachment; filename=solicitudes.csv'
    return response


@bp.route('/admin/dashboard')
def admin_dashboard_global():
    solicitudes_por_mes = (
        db.session.query(
            func.extract('year', Solicitud.fecha).label('year'),
            func.extract('month', Solicitud.fecha).label('month'),
            func.count().label('count')
        )
        .group_by(text('year'), text('month'))
        .order_by(text('year'), text('month'))
        .all()
    )

    solicitudes_por_empresa = (
        db.session.query(Solicitud.empresa, func.count().label('count'))
        .group_by(Solicitud.empresa)
        .order_by(func.count().desc())
        .all()
    )

    top_skus = (
        db.session.query(
            SKU.codigo_sku, SKU.descripcion,
            func.sum(ItemSolicitud.cantidad).label('total')
        )
        .join(ItemSolicitud, ItemSolicitud.sku_id == SKU.id)
        .join(Solicitud, ItemSolicitud.solicitud_id == Solicitud.id)
        .group_by(SKU.id)
        .order_by(func.sum(ItemSolicitud.cantidad).desc())
        .limit(10)
        .all()
    )

    total_solicitudes = Solicitud.query.count()

    mes_labels = []
    mes_values = []
    for row in solicitudes_por_mes:
        mes_labels.append(f"{int(row.year)}-{int(row.month):02d}")
        mes_values.append(row.count)

    return render_template('dashboard.html',
                           total_solicitudes=total_solicitudes,
                           mes_labels=mes_labels,
                           mes_values=mes_values,
                           solicitudes_por_empresa=solicitudes_por_empresa,
                           top_skus=top_skus,
                           admin_mode=True)


@bp.route('/admin/solicitud/<int:id>/editar')
def admin_solicitud_editar(id):
    solicitud = db.session.get(Solicitud, id)
    if not solicitud:
        flash('Solicitud no encontrada', 'error')
        return redirect(url_for('main.admin_solicitudes'))
    session['identidad'] = solicitud.nombre_solicitante
    return redirect(url_for('main.index', editar=id))



@bp.route('/admin/solicitud/<int:id>/nota', methods=['POST'])
def admin_solicitud_nota(id):
    data = request.get_json(silent=True) or {}
    nota = (data.get('nota', '') or '').strip()
    solicitud = Solicitud.query.get_or_404(id)
    solicitud.nota_admin = nota or None
    admin = session.get('admin_user', {})
    db.session.add(AuditoriaSolicitud(
        solicitud_id=id,
        accion='nota',
        descripcion=f"Nota admin actualizada: {nota[:100]}" if nota else "Nota admin eliminada",
        admin_user_id=admin.get('id'),
        admin_nombre=admin.get('username')
    ))
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/admin/cambiar-clave', methods=['POST'])
def admin_cambiar_clave():
    current = session.get('admin_user', {})
    admin_id = current.get('id')
    if not admin_id:
        return jsonify({'success': False, 'message': 'No autenticado'}), 401
    data = request.get_json(silent=True) or {}
    current_pw = (data.get('current_password') or '').strip()
    new_pw = (data.get('new_password') or '').strip()
    admin = AdminUser.query.get_or_404(admin_id)
    if not admin.check_password(current_pw):
        return jsonify({'success': False, 'message': 'Contraseña actual incorrecta'}), 400
    if len(new_pw) < 6:
        return jsonify({'success': False, 'message': 'Nueva contraseña debe tener al menos 6 caracteres'}), 400
    if current_pw == new_pw:
        return jsonify({'success': False, 'message': 'La nueva contraseña debe ser diferente a la actual'}), 400
    admin.password_hash = generate_password_hash(new_pw)
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/admin/empresa/crear', methods=['POST'])
def admin_empresa_crear():
    data = request.get_json(silent=True) or {}
    nombre = (data.get('nombre') or '').strip().upper()
    if not nombre:
        return jsonify({'success': False, 'message': 'El nombre es requerido'}), 400
    existente = Empresa.query.filter_by(nombre=nombre).first()
    if existente:
        return jsonify({'success': False, 'message': 'La empresa ya existe'}), 409
    empresa = Empresa(nombre=nombre, activa=True)
    db.session.add(empresa)
    db.session.commit()
    return jsonify({'success': True, 'id': empresa.id, 'nombre': empresa.nombre}), 201


@bp.route('/admin/empresa/<int:id>/toggle', methods=['POST'])
def admin_empresa_toggle(id):
    empresa = Empresa.query.get_or_404(id)
    empresa.activa = not empresa.activa
    db.session.commit()
    return jsonify({'success': True, 'activa': empresa.activa})


@bp.route('/admin/empresa/<int:id>/eliminar', methods=['POST'])
def admin_empresa_eliminar(id):
    empresa = Empresa.query.get_or_404(id)
    tiene = Solicitud.query.filter_by(empresa=empresa.nombre).first()
    if tiene:
        return jsonify({'success': False, 'message': 'No se puede eliminar: hay solicitudes con esta empresa'}), 400
    db.session.delete(empresa)
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/admin/empresa/<int:id>/logo', methods=['POST'])
def admin_empresa_logo(id):
    empresa = db.session.get(Empresa, id)
    if not empresa:
        return jsonify({'success': False, 'message': 'Empresa no encontrada'}), 404
    if 'logo' not in request.files:
        return jsonify({'success': False, 'message': 'No se envió archivo'}), 400
    file = request.files['logo']
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No se seleccionó archivo'}), 400
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.png', '.jpg', '.jpeg'):
        return jsonify({'success': False, 'message': 'Solo PNG y JPG son permitidos'}), 400
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > 2 * 1024 * 1024:
        return jsonify({'success': False, 'message': 'El archivo excede 2MB'}), 400
    safe_name = f"{empresa.nombre}{ext}"
    logo_dir = os.path.join(current_app.root_path, 'static', 'logos')
    os.makedirs(logo_dir, exist_ok=True)
    file.save(os.path.join(logo_dir, safe_name))
    return jsonify({'success': True, 'message': 'Logo subido correctamente'})


@bp.route('/admin/logout')
def admin_logout():
    session.pop('admin_user', None)
    return redirect(url_for('main.index'))
