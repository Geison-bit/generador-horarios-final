from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import os
from dotenv import load_dotenv
from pathlib import Path
from supabase import create_client
from generador_python import generar_horario
import traceback
import json
import threading
import time
import uuid
from queue import Queue, Empty

app = Flask(__name__)

# CORS dinámico para dev y prod
CORS(app, supports_credentials=True, resources={
    r"/*": {
        "origins": ["https://gestion-de-horarios.vercel.app", "http://localhost:5173"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

@app.after_request
def after_request(response):
    origin = request.headers.get("Origin")
    if origin in ["http://localhost:5173", "https://gestion-de-horarios.vercel.app"]:
        response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return response

# Preflight explícito
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
    raise Exception("❌ SUPABASE_URL o SUPABASE_KEY no están definidos.")
supabase = create_client(supabase_url, supabase_key)

# Constantes
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes"]
NUM_BLOQUES = 8  # asegúrate que 'franjas_horarias' tenga bloques 0..7 por nivel

# Jobs en memoria para progreso SSE
_jobs = {}
_jobs_lock = threading.Lock()

def _push_event(job_id, event, payload):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job["queue"].put((event, payload))

def _cleanup_job(job_id, delay=300):
    def _drop():
        time.sleep(delay)
        with _jobs_lock:
            _jobs.pop(job_id, None)
    t = threading.Thread(target=_drop, daemon=True)
    t.start()

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "Backend activo"}), 200

def obtener_nuevo_numero_horario(nivel: str) -> int:
    """
    Devuelve un número incremental de versión.
    OJO: por el UNIQUE (grado_id, dia, bloque) no se guardan múltiples versiones en paralelo.
    """
    resp = supabase.table("horarios").select("horario").eq("nivel", nivel).execute()
    versiones = sorted({item["horario"] for item in (resp.data or []) if item.get("horario") is not None})
    return (max(versiones) + 1) if versiones else 1

@app.route("/generar-horario-general", methods=["POST"])
def generar_horario_general():
    try:
        # Lee body (si no viene JSON válido, esto levanta)
        data = request.get_json(force=True, silent=False)

        docentes = data.get("docentes", [])
        asignaciones = data.get("asignaciones", {})
        restricciones = data.get("restricciones", {})
        horas_curso_grado = data.get("horas_curso_grado", {})
        nivel = data.get("nivel", "Secundaria")
        overwrite = bool(data.get("overwrite", True))  # por defecto sobrescribe todo el nivel

        if not docentes or not asignaciones or not horas_curso_grado:
            raise ValueError("Faltan datos requeridos para generar el horario.")

        print(f"🔧 Generando horario para nivel: {nivel}")
        resultado = generar_horario(
            docentes,
            asignaciones,
            restricciones,
            horas_curso_grado,
            nivel=nivel
        )

        horario_dict = resultado.get("horario", {})  # {dia_idx: {bloque_idx: {grado_id: curso_id}}}
        total_asignados = resultado.get("total_bloques_asignados", 0)
        nueva_version = obtener_nuevo_numero_horario(nivel)

        # Prepara registros para tabla 'horarios'
        registros = []
        for dia_key, bloques in (horario_dict or {}).items():
            try:
                dia_idx = int(dia_key)
            except Exception:
                continue
            if not (0 <= dia_idx < len(DIAS)):
                continue
            dia_nombre = DIAS[dia_idx]

            for blq_key, grados in (bloques or {}).items():
                try:
                    bloque_idx = int(blq_key)
                except Exception:
                    continue
                if not (0 <= bloque_idx < NUM_BLOQUES):
                    continue

                for grado_key, curso_id in (grados or {}).items():
                    # 0 significa vacío
                    if not isinstance(curso_id, int) or curso_id <= 0:
                        continue
                    try:
                        grado_id = int(grado_key)
                    except Exception:
                        continue

                    # asignaciones usa claves string
                    docente_id = (
                        asignaciones
                        .get(str(curso_id), {})
                        .get(str(grado_id), {})
                        .get("docente_id")
                    )
                    if docente_id:
                        registros.append({
                            "docente_id": int(docente_id),
                            "curso_id": int(curso_id),
                            "grado_id": int(grado_id),
                            "dia": dia_nombre,           # 'lunes'..'viernes'
                            "bloque": int(bloque_idx),   # 0..7
                            "nivel": nivel,
                            "horario": int(nueva_version)
                        })

        # Persistencia robusta evitando duplicados
        if registros:
            # Si quieres intentar UPSERT primero (cuando tu UNIQUE sea (grado_id, dia, bloque)):
            CONFLICT_COLS = ["grado_id", "dia", "bloque"]  # ⚠️ Si tu UNIQUE incluye nivel, agrega "nivel" aquí.

            if overwrite:
                # Estrategia clara y consistente: borra e inserta todo el nivel
                supabase.table("horarios").delete().eq("nivel", nivel).execute()
                supabase.table("horarios").insert(registros).execute()
                print(f"✅ Horario sobrescrito para {nivel}. Filas: {len(registros)}")
            else:
                # Intenta UPSERT; si tu índice no coincide (42P10) o hay 23505 por otro UNIQUE, cae a delete+insert
                try:
                    supabase.table("horarios").upsert(registros, on_conflict=CONFLICT_COLS).execute()
                    print(f"✅ Horario cargado por UPSERT. Filas: {len(registros)}")
                except Exception as e:
                    msg = str(e)
                    if "42P10" in msg or "23505" in msg:
                        print("ℹ️ Fallback a delete+insert por conflicto de índice único.")
                        supabase.table("horarios").delete().eq("nivel", nivel).execute()
                        supabase.table("horarios").insert(registros).execute()
                    else:
                        raise
        else:
            print("⚠ No se generaron registros (todo vacío).")

        # Devuelve matriz para el front (5 días × NUM_BLOQUES × (5 ó 6 grados))
        grados_ids = list(range(6, 12)) if nivel == "Primaria" else list(range(1, 6))
        horario_lista = [
            [
                [
                    (horario_dict.get(d, {}).get(b, {}).get(g, 0))
                    for g in grados_ids
                ]
                for b in range(NUM_BLOQUES)
            ]
            for d in range(5)
        ]

        return jsonify({
            "horario": horario_lista,
            "asignaciones_exitosas": resultado.get("asignaciones_exitosas", 0),
            "asignaciones_fallidas": resultado.get("asignaciones_fallidas", 0),
            "total_bloques_asignados": total_asignados,
            "version": nueva_version
        }), 200

    except Exception as e:
        print("[ERROR] Excepción general:", repr(e))
        traceback.print_exc()
        return jsonify({
            "error": str(e),
            "trace": traceback.format_exc()
        }), 500

@app.route("/generar-horario-general-job", methods=["POST"])
def generar_horario_job():
    try:
        data = request.get_json(force=True, silent=False)

        docentes = data.get("docentes", [])
        asignaciones = data.get("asignaciones", {})
        restricciones = data.get("restricciones", {})
        horas_curso_grado = data.get("horas_curso_grado", {})
        nivel = data.get("nivel", "Secundaria")
        overwrite = bool(data.get("overwrite", True))

        if not docentes or not asignaciones or not horas_curso_grado:
            return jsonify({"error": "Faltan datos requeridos para generar el horario."}), 400

        job_id = str(uuid.uuid4())
        q = Queue()
        with _jobs_lock:
            _jobs[job_id] = {"queue": q, "status": "running", "result": None, "error": None}

        def _progress_cb(pct, stage=""):
            _push_event(job_id, "progress", {"progress": int(pct), "stage": stage})

        def _run():
            try:
                _progress_cb(2, "preparando")
                resultado = generar_horario(
                    docentes,
                    asignaciones,
                    restricciones,
                    horas_curso_grado,
                    nivel=nivel,
                    progress_callback=_progress_cb
                )
                horario_dict = resultado.get("horario", {})
                total_asignados = resultado.get("total_bloques_asignados", 0)
                nueva_version = obtener_nuevo_numero_horario(nivel)

                registros = []
                for dia_key, bloques in (horario_dict or {}).items():
                    try:
                        dia_idx = int(dia_key)
                    except Exception:
                        continue
                    if not (0 <= dia_idx < len(DIAS)):
                        continue
                    dia_nombre = DIAS[dia_idx]

                    for blq_key, grados in (bloques or {}).items():
                        try:
                            bloque_idx = int(blq_key)
                        except Exception:
                            continue
                        if not (0 <= bloque_idx < NUM_BLOQUES):
                            continue

                        for grado_key, curso_id in (grados or {}).items():
                            if not isinstance(curso_id, int) or curso_id <= 0:
                                continue
                            try:
                                grado_id = int(grado_key)
                            except Exception:
                                continue

                            docente_id = (
                                asignaciones
                                .get(str(curso_id), {})
                                .get(str(grado_id), {})
                                .get("docente_id")
                            )
                            if docente_id:
                                registros.append({
                                    "docente_id": int(docente_id),
                                    "curso_id": int(curso_id),
                                    "grado_id": int(grado_id),
                                    "dia": dia_nombre,
                                    "bloque": int(bloque_idx),
                                    "nivel": nivel,
                                    "horario": int(nueva_version)
                                })

                if registros:
                    CONFLICT_COLS = ["grado_id", "dia", "bloque"]
                    if overwrite:
                        supabase.table("horarios").delete().eq("nivel", nivel).execute()
                        supabase.table("horarios").insert(registros).execute()
                    else:
                        try:
                            supabase.table("horarios").upsert(registros, on_conflict=CONFLICT_COLS).execute()
                        except Exception as e:
                            msg = str(e)
                            if "42P10" in msg or "23505" in msg:
                                supabase.table("horarios").delete().eq("nivel", nivel).execute()
                                supabase.table("horarios").insert(registros).execute()
                            else:
                                raise

                grados_ids = list(range(6, 12)) if nivel == "Primaria" else list(range(1, 6))
                horario_lista = [
                    [
                        [
                            (horario_dict.get(d, {}).get(b, {}).get(g, 0))
                            for g in grados_ids
                        ]
                        for b in range(NUM_BLOQUES)
                    ]
                    for d in range(5)
                ]

                payload = {
                    "horario": horario_lista,
                    "asignaciones_exitosas": resultado.get("asignaciones_exitosas", 0),
                    "asignaciones_fallidas": resultado.get("asignaciones_fallidas", 0),
                    "total_bloques_asignados": total_asignados,
                    "version": nueva_version
                }
                with _jobs_lock:
                    _jobs[job_id]["status"] = "done"
                    _jobs[job_id]["result"] = payload
                _push_event(job_id, "done", {"result": payload})
            except Exception as e:
                with _jobs_lock:
                    _jobs[job_id]["status"] = "error"
                    _jobs[job_id]["error"] = str(e)
                _push_event(job_id, "error", {"error": str(e)})
            finally:
                _cleanup_job(job_id, delay=300)

        t = threading.Thread(target=_run, daemon=True)
        t.start()

        return jsonify({"job_id": job_id}), 202
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/generar-horario-general-job/<job_id>/events", methods=["GET"])
def generar_horario_job_events(job_id):
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job no encontrado"}), 404

    def stream():
        while True:
            try:
                event, payload = job["queue"].get(timeout=20)
            except Empty:
                yield ": ping\n\n"
                continue
            yield f"event: {event}\n"
            yield f"data: {json.dumps(payload)}\n\n"
            if event in ("done", "error"):
                break

    resp = Response(stream_with_context(stream()), mimetype="text/event-stream")
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["X-Accel-Buffering"] = "no"
    return resp

# Run local / Railway
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
