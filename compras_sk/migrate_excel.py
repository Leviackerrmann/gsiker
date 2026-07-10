import pandas as pd
from app import create_app, db
from app.models import SKU, Usuario
from werkzeug.security import generate_password_hash

app = create_app()

def migrar_skus_desde_excel(archivo_excel):
    """
    Migra los SKUs desde tu Excel personalizado
    
    Columnas del Excel:
    - A: CATEGORIA (GRUPO)
    - B: SUBCATEGORIA (SUBGRUPO)
    - C: DESCRIPCION
    - D: SKU
    """
    
    with app.app_context():
        print("Iniciando migración...")
        
        # Crear usuario admin si no existe
        admin = Usuario.query.filter_by(email='admin@empresa.com').first()
        if not admin:
            print("Creando usuario administrador...")
            admin = Usuario(
                nombre='Administrador',
                email='admin@empresa.com',
                password=generate_password_hash('admin123')
            )
            db.session.add(admin)
            db.session.commit()
            print(f"✓ Usuario admin creado - Email: admin@empresa.com, Password: admin123")
        
        # Leer Excel
        print(f"\nLeyendo archivo: {archivo_excel}")
        try:
            df = pd.read_excel(archivo_excel)
            print(f"✓ Archivo leído - {len(df)} filas encontradas")
        except Exception as e:
            print(f"✗ Error al leer archivo: {e}")
            return
        
        print(f"\nColumnas encontradas: {', '.join(df.columns)}")
        
        # Verificar columnas requeridas (ajustadas a tu Excel real)
        required_cols = ['CATEGORIA', 'SUBCATEGORIA', 'DESCRIPCION', 'SKU']
        missing = [col for col in required_cols if col not in df.columns]
        if missing:
            print(f"\n✗ ERROR: Faltan columnas: {', '.join(missing)}")
            return
        
        # Migrar SKUs
        creados = 0
        existentes = 0
        errores = 0
        
        for index, row in df.iterrows():
            try:
                # Saltar filas sin SKU
                if pd.isna(row['SKU']) or str(row['SKU']).strip() == '':
                    continue
                
                codigo_sku = str(row['SKU']).strip()
                
                # Verificar si ya existe
                sku_existente = SKU.query.filter_by(codigo_sku=codigo_sku).first()
                
                if sku_existente:
                    existentes += 1
                    continue
                
                # Obtener valores
                categoria = str(row['CATEGORIA']).strip() if pd.notna(row['CATEGORIA']) else 'General'
                subcategoria = str(row['SUBCATEGORIA']).strip() if pd.notna(row['SUBCATEGORIA']) else ''
                descripcion = str(row['DESCRIPCION']).strip() if pd.notna(row['DESCRIPCION']) else ''
                
                # Crear nuevo SKU
                nuevo_sku = SKU(
                    codigo_sku=codigo_sku,
                    descripcion=descripcion,
                    subcategoria=subcategoria,
                    unidad_medida='Unidad',
                    precio_referencia=0,
                    categoria=categoria,
                    creado_por=admin.id
                )
                
                db.session.add(nuevo_sku)
                creados += 1
                
                if creados % 50 == 0:
                    print(f"Procesados: {creados}...")
                
            except Exception as e:
                errores += 1
                print(f"✗ Error en fila {index + 2}: {e}")
        
        # Guardar cambios
        try:
            db.session.commit()
            print(f"\n{'='*60}")
            print(f"RESUMEN DE MIGRACIÓN")
            print(f"{'='*60}")
            print(f"✓ SKUs creados:       {creados}")
            print(f"⊘ SKUs ya existentes: {existentes}")
            print(f"✗ Errores:            {errores}")
            print(f"{'='*60}")
            print(f"\n¡Migración completada exitosamente!")
        except Exception as e:
            db.session.rollback()
            print(f"\n✗ Error al guardar: {e}")

if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("Uso: python migrate_excel.py <archivo.xlsx>")
        print("\nEjemplo: python migrate_excel.py base_datos.xlsx")
        sys.exit(1)
    
    archivo = sys.argv[1]
    migrar_skus_desde_excel(archivo)
