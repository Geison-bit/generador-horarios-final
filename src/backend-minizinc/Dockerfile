# Usa una imagen oficial de Python
FROM python:3.10-slim

# Instala dependencias necesarias y MiniZinc
RUN apt-get update && apt-get install -y wget unzip curl && \
    curl -LO https://github.com/MiniZinc/MiniZincIDE/releases/download/2.7.6/MiniZincIDE-2.7.6-bundled-linux-x86_64.tgz && \
    tar -xvzf MiniZincIDE-2.7.6-bundled-linux-x86_64.tgz && \
    mv MiniZincIDE-2.7.6-bundled-linux-x86_64 /opt/minizinc && \
    ln -s /opt/minizinc/bin/minizinc /usr/bin/minizinc

# Define el directorio de trabajo
WORKDIR /app

# Copia los archivos al contenedor
COPY . .

# Instala dependencias Python
RUN pip install --no-cache-dir -r requirements.txt

# Expone el puerto
EXPOSE 8080

# Comando de inicio
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "app:app"]
