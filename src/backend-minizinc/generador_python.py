# -*- coding: utf-8 -*-
# generador_python.py

import unicodedata
import time
from collections import Counter
from ortools.sat.python import cp_model

DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes"]
NUM_DIAS = 5
NUM_BLOQUES = 8

# --- Funciones de Utilidad (Mantenidas del original) ---

def normalizar_entero(x):
    try:
        return int(x)
    except Exception:
        return 0

def normalizar_texto(texto):
    if texto is None:
        return ""
    return unicodedata.normalize("NFD", texto).encode("ascii", "ignore").decode("ascii").lower()


def calcular_metricas_solucion(
    map_asignaciones,
    asignaciones_programadas,
    bloqueos,
    docentes,
    tiempo_ejecucion_segundos,
    estado_solver,
    num_conflicts,
    num_branches,
    tiempo_solver_segundos=None,
):
    """Calcula metricas verificables a partir de la solucion materializada.

    Un conflicto representa una asignacion excedente para el mismo recurso y
    slot. Por ejemplo, tres clases simultaneas del mismo docente cuentan como
    dos conflictos. Una violacion de carga representa un docente cuya carga
    asignada supera ``jornada_total``.
    """
    programadas = list(asignaciones_programadas or [])
    bloqueos = set(bloqueos or set())

    bloques_requeridos = sum(
        max(0, normalizar_entero(req.get("horas")))
        for req in (map_asignaciones or [])
    )
    bloques_asignados = len(programadas)

    ocupacion_docente = Counter()
    ocupacion_grupo = Counter()
    carga_asignada = Counter()
    violaciones_disponibilidad = 0

    for item in programadas:
        docente = normalizar_entero(item.get("docente"))
        grupo = normalizar_entero(item.get("grupo"))
        dia = normalizar_entero(item.get("dia"))
        bloque = normalizar_entero(item.get("bloque"))

        ocupacion_docente[(docente, dia, bloque)] += 1
        ocupacion_grupo[(grupo, dia, bloque)] += 1
        carga_asignada[docente] += 1
        if (docente, dia, bloque) in bloqueos:
            violaciones_disponibilidad += 1

    conflictos_docentes = sum(max(0, cantidad - 1) for cantidad in ocupacion_docente.values())
    conflictos_grupo = sum(max(0, cantidad - 1) for cantidad in ocupacion_grupo.values())

    limites_carga = {}
    for docente in docentes or []:
        if docente.get("jornada_total") is None:
            continue
        limites_carga[normalizar_entero(docente.get("id"))] = max(
            0, normalizar_entero(docente.get("jornada_total"))
        )

    docentes_con_exceso = []
    exceso_carga_bloques = 0
    for docente, carga in carga_asignada.items():
        if docente not in limites_carga:
            continue
        exceso = carga - limites_carga[docente]
        if exceso > 0:
            docentes_con_exceso.append({
                "docente_id": docente,
                "carga_asignada": carga,
                "jornada_total": limites_carga[docente],
                "exceso": exceso,
            })
            exceso_carga_bloques += exceso

    metricas = {
        "bloques_requeridos": bloques_requeridos,
        "bloques_asignados": bloques_asignados,
        "bloques_faltantes": max(0, bloques_requeridos - bloques_asignados),
        "conflictos_docentes": conflictos_docentes,
        "conflictos_grupo": conflictos_grupo,
        "violaciones_disponibilidad": violaciones_disponibilidad,
        "violaciones_carga": len(docentes_con_exceso),
        "exceso_carga_bloques": exceso_carga_bloques,
        "detalle_violaciones_carga": docentes_con_exceso,
        "tiempo_ejecucion_segundos": round(float(tiempo_ejecucion_segundos), 6),
        "estado_solver": str(estado_solver),
        "num_conflicts": int(num_conflicts),
        "num_branches": int(num_branches),
    }
    if tiempo_solver_segundos is not None:
        metricas["tiempo_solver_segundos"] = round(float(tiempo_solver_segundos), 6)
    return metricas


def _emitir_evento_progreso(progress_callback, event_type, **datos):
    """Emite instrumentacion sin alterar la formulacion ni detener el solver."""
    if progress_callback is None:
        return
    evento = {"type": event_type, **datos}
    try:
        progress_callback(evento)
    except Exception as exc:
        print(f"[WARN] No se pudo emitir progreso ({event_type}): {exc}")


class StressProgressCallback(cp_model.CpSolverSolutionCallback):
    """Reporta solo soluciones factibles completas devueltas por CP-SAT."""

    def __init__(
        self,
        scenario,
        required_blocks,
        x_variables,
        start_time,
        print_interval_seconds=60,
        progress_callback=None,
    ):
        super().__init__()
        self.scenario = str(scenario)
        self.required_blocks = int(required_blocks)
        self.x_variables = tuple(x_variables.values())
        self.start_time = float(start_time)
        self.print_interval_seconds = float(print_interval_seconds)
        self.progress_callback = progress_callback
        self.solution_count = 0

    def on_solution_callback(self):
        self.solution_count += 1
        assigned_blocks = sum(self.Value(variable) for variable in self.x_variables)
        coverage = (
            assigned_blocks / self.required_blocks
            if self.required_blocks > 0
            else None
        )
        _emitir_evento_progreso(
            self.progress_callback,
            "solution",
            scenario=self.scenario,
            elapsed_seconds=time.time() - self.start_time,
            solution_number=self.solution_count,
            assigned_blocks=assigned_blocks,
            required_blocks=self.required_blocks,
            coverage_rate=coverage,
        )

# --- NUEVO MODELO CP-SAT ---

def generar_horario_cp(
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
    random_seed=None,
    log_search_progress=False,
    solver_log_callback=None,
    progress_scenario="CP-SAT",
    progress_print_interval_seconds=60,
):
    """
    Genera un horario escolar utilizando Programación por Restricciones (CP-SAT).
    Garantiza que no haya choques y respeta la disponibilidad.
    """
    print("[CP-SAT] Iniciando modelado matemático...")
    t0 = time.time()
    _emitir_evento_progreso(
        progress_callback,
        "model_build_started",
        scenario=progress_scenario,
        started_at=t0,
    )
    
    # 1. Preparación y Limpieza de Datos
    # ---------------------------------------------------------
    model = cp_model.CpModel()
    num_bloques = 7 if int(version) == 1 else 8
    patrones_division = patrones_division or {}
    
    # Mapeo de IDs para facilitar el uso en el modelo
    # Diccionarios para acceso rápido
    map_asignaciones = [] # Lista de dicts (curso_id, grupo_id, grado_id, seccion_id, docente_id, horas)
    
    # Normalizar docentes
    docente_ids = set()
    for d in docentes:
        d_id = normalizar_entero(d.get("id"))
        d["id"] = d_id
        docente_ids.add(d_id)

    # Procesar horas requeridas y asignaciones
    total_horas_requeridas = 0
    
    # Barrido de asignaciones para saber QUÉ curso da QUÉ docente
    temp_asignaciones = {} # (curso_int, target_int) -> metadata de asignacion
    if asignaciones:
        for curso_id, targets in asignaciones.items():
            c_int = normalizar_entero(curso_id)
            for target_id, datos in targets.items():
                target_int = normalizar_entero(target_id)
                d_int = normalizar_entero(datos.get("docente_id"))
                grado_int = normalizar_entero(datos.get("grado_id")) or target_int
                seccion_int = normalizar_entero(datos.get("seccion_id")) or None
                grupo_int = seccion_int or target_int
                temp_asignaciones[(c_int, target_int)] = {
                    "docente": d_int,
                    "grado": grado_int,
                    "seccion": seccion_int,
                    "grupo": grupo_int,
                }

    # Barrido de horas para saber CUÁNTO tiempo se necesita
    if horas_curso_grado:
        for curso_id, targets in horas_curso_grado.items():
            c_int = normalizar_entero(curso_id)
            for target_id, horas in targets.items():
                target_int = normalizar_entero(target_id)
                h_int = normalizar_entero(horas)
                
                if h_int > 0:
                    meta = temp_asignaciones.get((c_int, target_int), {})
                    docente = normalizar_entero(meta.get("docente"))
                    # Solo agregamos si hay docente asignado o si queremos permitir vacantes (asumimos docente necesario)
                    if docente > 0:
                        map_asignaciones.append({
                            'curso': c_int,
                            'grupo': normalizar_entero(meta.get("grupo")) or target_int,
                            'grado': normalizar_entero(meta.get("grado")) or target_int,
                            'seccion': meta.get("seccion"),
                            'docente': docente,
                            'horas': h_int
                        })
                        total_horas_requeridas += h_int

    print(f"[CP-SAT] Total de requerimientos: {len(map_asignaciones)} asignaturas.")
    print(f"[CP-SAT] Total de horas a programar: {total_horas_requeridas}")
    print("========== DEBUG ASIGNACIONES ==========")
    for i, req in enumerate(map_asignaciones[:10]):
        print(i, req)
    print("Total asignaciones:", len(map_asignaciones))
    print("=======================================")

    # Procesar Restricciones (Disponibilidad)
    # En tu frontend, "disponibilidad" es una whitelist (horas permitidas).
    disponibilidad_map = (restricciones or {}).get("disponibilidad", {})
    reglas = (restricciones or {}).get("reglas", {}) or {}
    r_limitar_docente_grado = (
        bool(reglas.get("limitar_carga_docente_grado"))
        if "limitar_carga_docente_grado" in reglas
        else True
    )
    if isinstance(disponibilidad_map, dict):
        print("[CP-SAT][DEBUG] disponibilidad docentes sample:", list(disponibilidad_map.keys())[:5])
        for _doc_id, _reglas in list(disponibilidad_map.items())[:1]:
            if isinstance(_reglas, dict):
                print("[CP-SAT][DEBUG] disponibilidad claves sample:", list(_reglas.keys())[:8])
                # Log adicional: ver cómo llegan día/bloque y su versión normalizada
                for _k in list(_reglas.keys())[:8]:
                    try:
                        _dia_part, _bloque_part = _k.split("-", 1)
                        print(
                            "[CP-SAT][DEBUG] key->",
                            _k,
                            "| dia_norm:",
                            normalizar_texto(_dia_part),
                            "| bloque_raw:",
                            _bloque_part,
                        )
                    except Exception:
                        print("[CP-SAT][DEBUG] key formato inesperado:", _k)
            else:
                print("[CP-SAT][DEBUG] disponibilidad formato inesperado:", type(_reglas))
    else:
        print("[CP-SAT][DEBUG] disponibilidad_map no es dict:", type(disponibilidad_map))
    # Set de bloqueos (docente, dia, bloque)
    bloqueos = set() 
    
    if nivel != "Primaria": # Si es primaria asumimos full disponibilidad según tu código original
        for doc_str, reglas in disponibilidad_map.items():
            doc_id = normalizar_entero(doc_str)
            if doc_id == 0:
                continue
            # Si no hay reglas, se asume disponibilidad total (no bloqueamos nada).
            if not reglas:
                continue
            for dia_idx, dia_nom in enumerate(DIAS):
                dia_norm = normalizar_texto(dia_nom)
                for bloque in range(num_bloques):
                    # Claves posibles en tu JSON de restricciones (whitelist)
                    key1 = f"{dia_nom}-{bloque}"
                    key2 = f"{dia_norm}-{bloque}"
                    permitido = bool(reglas.get(key1) or reglas.get(key2))
                    if not permitido:
                        bloqueos.add((doc_id, dia_idx, bloque))
    # ---------------- DEBUG BLOQUEOS ----------------
    print("========== DEBUG DISPONIBILIDAD ==========")
    print("Total docentes con reglas:", len(disponibilidad_map))
    print("Total bloqueos generados:", len(bloqueos))

    bloqueos_por_docente = {}
    for (doc, d, b) in bloqueos:
        bloqueos_por_docente.setdefault(doc, 0)
        bloqueos_por_docente[doc] += 1

    for doc, cnt in list(bloqueos_por_docente.items())[:10]:
        print(f"Docente {doc} -> bloqueos: {cnt}")

    print("==========================================")
    print("========== DEBUG BLOQUES DISPONIBLES ==========")
    for doc in docente_ids:
        bloqueados = bloqueos_por_docente.get(doc, 0)
        total = NUM_DIAS * num_bloques
        libres = total - bloqueados
        print(f"Docente {doc}: libres {libres}/{total}")
    print("==============================================")
    print("========== DEBUG HORAS VS DISP ==========")
    for req in map_asignaciones:
        doc = req["docente"]
        horas = req["horas"]
        bloqueados = bloqueos_por_docente.get(doc, 0)
        libres = NUM_DIAS * num_bloques - bloqueados
        if horas > libres:
            print("⚠ IMPOSIBLE:", req, " libres:", libres)
    print("========================================")

    # 2. Variables del Modelo
    # ---------------------------------------------------------
    # x[(index_asignacion, dia, bloque)] -> booleano (1 si se da clase, 0 no)
    x = {}
    # horas_dia[(idx, d)] -> horas de esa asignacion en el dia
    horas_dia = {}
    # es_3h_dia[(idx, d)] -> 1 si esa asignacion tiene 3h en el dia
    es_3h_dia = {}
    # es_2h_dia[(idx, d)] -> 1 si esa asignacion tiene 2h en el dia
    es_2h_dia = {}
    # dicta_dia[(idx, d)] -> 1 si el docente dicta ese curso ese dia
    dicta_dia = {}
    # es_k_dia[(idx, d, k)] -> 1 si esa asignacion tiene k horas en el dia (patrones)
    es_k_dia = {}

    def _obtener_patron(req):
        key_grupo = f"{req['curso']}-{req.get('grupo')}"
        key_grado = f"{req['curso']}-{req['grado']}"
        raw = patrones_division.get(key_grupo) or patrones_division.get(key_grado)
        if not raw:
            return None
        if isinstance(raw, str):
            partes = [int(x) for x in raw.split("+") if x.strip().isdigit()]
            return partes or None
        if isinstance(raw, (list, tuple)):
            try:
                partes = [int(x) for x in raw]
                return partes or None
            except Exception:
                return None
        return None
    
    for idx, req in enumerate(map_asignaciones):
        for d in range(NUM_DIAS):
            for b in range(num_bloques):
                # Verificar disponibilidad del docente inmediatamente
                if (req['docente'], d, b) in bloqueos:
                    # Si el docente no puede, no creamos variable (es 0 implícito) 
                    # o la forzamos a 0. Mejor no crearla para ahorrar memoria, 
                    # pero para lógica de sumas, forzamos a 0.
                    x[(idx, d, b)] = model.NewBoolVar(f"x_{idx}_{d}_{b}")
                    model.Add(x[(idx, d, b)] == 0)
                else:
                    x[(idx, d, b)] = model.NewBoolVar(f"x_{idx}_{d}_{b}")

    # 3. Restricciones Duras (Hard Constraints)
    # ---------------------------------------------------------

    # A) Cumplir horas requeridas por asignatura
    for idx, req in enumerate(map_asignaciones):
        model.Add(
            sum(x[(idx, d, b)] for d in range(NUM_DIAS) for b in range(num_bloques)) == req['horas']
        )

    # B) Choques de grupo: una seccion/grado no puede tener 2 materias al mismo tiempo
    reqs_por_grupo = {}
    for idx, req in enumerate(map_asignaciones):
        reqs_por_grupo.setdefault(req['grupo'], []).append(idx)
    
    for grupo, indices in reqs_por_grupo.items():
        for d in range(NUM_DIAS):
            for b in range(num_bloques):
                model.Add(sum(x[(idx, d, b)] for idx in indices) <= 1)
            # Sin huecos intermedios: si hay clase despues, debe haber antes
            for b in range(num_bloques - 1):
                model.Add(
                    sum(x[(idx, d, b)] for idx in indices) >=
                    sum(x[(idx, d, b + 1)] for idx in indices)
                )

    # C) Choques de Docente: Un docente no puede dar 2 materias al mismo tiempo
    reqs_por_docente = {}
    for idx, req in enumerate(map_asignaciones):
        reqs_por_docente.setdefault(req['docente'], []).append(idx)
        
    for doc, indices in reqs_por_docente.items():
        for d in range(NUM_DIAS):
            for b in range(num_bloques):
                model.Add(sum(x[(idx, d, b)] for idx in indices) <= 1)

    # D) Maximo 3 horas por docente en un mismo grado al dia
    if r_limitar_docente_grado:
        reqs_por_docente_grado = {}
        for idx, req in enumerate(map_asignaciones):
            key = (req['docente'], req['grupo'])
            reqs_por_docente_grado.setdefault(key, []).append(idx)

        for (doc, grupo), indices in reqs_por_docente_grado.items():
            for d in range(NUM_DIAS):
                model.Add(
                    sum(x[(idx, d, b)] for idx in indices for b in range(num_bloques)) <= 3
                )

    # 4. Restricciones de Calidad (Estructura de Bloques)
    # ---------------------------------------------------------
    
    # D) Contigüidad Diaria: Si un curso se da un día, debe ser en bloque continuo.
    # Evita: Clase a las 8am y otra a las 11am con hueco en medio.
    # Lógica: Contamos cuántas veces "empieza" una clase en un día. Debe ser máximo 1 vez.
    
    for idx, req in enumerate(map_asignaciones):
        patron_vals = _obtener_patron(req)
        if patron_vals and sum(patron_vals) != req["horas"]:
            patron_vals = None
        for d in range(NUM_DIAS):
            # Variables auxiliares para detectar inicios
            # start[b] es 1 si la clase empieza en el bloque b
            starts = []
            horas_dia[(idx, d)] = model.NewIntVar(0, num_bloques, f"horas_{idx}_{d}")
            model.Add(horas_dia[(idx, d)] == sum(x[(idx, d, b)] for b in range(num_bloques)))
            dicta_dia[(idx, d)] = model.NewBoolVar(f"dicta_{idx}_{d}")
            model.Add(horas_dia[(idx, d)] >= 1).OnlyEnforceIf(dicta_dia[(idx, d)])
            model.Add(horas_dia[(idx, d)] == 0).OnlyEnforceIf(dicta_dia[(idx, d)].Not())
            es_3h_dia[(idx, d)] = model.NewBoolVar(f"es3h_{idx}_{d}")
            model.Add(horas_dia[(idx, d)] == 3).OnlyEnforceIf(es_3h_dia[(idx, d)])
            model.Add(horas_dia[(idx, d)] != 3).OnlyEnforceIf(es_3h_dia[(idx, d)].Not())
            es_2h_dia[(idx, d)] = model.NewBoolVar(f"es2h_{idx}_{d}")
            model.Add(horas_dia[(idx, d)] == 2).OnlyEnforceIf(es_2h_dia[(idx, d)])
            model.Add(horas_dia[(idx, d)] != 2).OnlyEnforceIf(es_2h_dia[(idx, d)].Not())
            if patron_vals:
                allowed = [[0]] + [[v] for v in sorted(set(patron_vals))]
                model.AddAllowedAssignments([horas_dia[(idx, d)]], allowed)
                for k in sorted(set(patron_vals)):
                    var = model.NewBoolVar(f"esk_{idx}_{d}_{k}")
                    model.Add(horas_dia[(idx, d)] == k).OnlyEnforceIf(var)
                    model.Add(horas_dia[(idx, d)] != k).OnlyEnforceIf(var.Not())
                    es_k_dia[(idx, d, k)] = var
            else:
                if not (int(version) == 1 and req['horas'] == 3 and req['curso'] in (9, 12)):
                    model.Add(horas_dia[(idx, d)] != 1)
            
            for b in range(num_bloques):
                es_inicio = model.NewBoolVar(f"start_{idx}_{d}_{b}")
                
                if b == 0:
                    # En el bloque 0, empieza si x es 1
                    model.Add(es_inicio == x[(idx, d, b)])
                else:
                    # En bloque b > 0, empieza si x[b]=1 y x[b-1]=0
                    # start >= x[b] - x[b-1]
                    # Logica bool: start <-> (x[b] AND NOT x[b-1])
                    model.AddBoolOr([x[(idx, d, b)].Not(), x[(idx, d, b-1)], es_inicio]) # Clausula para implicacion inversa
                    model.AddImplication(es_inicio, x[(idx, d, b)]) 
                    model.AddImplication(es_inicio, x[(idx, d, b-1)].Not())
                
                starts.append(es_inicio)
            
            # Restricción: Máximo 1 inicio por día (significa 1 bloque continuo)
            model.Add(sum(starts) <= 1)
            
            # Opcional: Limitar horas máximas por día para no cansar a alumnos (ej. max 3 horas seguidas)
            if req['horas'] > 2:
                model.Add(horas_dia[(idx, d)] <= 3) # Max 3 horas de la misma materia por dia

    # --- 5. ESTRATEGIA DE DEGLOSE DE HORAS (CORREGIDA) ---
    for idx, req in enumerate(map_asignaciones):
        patron_vals = _obtener_patron(req)
        if patron_vals and sum(patron_vals) != req["horas"]:
            patron_vals = None
        if patron_vals:
            conteo = Counter(patron_vals)
            for k, cnt in conteo.items():
                model.Add(
                    sum(es_k_dia[(idx, d, k)] for d in range(NUM_DIAS)) == cnt
                )
            continue
        h_total = req['horas']
        c_id = req['curso']
        sum_3h = sum(es_3h_dia[(idx, d)] for d in range(NUM_DIAS))
        sum_2h = sum(es_2h_dia[(idx, d)] for d in range(NUM_DIAS))

        if h_total == 5:
            model.Add(sum_3h == 1)
            model.Add(sum_2h == 1)
        elif h_total == 4:
            model.Add(sum_3h == 0)
            model.Add(sum_2h == 2)
        elif h_total == 3:
            if int(version) == 1 and c_id in (9, 12):
                model.Add(sum_3h == 0)
                model.Add(sum_2h == 1)
            else:
                model.Add(sum_3h == 1)
                model.Add(sum_2h == 0)
        elif h_total == 2:
            model.Add(sum_2h == 1)
            model.Add(sum_3h == 0)

    # --- 6. REGLAS DE DISTRIBUCIÓN DIARIA ---
    if int(version) == 1:
        for grupo, indices in reqs_por_grupo.items():
            indices_sin_patron = [
                idx for idx in indices
                if not _obtener_patron(map_asignaciones[idx])
            ]
            if not indices_sin_patron:
                continue
            total_sin_patron = sum(map_asignaciones[idx]["horas"] for idx in indices_sin_patron)
            # Permite horarios parciales: si una seccion aun no tiene carga completa,
            # no se fuerza el patron diario de una seccion completa.
            if total_sin_patron < NUM_DIAS * 5:
                continue
            for d in range(NUM_DIAS):
                model.Add(sum(es_3h_dia[(idx, d)] for idx in indices_sin_patron) == 1)
                total_2h_hoy = sum(es_2h_dia[(idx, d)] for idx in indices_sin_patron)
                model.Add(total_2h_hoy >= 1)
                model.Add(total_2h_hoy <= 2)

    def _diagnosticar_datos():
        diagnostico = {
            "version": int(version),
            "num_bloques": num_bloques,
            "capacidad_por_grupo": NUM_DIAS * num_bloques,
            "grupos": [],
            "docentes": [],
            "docente_grupo": [],
            "resumen": [],
        }

        for grupo, indices in sorted(reqs_por_grupo.items()):
            total = sum(map_asignaciones[idx]["horas"] for idx in indices)
            sin_patron_indices = [idx for idx in indices if not _obtener_patron(map_asignaciones[idx])]
            sin_patron = sum(map_asignaciones[idx]["horas"] for idx in sin_patron_indices)
            con_patron = total - sin_patron
            problemas = []
            capacidad = NUM_DIAS * num_bloques
            if total > capacidad:
                problemas.append(f"requiere {total} bloques y solo hay {capacidad} disponibles")
            if int(version) == 1 and sin_patron_indices:
                minimo = NUM_DIAS * 5
                maximo = NUM_DIAS * 7
                if sin_patron > maximo:
                    problemas.append(
                        f"version 1 permite como maximo {maximo} bloques sin patron por seccion; tiene {sin_patron}"
                    )
            diagnostico["grupos"].append({
                "grupo": grupo,
                "grado": map_asignaciones[indices[0]].get("grado") if indices else None,
                "seccion": map_asignaciones[indices[0]].get("seccion") if indices else None,
                "total_horas": total,
                "horas_sin_patron": sin_patron,
                "horas_con_patron": con_patron,
                "capacidad": capacidad,
                "problemas": problemas,
            })

        for doc, indices in sorted(reqs_por_docente.items()):
            total = sum(map_asignaciones[idx]["horas"] for idx in indices)
            libres = NUM_DIAS * num_bloques - bloqueos_por_docente.get(doc, 0)
            problemas = []
            if total > libres:
                problemas.append(f"docente requiere {total} bloques y solo tiene {libres} libres")
            if problemas:
                diagnostico["docentes"].append({
                    "docente": doc,
                    "total_horas": total,
                    "bloques_libres": libres,
                    "problemas": problemas,
                })

        if r_limitar_docente_grado:
            for (doc, grupo), indices in sorted(reqs_por_docente_grado.items()):
                total = sum(map_asignaciones[idx]["horas"] for idx in indices)
                maximo = NUM_DIAS * 3
                if total > maximo:
                    diagnostico["docente_grupo"].append({
                        "docente": doc,
                        "grupo": grupo,
                        "total_horas": total,
                        "maximo": maximo,
                        "problemas": [
                            f"un docente no puede dictar mas de {maximo} bloques semanales en la misma seccion"
                        ],
                    })

        for g in diagnostico["grupos"]:
            if g["problemas"]:
                diagnostico["resumen"].append(
                    f"Grupo {g['grupo']}: " + "; ".join(g["problemas"])
                )
        for d in diagnostico["docentes"]:
            diagnostico["resumen"].append(
                f"Docente {d['docente']}: " + "; ".join(d["problemas"])
            )
        for dg in diagnostico["docente_grupo"]:
            diagnostico["resumen"].append(
                f"Docente {dg['docente']} en grupo {dg['grupo']}: " + "; ".join(dg["problemas"])
            )
        if not diagnostico["resumen"]:
            diagnostico["resumen"].append(
                "No hay una causa simple por conteo. Revisa disponibilidad, patrones de division y combinacion de docentes por seccion."
            )
        return diagnostico

    diagnostico_datos = _diagnosticar_datos()

    _emitir_evento_progreso(
        progress_callback,
        "model_built",
        scenario=progress_scenario,
        required_blocks=total_horas_requeridas,
        variables=len(x),
        elapsed_seconds=time.time() - t0,
    )

    # 5. Configuración del Solver
    # ---------------------------------------------------------
    workers = int(workers)
    if time_limit_seconds is not None:
        time_limit_seconds = float(time_limit_seconds)
        if time_limit_seconds <= 0:
            raise ValueError("time_limit_seconds debe ser mayor que cero")
    if workers <= 0:
        raise ValueError("workers debe ser mayor que cero")
    if random_seed is not None:
        random_seed = int(random_seed)
        if random_seed < 0:
            raise ValueError("random_seed debe ser mayor o igual que cero")

    solver = cp_model.CpSolver()
    if time_limit_seconds is not None:
        solver.parameters.max_time_in_seconds = time_limit_seconds
    solver.parameters.num_search_workers = workers
    if random_seed is not None:
        solver.parameters.random_seed = random_seed
    solver.parameters.log_search_progress = bool(log_search_progress)
    if solver_log_callback is not None and hasattr(solver, "log_callback"):
        solver.log_callback = solver_log_callback
        solver.parameters.log_to_stdout = False

    print("[CP-SAT] Variables creadas:", len(x))
    print("[CP-SAT] Iniciando solver...")
    solver_started_at = time.time()
    _emitir_evento_progreso(
        progress_callback,
        "solver_started",
        scenario=progress_scenario,
        required_blocks=total_horas_requeridas,
        workers=workers,
        time_limit_seconds=time_limit_seconds,
        started_at=solver_started_at,
    )
    solution_callback = None
    if progress_callback is not None:
        solution_callback = StressProgressCallback(
            scenario=progress_scenario,
            required_blocks=total_horas_requeridas,
            x_variables=x,
            start_time=solver_started_at,
            print_interval_seconds=progress_print_interval_seconds,
            progress_callback=progress_callback,
        )
    status = solver.Solve(model, solution_callback)
    solutions_found = solution_callback.solution_count if solution_callback else 0
    _emitir_evento_progreso(
        progress_callback,
        "solver_finished",
        scenario=progress_scenario,
        status=solver.StatusName(status),
        elapsed_seconds=time.time() - solver_started_at,
        solutions_found=solutions_found,
        conflicts=solver.NumConflicts(),
        branches=solver.NumBranches(),
        wall_time=solver.WallTime(),
    )

    # 6. Construcción de la Salida (Formato idéntico al original)
    # ---------------------------------------------------------
    
    # Inicializar estructura de salida vacía
    horario_salida = {d: {b: {} for b in range(num_bloques)} for d in range(NUM_DIAS)}
    
    fallidos = 0
    asignaciones_exitosas = 0
    asignaciones_programadas = []
    
    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        print(f"[CP-SAT] Solución encontrada: {solver.StatusName(status)}")
        
        for idx, req in enumerate(map_asignaciones):
            c_id = req['curso']
            grupo_id = req['grupo']
            d_id = req['docente'] # No se usa en la estructura final visual, pero útil saberlo
            
            horas_asignadas_curso = 0
            for d in range(NUM_DIAS):
                for b in range(num_bloques):
                    if solver.Value(x[(idx, d, b)]) == 1:
                        # Asignar en la estructura
                        horario_salida[d][b][grupo_id] = c_id
                        horas_asignadas_curso += 1
                        asignaciones_exitosas += 1
                        asignaciones_programadas.append({
                            "asignacion_idx": idx,
                            "curso": c_id,
                            "grupo": grupo_id,
                            "docente": d_id,
                            "dia": d,
                            "bloque": b,
                        })
            
            if horas_asignadas_curso < req['horas']:
                # Esto no debería pasar si status es FEASIBLE, pero por seguridad
                fallidos += (req['horas'] - horas_asignadas_curso)
    else:
        print("[CP-SAT] No se encontró solución factible con las restricciones actuales.")
        print("========== DIAGNOSTICO INFACTIBILIDAD ==========")
        for linea in diagnostico_datos.get("resumen", [])[:30]:
            print("-", linea)
        print("===============================================")
        fallidos = total_horas_requeridas # Todo falló

    # Estadisticas verificables para el reporte
    faltan_3h = []
    tiempo_ejecucion = time.time() - t0
    estado_solver = solver.StatusName(status)
    metricas = calcular_metricas_solucion(
        map_asignaciones=map_asignaciones,
        asignaciones_programadas=asignaciones_programadas,
        bloqueos=bloqueos,
        docentes=docentes,
        tiempo_ejecucion_segundos=tiempo_ejecucion,
        estado_solver=estado_solver,
        num_conflicts=solver.NumConflicts(),
        num_branches=solver.NumBranches(),
        tiempo_solver_segundos=solver.WallTime(),
    )
    metricas["time_limit_seconds"] = time_limit_seconds
    metricas["workers"] = workers
    metricas["random_seed"] = random_seed
    metricas["solutions_found"] = solutions_found

    print(f"[INFO] Total asignado: {metricas['bloques_asignados']} bloques")
    print("\n================ METRICAS PARA TESIS ================")
    print(f"Bloques requeridos: {metricas['bloques_requeridos']}")
    print(f"Bloques asignados: {metricas['bloques_asignados']}")
    print(f"Conflictos docentes: {metricas['conflictos_docentes']}")
    print(f"Conflictos por grupo: {metricas['conflictos_grupo']}")
    print(f"Violaciones de disponibilidad: {metricas['violaciones_disponibilidad']}")
    print(f"Violaciones de carga: {metricas['violaciones_carga']}")
    print(f"Tiempo de ejecucion: {metricas['tiempo_ejecucion_segundos']:.3f} segundos")
    print(f"Estado del solver: {metricas['estado_solver']}")
    print(f"NumConflicts: {metricas['num_conflicts']}")
    print(f"NumBranches: {metricas['num_branches']}")
    print("=====================================================\n")

    faltan_2h = []
    
    return {
        "horario": horario_salida,
        "asignaciones_exitosas": asignaciones_exitosas,
        "asignaciones_fallidas": fallidos,
        "total_bloques_asignados": asignaciones_exitosas,
        "faltan_3h": faltan_3h, # CP-SAT maneja esto internamente, devolvemos vacio
        "faltan_2h": faltan_2h,
        "status": estado_solver,
        "metricas": metricas,
        "diagnostico": diagnostico_datos,
    }


def generar_horario(
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
    random_seed=None,
    log_search_progress=False,
    solver_log_callback=None,
    progress_scenario="CP-SAT",
    progress_print_interval_seconds=60,
):
    return generar_horario_cp(
        docentes=docentes,
        asignaciones=asignaciones,
        restricciones=restricciones,
        horas_curso_grado=horas_curso_grado,
        nivel=nivel,
        version=version,
        patrones_division=patrones_division,
        progress_callback=progress_callback,
        time_limit_seconds=time_limit_seconds,
        workers=workers,
        random_seed=random_seed,
        log_search_progress=log_search_progress,
        solver_log_callback=solver_log_callback,
        progress_scenario=progress_scenario,
        progress_print_interval_seconds=progress_print_interval_seconds,
    )
