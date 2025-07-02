from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
from pathlib import Path
from supabase import create_client
from generador_python import generar_horario

app = Flask(__name__)

# CORS dinámico para desarrollo y producción
CORS(app, supports_credentials=True, resources={r"/*": {
    "origins": [
        "https://gestion-de-horarios.vercel.app",
        "http://localhost:5173"
    ],
    "methods": ["GET", "POST", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization"]
}})

@app.after_request
def after_request(response):
    origin = request.headers.get("Origin")
    if origin in ["http://localhost:5173", "https://gestion-de-horarios.vercel.app"]:
        response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return response

# 🔁 Ruta explícita para OPTIONS (necesario para preflight en CORS)
@app.route("/generar-horario-general", methods=["OPTIONS"])
def preflight_horario():
    response = jsonify({"message": "CORS preflight OK"})
    origin = request.headers.get("Origin")
    if origin in ["http://localhost:5173", "https://gestion-de-horarios.vercel.app"]:
        response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return response, 200

# .env
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

# Supabase
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
if not supabase_url or not supabase_key:
    raise Exception("❌ Las variables SUPABASE_URL o SUPABASE_KEY no están definidas.")
supabase = create_client(supabase_url, supabase_key)

# Constantes
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes"]
NUM_BLOQUES = 8

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "Backend activo"}), 200

def obtener_nuevo_numero_horario(nivel):
    response = supabase.table("horarios").select("horario").eq("nivel", nivel).execute()
    versiones = sorted({item["horario"] for item in response.data if item.get("horario") is not None})
    if len(versiones) >= 3:
        versiones_a_eliminar = versiones[:-2]
        for version in versiones_a_eliminar:
            supabase.table("horarios").delete().eq("nivel", nivel).eq("horario", version).execute()
        versiones = versiones[-2:]
    return max(versiones, default=0) + 1

@app.route("/generar-horario-general", methods=["POST"])
def generar_horario_general():
    try:
        data = request.get_json()
        docentes = data.get("docentes", [])
        asignaciones = data.get("asignaciones", {})
        restricciones = data.get("restricciones", {})
        horas_curso_grado = data.get("horas_curso_grado", {})
        nivel = data.get("nivel", "Secundaria")

        if not docentes or not asignaciones or not horas_curso_grado:
            raise ValueError("Faltan datos requeridos para generar el horario.")

        print(f"🔧 Generando horario para nivel: {nivel}")
        resultado_python = generar_horario(docentes, asignaciones, restricciones, horas_curso_grado, nivel=nivel)
        horario = resultado_python.get("horario", {})
        total_asignados = resultado_python.get("total_bloques_asignados", 0)

        nuevo_numero = obtener_nuevo_numero_horario(nivel)

        registros = []
        for dia_idx, bloques in horario.items():
            dia_nombre = DIAS[int(dia_idx)]
            for bloque_idx, grados in bloques.items():
                for grado_idx, curso_id in grados.items():
                    if isinstance(curso_id, int) and curso_id > 0:
                        grado_id = int(grado_idx)
                        docente_id = asignaciones.get(str(curso_id), {}).get(str(grado_id), {}).get("docente_id")
                        if docente_id:
                            registros.append({
                                "docente_id": docente_id,
                                "curso_id": curso_id,
                                "grado_id": grado_id,
                                "dia": dia_nombre,
                                "bloque": int(bloque_idx),
                                "nivel": nivel,
                                "horario": nuevo_numero
                            })

        if registros:
            supabase.table("horarios").insert(registros).execute()
            print(f"✅ Horario #{nuevo_numero} insertado correctamente.")
        else:
            print("⚠ No se generaron registros para insertar.")

        grados_ids = list(range(6, 12)) if nivel == "Primaria" else list(range(1, 6))
        horario_lista = [
            [
                [
                    horario.get(dia, {}).get(bloque, {}).get(grado, 0)
                    for grado in grados_ids
                ]
                for bloque in range(NUM_BLOQUES)
            ]
            for dia in range(5)
        ]

        return jsonify({
            "horario": horario_lista,
            "asignaciones_exitosas": resultado_python.get("asignaciones_exitosas", 0),
            "asignaciones_fallidas": resultado_python.get("asignaciones_fallidas", 0),
            "total_bloques_asignados": total_asignados
        }), 200

    except Exception as e:
        print("❌ Excepción general:", str(e))
        return jsonify({"error": str(e)}), 500

# Localhost
if __name__ == "__main__":
    app.run(debug=True)
