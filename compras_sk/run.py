from app import create_app

app = create_app()

if __name__ == '__main__':
    # host='0.0.0.0' permite acceso desde otros equipos en la red
    app.run(debug=False, host='0.0.0.0', port=5080)
