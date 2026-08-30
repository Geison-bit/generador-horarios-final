# -*- coding: latin-1 -*-
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import os
from dotenv import load_dotenv
from pathlib import Path
from supabase import create_client
try:
    from .solver.generador_python import generar_horario
except ImportError:  # Permite ejecutar directamente: python app.py
    from solver.generador_python import generar_horario
import traceback
import json
import threading
import time
import uuid
from queue import Queue, Empty
import unicodedata
import urllib.error
import urllib.request

app = Flask(__name__)

# CORS dinámico para dev y prod
CORS(
    app,
    origins=["https://gestion-de-horarios.vercel.app", "http://localhost:5173"],
    supports_credentials=True,
)

@app.after_request
def after_request(response):
    origin = request.headers.get("Origin")
    if origin in ["http://localhost:5173", "https://gestion-de-horarios.vercel.app"]:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Allow-Headers"] = request.headers.get(
        "Access-Control-Request-Headers",
        "Content-Type,Authorization"
    )
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return response

# Preflight global
@app.route("/", defaults={"path": ""}, methods=["OPTIONS"])
@app.route("/<path:path>", methods=["OPTIONS"])
def options_any(path):
    resp = Response(status=204)
    origin = request.headers.get("Origin")

    allowed = ["https://gestion-de-horarios.vercel.app", "http://localhost:5173"]
    if origin in allowed:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Credentials"] = "true"

    # Devuelve EXACTAMENTE los headers que el browser pidió
    resp.headers["Access-Control-Allow-Headers"] = request.headers.get(
        "Access-Control-Request-Headers",
        "Content-Type,Authorization"
    )
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    resp.headers["Access-Control-Max-Age"] = "86400"
    return resp

# .env
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path, encoding="utf-8-sig", override=True)

# Supabase
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
if not supabase_url or not supabase_key:
    raise Exception("SUPABASE_URL y una clave de Supabase no estan definidos.")
supabase = create_client(supabase_url, supabase_key)

def cliente_supabase_para_request():
    """Usa service_role si existe; si no, propaga la sesión autenticada del frontend."""
    if os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
        return supabase
    authorization = str(request.headers.get("Authorization") or "")
    if not authorization.lower().startswith("bearer "):
        return supabase
    token = authorization.split(" ", 1)[1].strip()
    cliente = create_client(supabase_url, supabase_key)
    cliente.postgrest.auth(token)
    return cliente

# Constantes
DIAS = ["lunes", "martes", "mi\u00e9rcoles", "jueves", "viernes"]
NUM_BLOQUES = 8  # default; en runtime se ajusta por version

# Jobs en memoria para progreso SSE
_jobs = {}
_jobs_lock = threading.Lock()

REGLAS_IA_SCHEMA = {
    "type": "object",
    "properties": {
        "reglas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "texto_original": {"type": "string"},
                    "tipo": {
                        "type": "string",
                        "enum": [
                            "division_horas",
                            "limite_materia_dia",
                            "limite_docente_grado_dia",
                            "bloque_unico_docente_grado_dia",
                            "no_solape_docente",
                            "sesiones_consecutivas",
                            "excluir_carga_una_hora",
                            "evitar_huecos_docente",
                            "preferencia_franja_curso",
                            "no_soportada",
                        ],
                    },
                    "dureza": {"type": "string", "enum": ["hard", "soft"]},
                    "total_horas": {"type": "integer"},
                    "patron": {"type": "array", "items": {"type": "integer"}},
                    "patrones": {
                        "type": "array",
                        "items": {"type": "array", "items": {"type": "integer"}},
                    },
                    "maximo": {"type": "integer"},
                    "cursos": {"type": "array", "items": {"type": "string"}},
                    "excepto_cursos": {"type": "array", "items": {"type": "string"}},
                    "bloques_preferidos": {"type": "array", "items": {"type": "integer"}},
                    "formalizacion": {"type": "string"},
                    "ambiguedad": {"type": "string"},
                },
                "required": [
                    "texto_original", "tipo", "dureza", "total_horas", "patron", "patrones",
                    "maximo", "cursos", "excepto_cursos", "bloques_preferidos",
                    "formalizacion", "ambiguedad"
                ],
            },
        },
        "contradicciones": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["reglas", "contradicciones"],
}


def _tipo_regla_corregido(regla):
    """Corrige clasificaciones semánticas evidentes sin depender de Gemini."""
    contenido = " ".join(str(regla.get(campo) or "") for campo in (
        "texto_original", "formalizacion", "ambiguedad"
    ))
    texto = unicodedata.normalize("NFD", contenido).encode("ascii", "ignore").decode("ascii").lower()
    tipo = regla.get("tipo")

    if tipo in {"limite_materia_dia", "no_soportada"}:
        es_docente_grado = "docente" in texto and ("grado" in texto or "seccion" in texto)
        if es_docente_grado and ("maximo" in texto or "sum(bloques_docente_grado_dia)" in texto):
            return "limite_docente_grado_dia"

    if tipo == "no_soportada":
        if (
            regla.get("cursos")
            and regla.get("bloques_preferidos")
        ):
            return "preferencia_franja_curso"
        if "docente" in texto and "dos clases al mismo tiempo" in texto:
            return "no_solape_docente"
        if "sesion" in texto and "bloques consecutivos" in texto:
            return "sesiones_consecutivas"
        if ("mismo grado" in texto or "misma seccion" in texto) and any(frase in texto for frase in (
            "unico periodo continuo", "no podra regresar", "regresar a ensenar"
        )):
            return "bloque_unico_docente_grado_dia"
        if "carga semanal total" in texto and "una hora" in texto and any(
            palabra in texto for palabra in ("excluir", "no deberan incluirse", "no debe incluirse")
        ):
            return "excluir_carga_una_hora"
        if "docente" in texto and any(
            palabra in texto for palabra in ("hueco", "consecutiv", "compact")
        ):
            return "evitar_huecos_docente"
    return tipo


def _validar_reglas_extraidas(resultado):
    reglas = []
    contradicciones = list(resultado.get("contradicciones") or [])
    divisiones = {}
    limites = set()

    for raw in resultado.get("reglas") or []:
        regla = dict(raw or {})
        tipo = _tipo_regla_corregido(regla)
        regla["tipo"] = tipo
        regla["cursos"] = list(dict.fromkeys(
            str(nombre).strip() for nombre in (regla.get("cursos") or []) if str(nombre).strip()
        ))
        regla["excepto_cursos"] = list(dict.fromkeys(
            str(nombre).strip() for nombre in (regla.get("excepto_cursos") or []) if str(nombre).strip()
        ))
        regla["bloques_preferidos"] = list(dict.fromkeys(
            int(bloque) for bloque in (regla.get("bloques_preferidos") or [])
            if str(bloque).strip().isdigit() and 1 <= int(bloque) <= 12
        ))
        estado = "no_soportada"
        if tipo == "division_horas":
            total = int(regla.get("total_horas") or 0)
            raw_patrones = regla.get("patrones") or []
            if not raw_patrones and regla.get("patron"):
                raw_patrones = [regla.get("patron")]
            patrones = []
            for raw_patron in raw_patrones:
                # El orden semanal no es fijo: 3+2 y 2+3 representan el mismo patrón.
                patron = sorted(
                    [int(x) for x in (raw_patron or []) if int(x) > 0],
                    reverse=True,
                )
                if total > 0 and patron and sum(patron) == total and max(patron) <= 8:
                    if patron not in patrones:
                        patrones.append(patron)
            if total > 0 and patrones:
                estado = "ejecutable"
                regla["patrones"] = patrones
                regla["patron"] = patrones[0]
                clave_division = (
                    total,
                    tuple(sorted(nombre.lower() for nombre in regla["cursos"])),
                    tuple(sorted(nombre.lower() for nombre in regla["excepto_cursos"])),
                )
                if clave_division in divisiones:
                    existente = reglas[divisiones[clave_division]]
                    for patron in patrones:
                        if patron not in existente["patrones"]:
                            existente["patrones"].append(patron)
                    existente["patron"] = existente["patrones"][0]
                    existente["texto_original"] = (
                        existente.get("texto_original", "") + " " + regla.get("texto_original", "")
                    ).strip()
                    continue
                divisiones[clave_division] = len(reglas)
            else:
                estado = "requiere_revision"
                regla["ambiguedad"] = regla.get("ambiguedad") or (
                    "Cada patron debe sumar la carga total y contener sesiones validas."
                )
        elif tipo == "limite_materia_dia":
            maximo = int(regla.get("maximo") or 0)
            if 1 <= maximo <= 8:
                estado = "ejecutable"
                limites.add(maximo)
            else:
                estado = "requiere_revision"
                regla["ambiguedad"] = regla.get("ambiguedad") or "El maximo diario no es valido."
        elif tipo == "limite_docente_grado_dia":
            maximo = int(regla.get("maximo") or 0)
            if 1 <= maximo <= 8:
                estado = "ejecutable"
            else:
                estado = "requiere_revision"
                regla["ambiguedad"] = regla.get("ambiguedad") or (
                    "El maximo diario por docente y grado no es valido."
                )
        elif tipo in {
            "bloque_unico_docente_grado_dia",
            "no_solape_docente",
            "sesiones_consecutivas",
            "excluir_carga_una_hora",
            "evitar_huecos_docente",
        }:
            estado = "ejecutable"
            if tipo in {"no_solape_docente", "sesiones_consecutivas", "excluir_carga_una_hora"}:
                regla["dureza"] = "hard"
        elif tipo == "preferencia_franja_curso":
            if regla["cursos"] and regla["bloques_preferidos"]:
                estado = "ejecutable"
            else:
                estado = "requiere_revision"
                regla["ambiguedad"] = (
                    "Indica al menos un curso y los numeros de los bloques preferidos."
                )
        regla["estado"] = estado
        reglas.append(regla)

    if len(limites) > 1:
        contradicciones.append(
            "Se encontraron varios maximos diarios globales para una materia: "
            + ", ".join(map(str, sorted(limites))) + "."
        )
    if limites:
        limite_efectivo = min(limites)
        for regla in reglas:
            if regla.get("tipo") != "division_horas":
                continue
            patrones_validos = [p for p in regla.get("patrones", []) if max(p) <= limite_efectivo]
            if not patrones_validos:
                contradicciones.append(
                    f"Ninguna division de {regla.get('total_horas')} horas respeta el maximo diario "
                    f"de {limite_efectivo}."
                )
    return {"reglas": reglas, "contradicciones": list(dict.fromkeys(contradicciones))}


@app.route("/extraer-reglas", methods=["POST", "OPTIONS"])
def extraer_reglas():
    if request.method == "OPTIONS":
        return Response(status=204)
    data = request.get_json(force=True, silent=False) or {}
    texto = str(data.get("texto") or "").strip()
    if not texto:
        return jsonify({"error": "Escribe al menos una regla."}), 400
    if len(texto) > 20000:
        return jsonify({"error": "El texto supera el limite de 20 000 caracteres."}), 400

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return jsonify({
            "error": "Gemini no esta configurado. Define GEMINI_API_KEY solamente en el backend."
        }), 503

    model = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    prompt = (
        "Extrae reglas escolares para un modelo CP-SAT de horarios. "
        "Usa division_horas cuando una carga semanal se reparte en sesiones; total_horas es "
        "la carga, patron es la primera alternativa y patrones contiene todas las alternativas. "
        "Por ejemplo, '6 horas en 2+2+2 o 3+3' produce patron [2,2,2] y patrones "
        "[[2,2,2],[3,3]]. Si una division se aplica solo a cursos nombrados, coloca sus nombres "
        "en cursos. Si se aplica a todos salvo algunos cursos, coloca esos nombres en "
        "excepto_cursos. Para la regla condicional de tres horas, crea dos reglas separadas: "
        "una 2+1 con cursos [Ingles, Desarrollo Personal] y otra 3 con esos nombres en "
        "excepto_cursos; nunca mezcles ambos patrones como alternativas globales. "
        "Usa limite_materia_dia solo para un limite diario de una misma materia. "
        "Usa limite_docente_grado_dia para el maximo diario que un docente puede impartir a un "
        "mismo grado o seccion. Usa bloque_unico_docente_grado_dia cuando esas clases deban formar "
        "un solo periodo continuo y el docente no pueda regresar luego al mismo grado. "
        "Usa no_solape_docente si se prohiben clases simultaneas; sesiones_consecutivas si cada "
        "sesion de dos o tres horas debe ser continua; excluir_carga_una_hora para excluir cursos "
        "cuya carga semanal total es una hora; y evitar_huecos_docente para compactar la jornada. "
        "Usa preferencia_franja_curso cuando uno o varios cursos deban priorizarse "
        "en una franja del dia. Coloca los nombres exactos en cursos y los bloques preferidos, "
        "numerados desde 1, en bloques_preferidos; por ejemplo, 'Educacion Fisica en los tres "
        "primeros bloques' produce cursos [Educacion Fisica] y bloques_preferidos [1,2,3]. "
        "Clasifica dureza como hard cuando el texto diga que es obligatoria, estricta o que debe "
        "cumplirse; clasificala como soft cuando diga preferir, procurar, si es posible o que puede "
        "incumplirse. Respeta una indicacion explicita del usuario como 'regla dura' o 'regla suave'. "
        "No inventes nombres ni valores. Si hay ambiguedad, explicala. "
        "Identifica contradicciones.\n\n"
        f"Nivel: {data.get('nivel', 'Secundaria')}\nVersion: {data.get('version', 1)}\n"
        f"Texto del colegio:\n{texto}"
    )
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
            "responseJsonSchema": REGLAS_IA_SCHEMA,
        },
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            gemini = json.loads(response.read().decode("utf-8"))
        parts = gemini.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        raw_text = "".join(part.get("text", "") for part in parts)
        resultado = json.loads(raw_text)
        validado = _validar_reglas_extraidas(resultado)
        validado["modelo"] = model
        return jsonify(validado), 200
    except urllib.error.HTTPError as exc:
        detalle = exc.read().decode("utf-8", errors="replace")
        print("[GEMINI][ERROR]", detalle)
        if exc.code == 429:
            return jsonify({"error": "Se alcanzo el limite temporal de Gemini. Intenta mas tarde."}), 429
        return jsonify({"error": "Gemini rechazo la solicitud."}), 502
    except Exception as exc:
        print("[GEMINI][ERROR]", repr(exc))
        return jsonify({"error": "No fue posible interpretar la respuesta de Gemini."}), 502

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

def obtener_nuevo_numero_horario(nivel: str, sb=None) -> int:
    """
    Devuelve un número incremental de versión.
    OJO: por el UNIQUE (grado_id, dia, bloque) no se guardan múltiples versiones en paralelo.
    """
    cliente = sb or supabase
    resp = cliente.table("horarios").select("version_num").eq("nivel", nivel).execute()
    versiones = sorted({item["version_num"] for item in (resp.data or []) if item.get("version_num") is not None})
    return (max(versiones) + 1) if versiones else 1

def _num_bloques_configurados(restricciones):
    try:
        return max(1, min(int((restricciones or {}).get("num_bloques") or 8), 12))
    except Exception:
        return NUM_BLOQUES

def _limite_tiempo_solver(data):
    """Evita que una preferencia soft deje la interfaz esperando indefinidamente."""
    raw = (data or {}).get("time_limit_seconds", os.getenv("CP_SAT_TIME_LIMIT_SECONDS", "15"))
    try:
        return max(1.0, min(float(raw), 300.0))
    except Exception:
        return 15.0

def _normalize_text(texto):
    if texto is None:
        return ""
    return unicodedata.normalize("NFD", str(texto)).encode("ascii", "ignore").decode("ascii").lower()

def construir_restricciones_disponibilidad(sb, nivel, version=1):
    docentes_inactivos = {
        str((r.get("parametros") or {}).get("docente_id"))
        for r in (
            sb.table("reglas_ia")
            .select("parametros,activa")
            .eq("nivel", nivel)
            .eq("tipo", "disponibilidad_docente")
            .eq("activa", False)
            .execute()
            .data
            or []
        )
        if (r.get("parametros") or {}).get("docente_id") is not None
    }
    rows = (
        sb.table("restricciones_docente")
        .select("docente_id,dia,bloque")
        .eq("nivel", nivel)
        .eq("version_num", version)
        .execute()
        .data
        or []
    )

    bloque_one_based = any(int(r.get("bloque", 0)) == 1 for r in rows)
    disponibilidad = {}
    for r in rows:
        try:
            doc = str(r.get("docente_id"))
            if doc in docentes_inactivos:
                continue
            dia = _normalize_text(r.get("dia"))
            b = int(r.get("bloque"))
        except Exception:
            continue
        b0 = b - 1 if bloque_one_based else b
        disponibilidad.setdefault(doc, {})[f"{dia}-{b0}"] = True

    return {"disponibilidad": disponibilidad}

def _get_int_key(dic, key, default=None):
    if not isinstance(dic, dict):
        return default
    return dic.get(key, dic.get(str(key), default))

def _columnas_horario(data, horario_dict, nivel):
    columnas = data.get("columnas") or data.get("secciones") or []
    salida = []
    vistos = set()
    for col in columnas:
        try:
            col_id = int(col.get("id") or col.get("seccion_id") or col.get("grado_id"))
        except Exception:
            continue
        if col_id in vistos:
            continue
        vistos.add(col_id)
        salida.append({
            "id": col_id,
            "grado_id": int(col.get("grado_id") or col_id),
            "seccion_id": int(col["seccion_id"]) if col.get("seccion_id") is not None else None,
            "label": col.get("label") or str(col_id),
        })
    if salida:
        return salida

    ids = set()
    for bloques in (horario_dict or {}).values():
        for grupos in (bloques or {}).values():
            for grupo_id in (grupos or {}).keys():
                try:
                    ids.add(int(grupo_id))
                except Exception:
                    continue
    if ids:
        return [{"id": i, "grado_id": i, "seccion_id": None, "label": str(i)} for i in sorted(ids)]

    grado_ids = list(range(6, 12)) if nivel == "Primaria" else list(range(1, 6))
    return [{"id": i, "grado_id": i, "seccion_id": None, "label": str(i)} for i in grado_ids]

def _armar_registros_y_matriz(data, horario_dict, asignaciones, nivel, version_num, num_bloques):
    columnas = _columnas_horario(data, horario_dict, nivel)
    columnas_por_id = {c["id"]: c for c in columnas}
    registros = []

    for dia_key, bloques in (horario_dict or {}).items():
        try:
            dia_idx = int(dia_key)
        except Exception:
            continue
        if not (0 <= dia_idx < len(DIAS)):
            continue
        dia_nombre = DIAS[dia_idx]

        for blq_key, grupos in (bloques or {}).items():
            try:
                bloque_idx = int(blq_key)
            except Exception:
                continue
            if not (0 <= bloque_idx < num_bloques):
                continue

            for grupo_key, curso_id in (grupos or {}).items():
                if not isinstance(curso_id, int) or curso_id <= 0:
                    continue
                try:
                    grupo_id = int(grupo_key)
                except Exception:
                    continue

                meta = (
                    asignaciones
                    .get(str(curso_id), {})
                    .get(str(grupo_id), {})
                    or {}
                )
                col = columnas_por_id.get(grupo_id, {})
                docente_id = meta.get("docente_id")
                grado_id = meta.get("grado_id") or col.get("grado_id") or grupo_id
                seccion_id = meta.get("seccion_id") or col.get("seccion_id")
                if docente_id:
                    registro = {
                        "docente_id": int(docente_id),
                        "curso_id": int(curso_id),
                        "grado_id": int(grado_id),
                        "dia": dia_nombre,
                        "bloque": int(bloque_idx),
                        "nivel": nivel,
                        "version_num": int(version_num),
                    }
                    if seccion_id is not None:
                        registro["seccion_id"] = int(seccion_id)
                    registros.append(registro)

    horario_lista = [
        [
            [
                _get_int_key(_get_int_key(_get_int_key(horario_dict, d, {}), b, {}), col["id"], 0)
                for col in columnas
            ]
            for b in range(num_bloques)
        ]
        for d in range(5)
    ]
    return registros, horario_lista, columnas

@app.route("/generar-horario-general", methods=["POST", "OPTIONS"])
@app.route("/generar-horario-general/", methods=["POST", "OPTIONS"])
def generar_horario_general():
    try:
        # Lee body (si no viene JSON válido, esto levanta)
        data = request.get_json(force=True, silent=False)
        sb_request = cliente_supabase_para_request()

        docentes = data.get("docentes", [])
        asignaciones = data.get("asignaciones", {})
        restricciones = data.get("restricciones", {})
        horas_curso_grado = data.get("horas_curso_grado", {})
        nivel = data.get("nivel", "Secundaria")
        overwrite = bool(data.get("overwrite", False))  # por defecto NO sobrescribe
        version = data.get("version") or data.get("version_num") or 1
        num_bloques = _num_bloques_configurados(restricciones)

        if not docentes or not asignaciones or not horas_curso_grado:
            raise ValueError("Faltan datos requeridos para generar el horario.")

        print("[INFO] Generando horario para nivel: " + str(nivel))
        print("[API][DEBUG] restricciones keys:", (restricciones or {}).keys())
        print("[API][DEBUG] tiene disponibilidad?:", "disponibilidad" in (restricciones or {}))
        if isinstance((restricciones or {}).get("disponibilidad"), dict):
            disp = (restricciones or {}).get("disponibilidad") or {}
            print("[API][DEBUG] disponibilidad docentes:", list(disp.keys())[:5])
            if disp:
                first = next(iter(disp))
                print("[API][DEBUG] sample docente", first, "keys:", list((disp.get(first) or {}).keys())[:10])
        else:
            print("[API][DEBUG] disponibilidad tipo:", type((restricciones or {}).get("disponibilidad")))

        # Si el frontend envía `disponibilidad: {}`, significa que todas las
        # matrices fueron desactivadas y los docentes tienen disponibilidad completa.
        # Solo consultamos la BD cuando la clave no fue enviada en absoluto.
        if "disponibilidad" not in (restricciones or {}):
            restricciones = {
                **(restricciones or {}),
                **construir_restricciones_disponibilidad(sb_request, nivel, version),
            }
            print("[API][DEBUG] disponibilidad cargada desde BD. docentes:", list(restricciones.get("disponibilidad", {}).keys())[:5])
        resultado = generar_horario(
            docentes,
            asignaciones,
            restricciones,
            horas_curso_grado,
            nivel=nivel,
            version=version,
            time_limit_seconds=_limite_tiempo_solver(data),
        )

        horario_dict = resultado.get("horario", {})  # {dia_idx: {bloque_idx: {grado_id: curso_id}}}
        total_asignados = resultado.get("total_bloques_asignados", 0)
        nueva_version = obtener_nuevo_numero_horario(nivel, sb_request)

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
                if not (0 <= bloque_idx < num_bloques):
                    continue

                for grado_key, curso_id in (grados or {}).items():
                    # 0 significa vacío
                    if not isinstance(curso_id, int) or curso_id <= 0:
                        continue
                    try:
                        grado_id = int(grado_key)
                    except Exception:
                        continue

                    meta_asignacion = (
                        asignaciones
                        .get(str(curso_id), {})
                        .get(str(grado_id), {})
                        or {}
                    )
                    docente_id = meta_asignacion.get("docente_id")
                    grado_real_id = meta_asignacion.get("grado_id") or grado_id
                    seccion_id = meta_asignacion.get("seccion_id")
                    if docente_id:
                        registro = {
                            "docente_id": int(docente_id),
                            "curso_id": int(curso_id),
                            "grado_id": int(grado_real_id),
                            "dia": dia_nombre,           # 'lunes'..'viernes'
                            "bloque": int(bloque_idx),   # 0..7
                            "nivel": nivel,
                            "version_num": int(nueva_version)
                        }
                        if seccion_id is not None:
                            registro["seccion_id"] = int(seccion_id)
                        registros.append(registro)

        # Persistencia robusta evitando duplicados
        if registros:
            # Si quieres intentar UPSERT primero (cuando tu UNIQUE sea (grado_id, dia, bloque)):
            CONFLICT_COLS = ["nivel", "version_num", "dia", "bloque", "grado_id", "seccion_id"]

            if overwrite:
                # Estrategia clara y consistente: borra e inserta todo el nivel
                sb_request.table("horarios").delete().eq("nivel", nivel).eq("version_num", nueva_version).execute()
                sb_request.table("horarios").insert(registros).execute()
                print("[OK] Horario sobrescrito para " + str(nivel) + ". Filas: " + str(len(registros)))
            else:
                # Intenta UPSERT; si tu indice no coincide (42P10) o hay 23505 por otro UNIQUE, cae a delete+insert
                try:
                    sb_request.table("horarios").upsert(registros, on_conflict=CONFLICT_COLS).execute()
                    print("[OK] Horario cargado por UPSERT. Filas: " + str(len(registros)))
                except Exception as e:
                    msg = str(e)
                    if "42P10" in msg or "23505" in msg:
                        print("[WARN] Fallback a delete+insert por conflicto de indice unico.")
                        sb_request.table("horarios").delete().eq("nivel", nivel).eq("version_num", nueva_version).execute()
                        sb_request.table("horarios").insert(registros).execute()
                    else:
                        raise
        else:
            print("[WARN] No se generaron registros (todo vacio).")
        # Devuelve matriz para el front (5 días × NUM_BLOQUES × (5 ó 6 grados))
        columnas = _columnas_horario(data, horario_dict, nivel)
        columnas_ids = [c["id"] for c in columnas]
        horario_lista = [
            [
                [
                    _get_int_key(_get_int_key(_get_int_key(horario_dict, d, {}), b, {}), col_id, 0)
                    for col_id in columnas_ids
                ]
                for b in range(num_bloques)
            ]
            for d in range(5)
        ]

        return jsonify({
            "horario": horario_lista,
            "columnas": columnas,
            "asignaciones_exitosas": resultado.get("asignaciones_exitosas", 0),
            "asignaciones_fallidas": resultado.get("asignaciones_fallidas", 0),
            "total_bloques_asignados": total_asignados,
            "diagnostico": resultado.get("diagnostico"),
            "status": resultado.get("status"),
            "metricas": resultado.get("metricas"),
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
        sb_request = cliente_supabase_para_request()

        docentes = data.get("docentes", [])
        asignaciones = data.get("asignaciones", {})
        restricciones = data.get("restricciones", {})
        horas_curso_grado = data.get("horas_curso_grado", {})
        nivel = data.get("nivel", "Secundaria")
        overwrite = bool(data.get("overwrite", False))
        version = data.get("version") or data.get("version_num") or 1
        num_bloques = _num_bloques_configurados(restricciones)

        if not docentes or not asignaciones or not horas_curso_grado:
            return jsonify({"error": "Faltan datos requeridos para generar el horario."}), 400

        print("[API][DEBUG] restricciones keys:", (restricciones or {}).keys())
        print("[API][DEBUG] tiene disponibilidad?:", "disponibilidad" in (restricciones or {}))
        if isinstance((restricciones or {}).get("disponibilidad"), dict):
            disp = (restricciones or {}).get("disponibilidad") or {}
            print("[API][DEBUG] disponibilidad docentes:", list(disp.keys())[:5])
            if disp:
                first = next(iter(disp))
                print("[API][DEBUG] sample docente", first, "keys:", list((disp.get(first) or {}).keys())[:10])
        else:
            print("[API][DEBUG] disponibilidad tipo:", type((restricciones or {}).get("disponibilidad")))

        # Un diccionario vacío es una decisión explícita: no limitar disponibilidad.
        if "disponibilidad" not in (restricciones or {}):
            restricciones = {
                **(restricciones or {}),
                **construir_restricciones_disponibilidad(sb_request, nivel, version),
            }
            print("[API][DEBUG] disponibilidad cargada desde BD. docentes:", list(restricciones.get("disponibilidad", {}).keys())[:5])

        job_id = str(uuid.uuid4())
        q = Queue()
        with _jobs_lock:
            _jobs[job_id] = {"queue": q, "status": "running", "result": None, "error": None}

        def _progress_cb(pct, stage=""):
            if isinstance(pct, dict):
                evento = pct
                stage = evento.get("type") or stage
                porcentajes = {
                    "model_build_started": 5,
                    "model_built": 25,
                    "solver_started": 35,
                    "solution": 75,
                    "solver_finished": 95,
                }
                pct = evento.get("progress", porcentajes.get(stage, 50))
            _push_event(job_id, "progress", {"progress": int(pct), "stage": stage})
            try:
                print(f"[PROGRESS] {int(pct)}% {stage}", flush=True)
            except Exception:
                pass

        def _run():
            try:
                _progress_cb(2, "preparando")
                resultado = generar_horario(
                    docentes,
                    asignaciones,
                    restricciones,
                    horas_curso_grado,
                    nivel=nivel,
                    version=version,
                    progress_callback=_progress_cb,
                    time_limit_seconds=_limite_tiempo_solver(data),
                )
                horario_dict = resultado.get("horario", {})
                total_asignados = resultado.get("total_bloques_asignados", 0)
                nueva_version = obtener_nuevo_numero_horario(nivel, sb_request)

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
                        if not (0 <= bloque_idx < num_bloques):
                            continue

                        for grado_key, curso_id in (grados or {}).items():
                            if not isinstance(curso_id, int) or curso_id <= 0:
                                continue
                            try:
                                grado_id = int(grado_key)
                            except Exception:
                                continue

                            meta_asignacion = (
                                asignaciones
                                .get(str(curso_id), {})
                                .get(str(grado_id), {})
                                or {}
                            )
                            docente_id = meta_asignacion.get("docente_id")
                            grado_real_id = meta_asignacion.get("grado_id") or grado_id
                            seccion_id = meta_asignacion.get("seccion_id")
                            if docente_id:
                                registro = {
                                    "docente_id": int(docente_id),
                                    "curso_id": int(curso_id),
                                    "grado_id": int(grado_real_id),
                                    "dia": dia_nombre,
                                    "bloque": int(bloque_idx),
                                    "nivel": nivel,
                                    "version_num": int(nueva_version)
                                }
                                if seccion_id is not None:
                                    registro["seccion_id"] = int(seccion_id)
                                registros.append(registro)

                if registros:
                    CONFLICT_COLS = ["nivel", "version_num", "dia", "bloque", "grado_id", "seccion_id"]
                    if overwrite:
                        sb_request.table("horarios").delete().eq("nivel", nivel).eq("version_num", nueva_version).execute()
                        sb_request.table("horarios").insert(registros).execute()
                    else:
                        try:
                            sb_request.table("horarios").upsert(registros, on_conflict=CONFLICT_COLS).execute()
                        except Exception as e:
                            msg = str(e)
                            if "42P10" in msg or "23505" in msg:
                                sb_request.table("horarios").delete().eq("nivel", nivel).eq("version_num", nueva_version).execute()
                                sb_request.table("horarios").insert(registros).execute()
                            else:
                                raise

                columnas = _columnas_horario(data, horario_dict, nivel)
                columnas_ids = [c["id"] for c in columnas]
                horario_lista = [
                    [
                        [
                            _get_int_key(_get_int_key(_get_int_key(horario_dict, d, {}), b, {}), col_id, 0)
                            for col_id in columnas_ids
                        ]
                        for b in range(num_bloques)
                    ]
                    for d in range(5)
                ]

                payload = {
                    "horario": horario_lista,
                    "columnas": columnas,
                    "asignaciones_exitosas": resultado.get("asignaciones_exitosas", 0),
                    "asignaciones_fallidas": resultado.get("asignaciones_fallidas", 0),
                    "total_bloques_asignados": total_asignados,
                    "diagnostico": resultado.get("diagnostico"),
                    "status": resultado.get("status"),
                    "metricas": resultado.get("metricas"),
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
