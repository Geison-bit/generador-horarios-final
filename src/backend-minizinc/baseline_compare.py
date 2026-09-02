"""Comparacion reproducible entre resultados CP-SAT existentes y greedy.

Este modulo nunca invoca ``generar_horario_cp``. CP-SAT se carga desde los
CSV/JSON/logs ya existentes en ``resultados``; solo el baseline greedy se
ejecuta nuevamente.
"""

import argparse
import csv
import json
import random
import re
import time
from collections import Counter, defaultdict
from pathlib import Path

from stress_runner import (
    BLOQUES_POR_SECCION,
    DOCENTES_POR_SECCION,
    GRUPOS_POR_SECCION,
    MULTIPLICADORES_OFICIALES,
    contar_datos_modelables,
    generar_instancia_sintetica,
    validar_estructura,
)


ESCALAS_COMPARACION = (1, 2, 5, 10, 20, 30)
DIAS = 5
BLOQUES_DIA = 7
GREEDY_SEED = 20260717
GREEDY_MAX_RESTARTS = 200

RAW_FIELDS = (
    "algorithm",
    "multiplicador",
    "secciones_generadas",
    "grupos_calculados",
    "docentes_calculados",
    "cursos_catalogo",
    "asignaciones_calculadas",
    "bloques_esperados_teoricos",
    "bloques_requeridos",
    "bloques_asignados",
    "coverage_rate",
    "status",
    "tiempo_segundos",
    "conflictos_docente",
    "conflictos_grupo",
    "violaciones_disponibilidad",
    "violaciones_carga",
    "solver_conflicts",
    "solver_branches",
    "solucion_completa",
    "estructura_valida",
    "seed",
    "restarts_usados",
    "source",
    "observacion",
)

SUMMARY_FIELDS = (
    "multiplicador",
    "secciones_generadas",
    "grupos_calculados",
    "docentes_calculados",
    "bloques_requeridos",
    "cpsat_status",
    "greedy_status",
    "cpsat_bloques_asignados",
    "greedy_bloques_asignados",
    "cpsat_coverage_rate",
    "greedy_coverage_rate",
    "coverage_delta_greedy_minus_cpsat",
    "cpsat_tiempo_segundos",
    "greedy_tiempo_segundos",
    "speedup_cpsat_over_greedy",
    "cpsat_conflictos_docente",
    "greedy_conflictos_docente",
    "cpsat_conflictos_grupo",
    "greedy_conflictos_grupo",
    "cpsat_violaciones_disponibilidad",
    "greedy_violaciones_disponibilidad",
    "cpsat_violaciones_carga",
    "greedy_violaciones_carga",
    "ambos_completos",
    "ambos_sin_conflictos",
    "observacion",
)


def _to_int(value, default=0):
    if value in (None, ""):
        return default
    return int(float(value))


def _to_float(value, default=None):
    if value in (None, ""):
        return default
    return float(value)


def _to_bool(value):
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "si"}


def _extraer_log_cp_sat(log_path):
    texto = log_path.read_text(encoding="utf-8", errors="replace")

    def buscar(etiqueta, patron=r"([0-9]+)"):
        coincidencia = re.search(rf"{re.escape(etiqueta)}\s*{patron}", texto)
        if not coincidencia:
            raise ValueError(f"Falta '{etiqueta}' en {log_path}")
        return coincidencia.group(1)

    return {
        "bloques_requeridos": int(buscar("Bloques requeridos:")),
        "bloques_asignados": int(buscar("Bloques asignados:")),
        "conflictos_docente": int(buscar("Conflictos docentes:")),
        "conflictos_grupo": int(buscar("Conflictos por grupo:")),
        "violaciones_disponibilidad": int(buscar("Violaciones de disponibilidad:")),
        "violaciones_carga": int(buscar("Violaciones de carga:")),
        "tiempo_segundos": float(buscar("Tiempo de ejecucion:", r"([0-9]+(?:\.[0-9]+)?)")),
        "status": buscar("Estado del solver:", r"([A-Z_]+)"),
        "solver_conflicts": int(buscar("NumConflicts:")),
        "solver_branches": int(buscar("NumBranches:")),
    }


def _normalizar_fila_cp_sat(datos, multiplicador, source):
    requeridos = _to_int(
        datos.get("bloques_requeridos", datos.get("bloques_requeridos_calculados"))
    )
    asignados = _to_int(datos.get("bloques_asignados"))
    coverage = _to_float(datos.get("coverage_rate"))
    if coverage is None:
        coverage = asignados / requeridos if requeridos else 0.0
    status = str(datos.get("status", datos.get("solver_status", "UNKNOWN")))
    completa = status in {"OPTIMAL", "FEASIBLE"} and asignados == requeridos
    return {
        "algorithm": "CP-SAT",
        "multiplicador": multiplicador,
        "secciones_generadas": _to_int(
            datos.get("secciones_generadas"), multiplicador
        ),
        "grupos_calculados": _to_int(
            datos.get("grupos_calculados"), multiplicador * GRUPOS_POR_SECCION
        ),
        "docentes_calculados": _to_int(
            datos.get("docentes_calculados"), multiplicador * DOCENTES_POR_SECCION
        ),
        "cursos_catalogo": _to_int(datos.get("cursos_catalogo"), 10),
        "asignaciones_calculadas": _to_int(
            datos.get("asignaciones_calculadas"), multiplicador * 50
        ),
        "bloques_esperados_teoricos": _to_int(
            datos.get("bloques_esperados_teoricos"),
            multiplicador * BLOQUES_POR_SECCION,
        ),
        "bloques_requeridos": requeridos,
        "bloques_asignados": asignados,
        "coverage_rate": round(coverage, 9),
        "status": status,
        "tiempo_segundos": _to_float(datos.get("tiempo_segundos")),
        "conflictos_docente": _to_int(datos.get("conflictos_docente")),
        "conflictos_grupo": _to_int(datos.get("conflictos_grupo")),
        "violaciones_disponibilidad": _to_int(
            datos.get("violaciones_disponibilidad")
        ),
        "violaciones_carga": _to_int(datos.get("violaciones_carga")),
        "solver_conflicts": _to_int(datos.get("solver_conflicts")),
        "solver_branches": _to_int(datos.get("solver_branches")),
        "solucion_completa": completa,
        "estructura_valida": _to_bool(datos.get("estructura_valida", True)),
        "seed": "",
        "restarts_usados": "",
        "source": str(Path(source).resolve()),
        "observacion": str(
            datos.get("observacion", "Metricas CP-SAT cargadas de resultado existente")
        ),
    }


def cargar_resultados_cp_sat(resultados_dir, escalas=ESCALAS_COMPARACION):
    """Carga resultados existentes; no importa ni ejecuta el solver."""
    resultados_dir = Path(resultados_dir)
    por_escala = {}

    csv_path = resultados_dir / "stress_cp_sat.csv"
    if csv_path.exists():
        with csv_path.open(encoding="utf-8-sig", newline="") as archivo:
            for row in csv.DictReader(archivo):
                multiplicador = _to_int(row.get("multiplicador"), -1)
                if multiplicador in escalas:
                    por_escala[multiplicador] = _normalizar_fila_cp_sat(
                        row, multiplicador, csv_path
                    )

    for multiplicador in escalas:
        json_path = resultados_dir / f"stress_cp_sat_x{multiplicador}.json"
        if json_path.exists():
            datos = json.loads(json_path.read_text(encoding="utf-8"))
            por_escala[multiplicador] = _normalizar_fila_cp_sat(
                datos, multiplicador, json_path
            )

    for multiplicador in escalas:
        if multiplicador in por_escala:
            continue
        log_path = resultados_dir / "logs" / f"stress_x{multiplicador}.log"
        if not log_path.exists():
            raise FileNotFoundError(
                f"No existe resultado CP-SAT para x{multiplicador}: {log_path}"
            )
        datos = _extraer_log_cp_sat(log_path)
        por_escala[multiplicador] = _normalizar_fila_cp_sat(
            datos, multiplicador, log_path
        )

    return [por_escala[m] for m in escalas]


def _sesiones_de_seccion(instancia, seccion_idx):
    inicio_grupo = seccion_idx * GRUPOS_POR_SECCION + 1
    fin_grupo = inicio_grupo + GRUPOS_POR_SECCION
    sesiones = []
    session_id = 0
    for curso_id, targets in instancia["asignaciones"].items():
        for grupo_id, asignacion in targets.items():
            grupo = int(grupo_id)
            if not inicio_grupo <= grupo < fin_grupo:
                continue
            patron = instancia["patrones_division"][f"{curso_id}-{grupo_id}"]
            for posicion, longitud in enumerate(patron):
                sesiones.append(
                    {
                        "id": session_id,
                        "assignment": (int(curso_id), grupo),
                        "course": int(curso_id),
                        "group": grupo,
                        "teacher": int(asignacion["docente_id"]),
                        "length": int(longitud),
                        "pattern_position": posicion,
                    }
                )
                session_id += 1
    return sesiones


def _candidatos_sesion(
    sesion,
    group_next,
    group_long_count,
    group_short_count,
    teacher_busy,
    teacher_group_daily,
    assignment_days,
):
    candidatos = []
    grupo = sesion["group"]
    docente = sesion["teacher"]
    longitud = sesion["length"]
    for dia in range(DIAS):
        inicio = group_next[(grupo, dia)]
        if inicio + longitud > BLOQUES_DIA:
            continue
        if longitud == 3 and group_long_count[(grupo, dia)] >= 1:
            continue
        if longitud == 2 and group_short_count[(grupo, dia)] >= 2:
            continue
        if dia in assignment_days[sesion["assignment"]]:
            continue
        if teacher_group_daily[(docente, grupo, dia)] + longitud > 3:
            continue
        if any((docente, dia, bloque) in teacher_busy for bloque in range(inicio, inicio + longitud)):
            continue
        candidatos.append((dia, inicio))
    return candidatos


def _intento_greedy_seccion(sesiones, seed):
    rng = random.Random(seed)
    grupos = sorted({sesion["group"] for sesion in sesiones})
    cursos_largos = sorted(
        {sesion["course"] for sesion in sesiones if sesion["length"] == 3}
    )
    indice_grupo = {grupo: idx for idx, grupo in enumerate(grupos)}
    indice_curso_largo = {
        curso: idx for idx, curso in enumerate(cursos_largos)
    }
    teacher_busy = set()
    teacher_group_daily = defaultdict(int)
    assignment_days = defaultdict(set)
    colocadas = []

    # Primera fase constructiva: una sesion de 3 bloques por grupo y dia.
    # La rotacion latina evita cruces entre los cinco docentes involucrados.
    for sesion in sorted(
        (item for item in sesiones if item["length"] == 3),
        key=lambda item: (item["group"], item["course"]),
    ):
        dia = (
            indice_curso_largo[sesion["course"]]
            - indice_grupo[sesion["group"]]
        ) % DIAS
        colocada = {**sesion, "day": dia, "start": 0}
        colocadas.append(colocada)
        assignment_days[sesion["assignment"]].add(dia)
        teacher_group_daily[(sesion["teacher"], sesion["group"], dia)] += 3
        for bloque in range(3):
            teacher_busy.add((sesion["teacher"], dia, bloque))

    pendientes = [item for item in sesiones if item["length"] == 2]
    slots_ocupados = set()
    while pendientes:
        evaluadas = []
        for sesion in pendientes:
            candidatos = []
            for dia in range(DIAS):
                if dia in assignment_days[sesion["assignment"]]:
                    continue
                if teacher_group_daily[
                    (sesion["teacher"], sesion["group"], dia)
                ] + 2 > 3:
                    continue
                for inicio in (3, 5):
                    slot = (sesion["group"], dia, inicio)
                    if slot in slots_ocupados:
                        continue
                    if any(
                        (sesion["teacher"], dia, bloque) in teacher_busy
                        for bloque in range(inicio, inicio + 2)
                    ):
                        continue
                    candidatos.append((dia, inicio))
            evaluadas.append((len(candidatos), sesion, candidatos))
        evaluadas.sort(key=lambda item: (item[0], item[1]["id"]))
        cantidad, sesion, candidatos = evaluadas[0]
        if cantidad == 0:
            break

        # Seleccion greedy; los reinicios reproducibles solo rompen empates.
        rng.shuffle(candidatos)
        candidatos.sort(
            key=lambda slot: (
                teacher_group_daily[
                    (sesion["teacher"], sesion["group"], slot[0])
                ],
                slot[0],
                slot[1],
            )
        )
        dia, inicio = candidatos[0]
        slots_ocupados.add((sesion["group"], dia, inicio))
        teacher_group_daily[(sesion["teacher"], sesion["group"], dia)] += 2
        assignment_days[sesion["assignment"]].add(dia)
        for bloque in range(inicio, inicio + 2):
            teacher_busy.add((sesion["teacher"], dia, bloque))
        colocadas.append({**sesion, "day": dia, "start": inicio})
        pendientes.remove(sesion)

    return colocadas, pendientes


def _resolver_seccion_greedy(sesiones, seed, max_restarts=GREEDY_MAX_RESTARTS):
    mejor_colocadas = []
    mejor_pendientes = list(sesiones)
    mejor_intento = 0
    for intento in range(max_restarts + 1):
        colocadas, pendientes = _intento_greedy_seccion(
            sesiones, seed + intento * 1009
        )
        if len(colocadas) > len(mejor_colocadas):
            mejor_colocadas = colocadas
            mejor_pendientes = pendientes
            mejor_intento = intento
        if not pendientes:
            return colocadas, pendientes, intento
    return mejor_colocadas, mejor_pendientes, mejor_intento


def _metricas_greedy(instancia, colocadas, tiempo_segundos, restarts_usados):
    requeridos = contar_datos_modelables(instancia)[1]
    bloques = []
    for sesion in colocadas:
        for bloque in range(sesion["start"], sesion["start"] + sesion["length"]):
            bloques.append(
                {
                    "teacher": sesion["teacher"],
                    "group": sesion["group"],
                    "day": sesion["day"],
                    "block": bloque,
                }
            )

    ocupacion_docente = Counter(
        (item["teacher"], item["day"], item["block"]) for item in bloques
    )
    ocupacion_grupo = Counter(
        (item["group"], item["day"], item["block"]) for item in bloques
    )
    carga_docente = Counter(item["teacher"] for item in bloques)
    limites = {int(d["id"]): int(d["jornada_total"]) for d in instancia["docentes"]}
    conflictos_docente = sum(max(0, cantidad - 1) for cantidad in ocupacion_docente.values())
    conflictos_grupo = sum(max(0, cantidad - 1) for cantidad in ocupacion_grupo.values())
    violaciones_carga = sum(
        1 for docente, carga in carga_docente.items() if carga > limites[docente]
    )
    asignados = len(bloques)
    coverage = asignados / requeridos if requeridos else 0.0
    completa = (
        asignados == requeridos
        and conflictos_docente == 0
        and conflictos_grupo == 0
        and violaciones_carga == 0
    )
    return {
        "bloques_requeridos": requeridos,
        "bloques_asignados": asignados,
        "coverage_rate": round(coverage, 9),
        "status": "COMPLETE" if completa else "PARTIAL",
        "tiempo_segundos": round(tiempo_segundos, 9),
        "conflictos_docente": conflictos_docente,
        "conflictos_grupo": conflictos_grupo,
        "violaciones_disponibilidad": 0,
        "violaciones_carga": violaciones_carga,
        "solucion_completa": completa,
        "restarts_usados": restarts_usados,
    }


def ejecutar_greedy(multiplicador, seed=GREEDY_SEED):
    instancia = generar_instancia_sintetica(multiplicador)
    estructura_valida, errores = validar_estructura(instancia)
    inicio = time.perf_counter()
    colocadas = []
    pendientes = []
    restarts_usados = 0
    for seccion_idx in range(multiplicador):
        sesiones = _sesiones_de_seccion(instancia, seccion_idx)
        colocadas_seccion, pendientes_seccion, reinicios = _resolver_seccion_greedy(
            sesiones,
            seed=seed + seccion_idx * 100_003,
        )
        colocadas.extend(colocadas_seccion)
        pendientes.extend(pendientes_seccion)
        restarts_usados += reinicios
    tiempo_segundos = time.perf_counter() - inicio
    metricas = _metricas_greedy(
        instancia, colocadas, tiempo_segundos, restarts_usados
    )
    meta = instancia["metadata"]
    return {
        "algorithm": "Greedy",
        "multiplicador": multiplicador,
        "secciones_generadas": len(meta["secciones"]),
        "grupos_calculados": len(meta["grupos"]),
        "docentes_calculados": len(instancia["docentes"]),
        "cursos_catalogo": meta["cursos_catalogo"],
        "asignaciones_calculadas": contar_datos_modelables(instancia)[0],
        "bloques_esperados_teoricos": multiplicador * BLOQUES_POR_SECCION,
        **metricas,
        "solver_conflicts": "",
        "solver_branches": "",
        "estructura_valida": estructura_valida,
        "seed": seed,
        "source": "baseline_compare.py::ejecutar_greedy",
        "observacion": (
            "Greedy constructivo completo y sin conflictos"
            if metricas["solucion_completa"]
            else f"Greedy parcial; sesiones no colocadas={len(pendientes)}"
        )
        if estructura_valida
        else "; ".join(errores),
    }


def _normalizar_texto_baseline(texto):
    if texto is None:
        return ""
    import unicodedata

    return (
        unicodedata.normalize("NFD", str(texto))
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )


def _patron_desde_horas(horas, curso_id=None, version=1):
    horas = int(horas)
    if horas <= 0:
        return []
    if horas == 5:
        return [3, 2]
    if horas == 4:
        return [2, 2]
    if horas == 3:
        if int(version) == 1 and int(curso_id or 0) in (9, 12):
            return [2, 1]
        return [3]
    if horas == 2:
        return [2]
    if horas == 1:
        return [1]
    partes = []
    restante = horas
    while restante > 0:
        tramo = min(3, restante)
        partes.append(tramo)
        restante -= tramo
    return partes


def _patron_payload(req, patrones_division, version):
    key_grupo = f"{req['curso']}-{req['grupo']}"
    key_grado = f"{req['curso']}-{req['grado']}"
    raw = (patrones_division or {}).get(key_grupo) or (patrones_division or {}).get(key_grado)
    if isinstance(raw, str):
        partes = [int(x) for x in raw.split("+") if x.strip().isdigit()]
    elif isinstance(raw, (list, tuple)):
        partes = [int(x) for x in raw]
    else:
        partes = []
    if partes and sum(partes) == int(req["horas"]):
        return partes
    return _patron_desde_horas(req["horas"], req.get("curso"), version)


def _bloqueos_desde_restricciones(restricciones, nivel, num_bloques):
    disponibilidad_map = (restricciones or {}).get("disponibilidad", {})
    bloqueos = set()
    if nivel == "Primaria" or not isinstance(disponibilidad_map, dict):
        return bloqueos
    for doc_str, reglas in disponibilidad_map.items():
        doc_id = _to_int(doc_str)
        if doc_id == 0 or not reglas:
            continue
        for dia_idx, dia_nom in enumerate(("lunes", "martes", "miercoles", "jueves", "viernes")):
            dia_norm = _normalizar_texto_baseline(dia_nom)
            for bloque in range(num_bloques):
                permitido = bool(
                    reglas.get(f"{dia_nom}-{bloque}") or reglas.get(f"{dia_norm}-{bloque}")
                )
                if not permitido:
                    bloqueos.add((doc_id, dia_idx, bloque))
    return bloqueos


def _map_asignaciones_payload(asignaciones, horas_curso_grado):
    temp = {}
    for curso_id, targets in (asignaciones or {}).items():
        c_int = _to_int(curso_id)
        for target_id, datos in (targets or {}).items():
            target_int = _to_int(target_id)
            grado = _to_int((datos or {}).get("grado_id")) or target_int
            seccion = (datos or {}).get("seccion_id")
            seccion = _to_int(seccion) if seccion is not None else None
            temp[(c_int, target_int)] = {
                "curso": c_int,
                "grupo": seccion or target_int,
                "grado": grado,
                "seccion": seccion,
                "docente": _to_int((datos or {}).get("docente_id")),
            }

    salida = []
    for curso_id, targets in (horas_curso_grado or {}).items():
        c_int = _to_int(curso_id)
        for target_id, horas in (targets or {}).items():
            target_int = _to_int(target_id)
            h_int = _to_int(horas)
            if h_int <= 0:
                continue
            meta = temp.get((c_int, target_int), {})
            docente = _to_int(meta.get("docente"))
            if docente <= 0:
                continue
            salida.append({
                "curso": c_int,
                "grupo": _to_int(meta.get("grupo")) or target_int,
                "grado": _to_int(meta.get("grado")) or target_int,
                "seccion": meta.get("seccion"),
                "docente": docente,
                "horas": h_int,
            })
    return salida


def _resolver_payload_greedy(map_asignaciones, bloqueos, num_bloques, version, patrones_division, seed):
    sesiones = []
    sid = 0
    for idx, req in enumerate(map_asignaciones):
        for posicion, longitud in enumerate(_patron_payload(req, patrones_division, version)):
            sesiones.append({
                "id": sid,
                "assignment_idx": idx,
                "assignment": (req["curso"], req["grupo"]),
                "course": req["curso"],
                "group": req["grupo"],
                "teacher": req["docente"],
                "length": int(longitud),
                "pattern_position": posicion,
            })
            sid += 1

    if num_bloques == BLOQUES_DIA and all(s["length"] in (2, 3) for s in sesiones):
        return _resolver_seccion_greedy(sesiones, seed)

    mejor = []
    mejor_pendientes = list(sesiones)
    mejor_reinicio = 0
    for reinicio in range(GREEDY_MAX_RESTARTS + 1):
        rng = random.Random(seed + reinicio * 1009)
        teacher_busy = set()
        group_busy = set()
        teacher_group_daily = defaultdict(int)
        assignment_days = defaultdict(set)
        colocadas = []
        pendientes = sorted(sesiones, key=lambda s: (-s["length"], s["group"], s["course"], s["id"]))

        while pendientes:
            evaluadas = []
            for sesion in pendientes:
                candidatos = []
                for dia in range(DIAS):
                    if dia in assignment_days[sesion["assignment"]]:
                        continue
                    if teacher_group_daily[(sesion["teacher"], sesion["group"], dia)] + sesion["length"] > 3:
                        continue
                    for inicio in range(0, num_bloques - sesion["length"] + 1):
                        rango = range(inicio, inicio + sesion["length"])
                        if any((sesion["teacher"], dia, b) in bloqueos for b in rango):
                            continue
                        if any((sesion["teacher"], dia, b) in teacher_busy for b in rango):
                            continue
                        if any((sesion["group"], dia, b) in group_busy for b in rango):
                            continue
                        candidatos.append((dia, inicio))
                evaluadas.append((len(candidatos), sesion, candidatos))

            evaluadas.sort(key=lambda item: (item[0], -item[1]["length"], item[1]["group"], item[1]["course"]))
            cantidad, sesion, candidatos = evaluadas[0]
            if cantidad == 0:
                break
            rng.shuffle(candidatos)
            candidatos.sort(key=lambda slot: (slot[0], slot[1]))
            dia, inicio = candidatos[0]
            for bloque in range(inicio, inicio + sesion["length"]):
                teacher_busy.add((sesion["teacher"], dia, bloque))
                group_busy.add((sesion["group"], dia, bloque))
            teacher_group_daily[(sesion["teacher"], sesion["group"], dia)] += sesion["length"]
            assignment_days[sesion["assignment"]].add(dia)
            colocadas.append({**sesion, "day": dia, "start": inicio})
            pendientes.remove(sesion)

        if len(colocadas) > len(mejor):
            mejor = colocadas
            mejor_pendientes = list(pendientes)
            mejor_reinicio = reinicio
        if not pendientes:
            break

    return mejor, mejor_pendientes, mejor_reinicio


def generar_horario_baseline(
    docentes,
    asignaciones,
    restricciones,
    horas_curso_grado,
    nivel="Secundaria",
    version=1,
    patrones_division=None,
    progress_callback=None,
    time_limit_seconds=None,
    workers=8,
    log_search_progress=False,
    solver_log_callback=None,
    progress_scenario="Greedy baseline",
    progress_print_interval_seconds=60,
):
    """Genera un horario con el baseline greedy usando el payload real de la app."""
    inicio = time.perf_counter()
    num_bloques = 7 if int(version) == 1 else 8
    patrones_division = patrones_division or {}
    if progress_callback:
        progress_callback(5, "preparando baseline greedy")

    map_asignaciones = _map_asignaciones_payload(asignaciones, horas_curso_grado)
    bloqueos = _bloqueos_desde_restricciones(restricciones, nivel, num_bloques)
    requeridos = sum(max(0, int(req["horas"])) for req in map_asignaciones)
    if progress_callback:
        progress_callback(20, "construyendo sesiones greedy")

    colocadas, pendientes, restarts = _resolver_payload_greedy(
        map_asignaciones,
        bloqueos,
        num_bloques,
        version,
        patrones_division,
        GREEDY_SEED,
    )
    if progress_callback:
        progress_callback(85, "materializando horario greedy")

    horario_salida = {d: {b: {} for b in range(num_bloques)} for d in range(DIAS)}
    asignaciones_programadas = []
    for sesion in colocadas:
        for bloque in range(sesion["start"], sesion["start"] + sesion["length"]):
            horario_salida[sesion["day"]][bloque][sesion["group"]] = sesion["course"]
            asignaciones_programadas.append({
                "docente": sesion["teacher"],
                "grupo": sesion["group"],
                "dia": sesion["day"],
                "bloque": bloque,
            })

    asignados = len(asignaciones_programadas)
    ocupacion_docente = Counter(
        (x["docente"], x["dia"], x["bloque"]) for x in asignaciones_programadas
    )
    ocupacion_grupo = Counter(
        (x["grupo"], x["dia"], x["bloque"]) for x in asignaciones_programadas
    )
    carga_docente = Counter(x["docente"] for x in asignaciones_programadas)
    limites = {
        _to_int(d.get("id")): _to_int(d.get("jornada_total"))
        for d in (docentes or [])
        if d.get("jornada_total") is not None
    }
    conflictos_docente = sum(max(0, n - 1) for n in ocupacion_docente.values())
    conflictos_grupo = sum(max(0, n - 1) for n in ocupacion_grupo.values())
    violaciones_disponibilidad = sum(
        1
        for item in asignaciones_programadas
        if (item["docente"], item["dia"], item["bloque"]) in bloqueos
    )
    violaciones_carga = sum(
        1 for docente, carga in carga_docente.items()
        if docente in limites and carga > limites[docente]
    )
    completa = (
        asignados == requeridos
        and conflictos_docente == 0
        and conflictos_grupo == 0
        and violaciones_disponibilidad == 0
        and violaciones_carga == 0
    )
    tiempo = time.perf_counter() - inicio
    metricas = {
        "bloques_requeridos": requeridos,
        "bloques_asignados": asignados,
        "bloques_faltantes": max(0, requeridos - asignados),
        "coverage_rate": round(asignados / requeridos, 9) if requeridos else 0.0,
        "conflictos_docentes": conflictos_docente,
        "conflictos_grupo": conflictos_grupo,
        "violaciones_disponibilidad": violaciones_disponibilidad,
        "violaciones_carga": violaciones_carga,
        "tiempo_ejecucion_segundos": round(tiempo, 6),
        "estado_solver": "COMPLETE" if completa else "PARTIAL",
        "restarts_usados": restarts,
        "sesiones_pendientes": len(pendientes),
    }
    if progress_callback:
        progress_callback(100, "baseline greedy finalizado")

    print("\n================ BASELINE GREEDY ================")
    print(f"Bloques requeridos: {requeridos}")
    print(f"Bloques asignados: {asignados}")
    print(f"Estado: {metricas['estado_solver']}")
    print(f"Reinicios usados: {restarts}")
    print(f"Tiempo de ejecucion: {tiempo:.3f} segundos")
    print("=================================================\n")

    return {
        "horario": horario_salida,
        "asignaciones_exitosas": asignados,
        "asignaciones_fallidas": max(0, requeridos - asignados),
        "total_bloques_asignados": asignados,
        "faltan_3h": [],
        "faltan_2h": [],
        "status": metricas["estado_solver"],
        "metricas": metricas,
        "diagnostico": {
            "modelo": "baseline_compare.py::generar_horario_baseline",
            "pendientes": len(pendientes),
        },
    }


def construir_summary(raw_rows, escalas=ESCALAS_COMPARACION):
    indice = {
        (row["algorithm"], int(row["multiplicador"])): row for row in raw_rows
    }
    resumen = []
    for multiplicador in escalas:
        cpsat = indice[("CP-SAT", multiplicador)]
        greedy = indice[("Greedy", multiplicador)]
        greedy_time = float(greedy["tiempo_segundos"])
        cpsat_time = float(cpsat["tiempo_segundos"])
        ambos_completos = bool(
            cpsat["solucion_completa"] and greedy["solucion_completa"]
        )
        ambos_sin_conflictos = all(
            int(row[campo]) == 0
            for row in (cpsat, greedy)
            for campo in ("conflictos_docente", "conflictos_grupo")
        )
        resumen.append(
            {
                "multiplicador": multiplicador,
                "secciones_generadas": greedy["secciones_generadas"],
                "grupos_calculados": greedy["grupos_calculados"],
                "docentes_calculados": greedy["docentes_calculados"],
                "bloques_requeridos": greedy["bloques_requeridos"],
                "cpsat_status": cpsat["status"],
                "greedy_status": greedy["status"],
                "cpsat_bloques_asignados": cpsat["bloques_asignados"],
                "greedy_bloques_asignados": greedy["bloques_asignados"],
                "cpsat_coverage_rate": cpsat["coverage_rate"],
                "greedy_coverage_rate": greedy["coverage_rate"],
                "coverage_delta_greedy_minus_cpsat": round(
                    float(greedy["coverage_rate"]) - float(cpsat["coverage_rate"]),
                    9,
                ),
                "cpsat_tiempo_segundos": cpsat_time,
                "greedy_tiempo_segundos": greedy_time,
                "speedup_cpsat_over_greedy": (
                    round(cpsat_time / greedy_time, 6) if greedy_time > 0 else ""
                ),
                "cpsat_conflictos_docente": cpsat["conflictos_docente"],
                "greedy_conflictos_docente": greedy["conflictos_docente"],
                "cpsat_conflictos_grupo": cpsat["conflictos_grupo"],
                "greedy_conflictos_grupo": greedy["conflictos_grupo"],
                "cpsat_violaciones_disponibilidad": cpsat[
                    "violaciones_disponibilidad"
                ],
                "greedy_violaciones_disponibilidad": greedy[
                    "violaciones_disponibilidad"
                ],
                "cpsat_violaciones_carga": cpsat["violaciones_carga"],
                "greedy_violaciones_carga": greedy["violaciones_carga"],
                "ambos_completos": ambos_completos,
                "ambos_sin_conflictos": ambos_sin_conflictos,
                "observacion": (
                    "Ambos metodos completaron la instancia sin conflictos"
                    if ambos_completos and ambos_sin_conflictos
                    else "Comparacion incluye una solucion parcial o con conflictos"
                ),
            }
        )
    return resumen


def escribir_csv(path, fields, rows):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as archivo:
        writer = csv.DictWriter(archivo, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    return path


def run_comparison(resultados_dir):
    resultados_dir = Path(resultados_dir)
    cp_rows = cargar_resultados_cp_sat(resultados_dir)
    greedy_rows = []
    for multiplicador in ESCALAS_COMPARACION:
        print(f"[BASELINE] Ejecutando greedy x{multiplicador}...")
        row = ejecutar_greedy(multiplicador)
        greedy_rows.append(row)
        print(
            f"[BASELINE] x{multiplicador}: status={row['status']} | "
            f"coverage={row['coverage_rate']:.3f} | "
            f"time={row['tiempo_segundos']:.6f}s"
        )

    raw_rows = []
    cp_index = {int(row["multiplicador"]): row for row in cp_rows}
    greedy_index = {int(row["multiplicador"]): row for row in greedy_rows}
    for multiplicador in ESCALAS_COMPARACION:
        raw_rows.extend((cp_index[multiplicador], greedy_index[multiplicador]))
    summary_rows = construir_summary(raw_rows)

    raw_path = escribir_csv(
        resultados_dir / "comparison_cpsat_vs_greedy_raw.csv",
        RAW_FIELDS,
        raw_rows,
    )
    summary_path = escribir_csv(
        resultados_dir / "comparison_cpsat_vs_greedy_summary.csv",
        SUMMARY_FIELDS,
        summary_rows,
    )
    return raw_path, summary_path, raw_rows, summary_rows


def parse_args():
    default_dir = Path(__file__).resolve().parent / "resultados"
    parser = argparse.ArgumentParser(
        description="Compara resultados CP-SAT existentes contra greedy"
    )
    parser.add_argument("--resultados-dir", type=Path, default=default_dir)
    return parser.parse_args()


def main():
    args = parse_args()
    raw_path, summary_path, _, _ = run_comparison(args.resultados_dir.resolve())
    print(f"[BASELINE] Raw: {raw_path}")
    print(f"[BASELINE] Summary: {summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
