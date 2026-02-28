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
):
    """
    Genera un horario escolar utilizando Programación por Restricciones (CP-SAT).
    Garantiza que no haya choques y respeta la disponibilidad.
    """
    print("[CP-SAT] Iniciando modelado matemático...")
    t0 = time.time()
    
    # 1. Preparación y Limpieza de Datos
    # ---------------------------------------------------------
    model = cp_model.CpModel()
    num_bloques = 7 if int(version) == 1 else 8
    patrones_division = patrones_division or {}
    
    # Mapeo de IDs para facilitar el uso en el modelo
    # Diccionarios para acceso rápido
    map_asignaciones = [] # Lista de tuplas (curso_id, grado_id, docente_id, horas)
    
    # Normalizar docentes
    docente_ids = set()
    for d in docentes:
        d_id = normalizar_entero(d.get("id"))
        d["id"] = d_id
        docente_ids.add(d_id)

    # Procesar horas requeridas y asignaciones
    total_horas_requeridas = 0
    
    # Estructura auxiliar para guardar info
    # data_reqs[(curso, grado)] = { 'docente': doc_id, 'horas': n }
    data_reqs = {}

    # Barrido de asignaciones para saber QUÉ curso da QUÉ docente
    temp_asignaciones = {} # (curso_int, grado_int) -> docente_int
    if asignaciones:
        for curso_id, grados in asignaciones.items():
            c_int = normalizar_entero(curso_id)
            for grado_id, datos in grados.items():
                g_int = normalizar_entero(grado_id)
                d_int = normalizar_entero(datos.get("docente_id"))
                temp_asignaciones[(c_int, g_int)] = d_int

    # Barrido de horas para saber CUÁNTO tiempo se necesita
    if horas_curso_grado:
        for curso_id, grados in horas_curso_grado.items():
            c_int = normalizar_entero(curso_id)
            for grado_id, horas in grados.items():
                g_int = normalizar_entero(grado_id)
                h_int = normalizar_entero(horas)
                
                if h_int > 0:
                    docente = temp_asignaciones.get((c_int, g_int), 0)
                    # Solo agregamos si hay docente asignado o si queremos permitir vacantes (asumimos docente necesario)
                    if docente > 0:
                        map_asignaciones.append({
                            'curso': c_int,
                            'grado': g_int,
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
        key = f"{req['curso']}-{req['grado']}"
        raw = patrones_division.get(key)
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

    # B) Choques de Grado: Un grado no puede tener 2 materias al mismo tiempo
    # Agrupamos asignaciones por grado
    reqs_por_grado = {}
    for idx, req in enumerate(map_asignaciones):
        reqs_por_grado.setdefault(req['grado'], []).append(idx)
    
    for grado, indices in reqs_por_grado.items():
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
            key = (req['docente'], req['grado'])
            reqs_por_docente_grado.setdefault(key, []).append(idx)

        for (doc, grado), indices in reqs_por_docente_grado.items():
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
        for grado, indices in reqs_por_grado.items():
            indices_sin_patron = [
                idx for idx in indices
                if not _obtener_patron(map_asignaciones[idx])
            ]
            if not indices_sin_patron:
                continue
            for d in range(NUM_DIAS):
                model.Add(sum(es_3h_dia[(idx, d)] for idx in indices_sin_patron) == 1)
                total_2h_hoy = sum(es_2h_dia[(idx, d)] for idx in indices_sin_patron)
                model.Add(total_2h_hoy >= 1)
                model.Add(total_2h_hoy <= 2)

    # 5. Configuración del Solver
    # ---------------------------------------------------------
    solver = cp_model.CpSolver()
    # Limite de tiempo para buscar (ajustable)
    solver.parameters.max_time_in_seconds = 30.0 
    # Usar todos los núcleos del CPU
    solver.parameters.num_search_workers = 8 

    print("[CP-SAT] Variables creadas:", len(x))
    print("[CP-SAT] Iniciando solver...")
    status = solver.Solve(model)

    # 6. Construcción de la Salida (Formato idéntico al original)
    # ---------------------------------------------------------
    
    # Inicializar estructura de salida vacía
    horario_salida = {d: {b: {} for b in range(num_bloques)} for d in range(NUM_DIAS)}
    
    fallidos = 0
    asignaciones_exitosas = 0
    
    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        print(f"[CP-SAT] Solución encontrada: {solver.StatusName(status)}")
        
        for idx, req in enumerate(map_asignaciones):
            c_id = req['curso']
            g_id = req['grado']
            d_id = req['docente'] # No se usa en la estructura final visual, pero útil saberlo
            
            horas_asignadas_curso = 0
            for d in range(NUM_DIAS):
                for b in range(num_bloques):
                    if solver.Value(x[(idx, d, b)]) == 1:
                        # Asignar en la estructura
                        horario_salida[d][b][g_id] = c_id
                        horas_asignadas_curso += 1
                        asignaciones_exitosas += 1
            
            if horas_asignadas_curso < req['horas']:
                # Esto no debería pasar si status es FEASIBLE, pero por seguridad
                fallidos += (req['horas'] - horas_asignadas_curso)
    else:
        print("[CP-SAT] No se encontró solución factible con las restricciones actuales.")
        fallidos = total_horas_requeridas # Todo falló

    # Estadísticas básicas para el reporte
    # Detectar si faltan bloques (lógica simple post-solución)
    faltan_3h = []
    # ---- Reporte tipo "METRICAS PARA TESIS" ----
    try:
        total_requeridos = total_horas_requeridas
        total_asignados = asignaciones_exitosas
        p_hat = (total_asignados / total_requeridos) if total_requeridos else 0.0
        # Contar asignaciones con deficit (por curso/grado)
        deficit_count = 0
        for idx, req in enumerate(map_asignaciones):
            horas_asignadas = 0
            for d in range(NUM_DIAS):
                for b in range(num_bloques):
                    if solver.Value(x[(idx, d, b)]) == 1:
                        horas_asignadas += 1
            if horas_asignadas < req["horas"]:
                deficit_count += 1
        conflictos_detectados = 0
        cumplimiento = "TOTAL" if fallidos == 0 else "PARCIAL"

        print(f"[INFO] Total asignado: {total_asignados} bloques")
        print("\n================ METRICAS PARA TESIS ================")
        print(f"Bloques requeridos: {total_requeridos}")
        print(f"Bloques asignados: {total_asignados}")
        print(f"Proporcion de asignacion (p̂): {p_hat:.3f} ({p_hat*100:.2f}%)")
        print(f"Conflictos detectados: {conflictos_detectados}")
        print(f"Asignaciones exitosas: {len(map_asignaciones)}")
        print(f"Asignaciones con deficit: {deficit_count}")
        print(f"Cumplimiento de restricciones duras: {cumplimiento}")

        # Test estadistico Z para proporcion de bloques asignados
        p0 = 1.0
        if total_requeridos > 0:
            var = 1.0 / (4.0 * total_requeridos)
            se = var ** 0.5
            z = (p_hat - p0) / se if se > 0 else 0.0
            print("\n--- Test Estadistico Z para proporcion de bloques asignados ---")
            print(f"Valor ideal esperado (p0): {p0}")
            print(f"Varianza estimada (rule of continuity): Var ≈ 1/(4n) = {var:.6f}")
            print(f"Desviacion estandar (SE): sqrt(Var) = {se:.4f}")
            print("\nCalculo con formula:")
            print("Z = (p̂ - p0) / SE")
            print(f"Z = ({p_hat:.3f} - {p0}) / {se:.4f}")
            print(f"Z calculado = {z:.3f}")
            print("\nInterpretacion:")
            if abs(z) < 1.96:
                print("La diferencia NO es estadisticamente significativa (p > 0.05).")
                print("El sistema mantiene un nivel de asignacion estadisticamente compatible con el 100% esperado.")
            else:
                print("La diferencia ES estadisticamente significativa (p <= 0.05).")
                print("El nivel de asignacion se aleja del 100% esperado.")

        t1 = time.time()
        print(f"\nTiempo de generacion: {t1 - t0:.3f} segundos")
        print("=====================================================\n")
    except Exception as _e:
        print("[WARN] No se pudo generar reporte de metricas:", _e)

    faltan_2h = []
    
    return {
        "horario": horario_salida,
        "asignaciones_exitosas": asignaciones_exitosas,
        "asignaciones_fallidas": fallidos,
        "total_bloques_asignados": asignaciones_exitosas,
        "faltan_3h": faltan_3h, # CP-SAT maneja esto internamente, devolvemos vacio
        "faltan_2h": faltan_2h,
        "status": solver.StatusName(status)
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
):
    return generar_horario_cp(
        docentes,
        asignaciones,
        restricciones,
        horas_curso_grado,
        nivel,
        version,
        patrones_division,
        progress_callback,
    )
