# Usa una imagen oficial de Python ligera
FROM python:3.10-slim

# Instala MiniZinc
RUN apt-get update && apt-get install -y wget unzip && \
    wget https://github.com/MiniZinc/MiniZincIDE/releases/download/2.7.5/MiniZincIDE-2.7.5-bundled-linux-x86_64.tgz && \
    tar -xvzf MiniZincIDE-2.7.5-bundled-linux-x86_64.tgz && \
    mv MiniZincIDE-2.7.5-bundled-linux-x86_64 /opt/minizinc && \
    ln -s /opt/minizinc/bin/minizinc /usr/bin/minizinc

# Establece el directorio de trabajo
WORKDIR /app

# Copia todos los archivos del proyecto al contenedor
COPY . .

# Instala dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt

# Expone el puerto que usará Gunicorn
EXPOSE 8080

# Comando para ejecutar la app con Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "app:app"]
