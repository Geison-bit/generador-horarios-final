# Usa una imagen oficial de Python como base
FROM python:3.10-slim

WORKDIR /app

# (Opcional pero recomendado) actualiza pip
RUN pip install --upgrade pip

# Copia requirements primero para aprovechar cache
COPY requirements.txt /app/requirements.txt

# Instala deps y VERIFICA ortools en build (esto nos dirá la verdad)
RUN pip install --no-cache-dir -r requirements.txt -v \
    && python -c "from ortools.sat.python import cp_model; print('ORTOOLS OK')"

# Copia el resto del proyecto
COPY . /app

# No es obligatorio EXPOSE, pero déjalo si quieres
EXPOSE 8080

# Usa el puerto dinámico de Railway (PORT)
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-8080} app:app"]