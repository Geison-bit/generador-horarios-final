from ortools.sat.python import cp_model
import time
import threading
import unicodedata

# Lista de días; se usará normalizada para comparar claves con o sin tilde.
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes"]
NUM_DIAS = 5
NUM_BLOQUES = 8


def _normalize(s: str) -> str:
    if s is None:
        return ""
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode("ascii").lower()


# Particiones pedagógicas sugeridas para repartir horas en bloques consecutivos
def dividir_horas(horas: int):
    if horas <= 1:
        return []
    if horas == 2:
        return [[2]]
    if horas == 3:
        return [[3]]
    if horas == 4:
        return [[2, 2]]
    if horas == 5:
        return [[3, 2], [2, 3]]
    if horas == 6:
        return [[3, 3], [2, 2, 2]]
    if horas == 7:
        return [[3, 2, 2], [2, 3, 2], [2, 2, 3]]
    if horas == 8:
        return [[3, 3, 2], [3, 2, 3], [2, 3, 3], [2, 2, 2, 2]]
    # fallback
    return [[horas]]


def generar_horario_cp(docentes, asignaciones, restricciones, horas_curso_grado, nivel="Secundaria", progress_callback=None):
    model = cp_model.CpModel()

    # ======== Reglas desde UI ========
    reglas = (restricciones or {}).get("reglas", {}) or {}
    r_disp = bool(reglas.get("disponibilidad_docente", True))
    r_nosolape = bool(reglas.get("no_solape_docente", True))
    r_limitar_carga = bool(
        reglas.get("distribuir_en_dias_distintos",
        reglas.get("limitar_carga_diaria", True))
    )
    r_limitar_docente_grado = bool(reglas.get("limitar_carga_docente_grado", True))
    r_prohibir_1h = bool(reglas.get("prohibir_sesiones_1h", False))
    r_mejorar_continuidad = bool(
        reglas.get("bloques_consecutivos",
        reglas.get("mejorar_continuidad", True))
    )
    r_no_puentes = bool(reglas.get("no_puentes_docente", True))
    r_no_dias_consecutivos = bool(reglas.get("no_dias_consecutivos", True))

    disponibilidad_map = (restricciones or {}).get("disponibilidad", restricciones or {})

    # ======== Conjuntos ========
    C = []
    G = set()
    prof = {}
    Hreq = {}

    regla_omitir_cursos_1h = bool(reglas.get("omitir_cursos_1h", True))

    for curso_id, grados in asignaciones.items():
        curso_id = int(curso_id)
        C.append(curso_id)

        for grado_str, datos in grados.items():
            grado = int(grado_str)
            docente_id = int(datos["docente_id"])
            G.add(grado)

            prof[(curso_id, grado)] = docente_id
            horas_req = int((horas_curso_grado.get(str(curso_id), {}) or {}).get(str(grado), 0))
            if regla_omitir_cursos_1h and horas_req <= 1:
                horas_req = 0
            Hreq[(curso_id, grado)] = horas_req

    G = sorted(list(G))
    D = list(range(NUM_DIAS))
    H = list(range(NUM_BLOQUES))

    # ======== Variables ========
    x = {}
    s = {}
    pares = list(Hreq.keys())

    for c, g in pares:
        for d in D:
            for h in H:
                x[(c, g, d, h)] = model.NewBoolVar(f"x_c{c}_g{g}_d{d}_h{h}")

        s[(c, g)] = model.NewIntVar(0, Hreq[(c, g)], f"s_c{c}_g{g}")

    # ======== 1) Carga horaria exacta con slack ========
    for c, g in pares:
        model.Add(
            sum(x[(c, g, d, h)] for d in D for h in H) + s[(c, g)] == Hreq[(c, g)]
        )
        if r_limitar_carga:
            for d in D:
                model.Add(sum(x[(c, g, d, h)] for h in H) <= 3)

    # ======== 2) Un curso por grado y bloque ========
    for g in G:
        for d in D:
            for h in H:
                model.Add(
                    sum(x[(c, g, d, h)] for (c, g2) in pares if g2 == g) <= 1
                )

    # ======== 3) Disponibilidad docente ========
    def disponible(docente, d, h):
        if not r_disp or nivel == "Primaria":
            return True
        reglas_doc = disponibilidad_map.get(str(docente), {})
        # Si no hay mapa para este docente, no restringimos (disponible por defecto)
        if not reglas_doc:
            return True
        key1 = f"{DIAS[d]}-{h}"
        key2 = f"{_normalize(DIAS[d])}-{h}"
        return bool(reglas_doc.get(key1) or reglas_doc.get(key2))

    if r_disp and nivel != "Primaria":
        for c, g in pares:
            p = prof[(c, g)]
            for d in D:
                for h in H:
                    if not disponible(p, d, h):
                        model.Add(x[(c, g, d, h)] == 0)

    # ======== 4) No solape de docente ========
    if r_nosolape:
        for p in {prof[k] for k in prof}:
            for d in D:
                for h in H:
                    model.Add(
                        sum(
                            x[(c, g, d, h)]
                            for (c, g), dp in prof.items()
                            if dp == p
                        ) <= 1
                    )

    # ======== 4.1) Evitar puentes del docente (sin huecos intermedios) ========
    if r_no_puentes:
        docentes_ids = {prof[k] for k in prof}
        for p in docentes_ids:
            for d in D:
                def docente_slot(h):
                    return sum(
                        x[(c, g, d, h)]
                        for (c, g), dp in prof.items()
                        if dp == p
                    )
                for h1 in range(NUM_BLOQUES - 1):
                    for h3 in range(h1 + 2, NUM_BLOQUES):
                        for h2 in range(h1 + 1, h3):
                            model.Add(docente_slot(h1) + docente_slot(h3) - docente_slot(h2) <= 1)

    # ======== 5) Bloques consecutivos por curso/grado/dia (evita 1-0-1) ========
    if r_mejorar_continuidad:
        for c, g in pares:
            for d in D:
                for h1 in range(NUM_BLOQUES):
                    for h3 in range(h1 + 2, NUM_BLOQUES):
                        for h2 in range(h1 + 1, h3):
                            model.Add(
                                x[(c, g, d, h1)] + x[(c, g, d, h3)] - x[(c, g, d, h2)] <= 1
                            )

    # ======== 5) Limitar carga diaria por docente/grado (evita saturar un grado con varios cursos del mismo docente) ========
    MAX_POR_DIA_DOCENTE_GRADO = 3
    if r_limitar_docente_grado:
        for p in {prof[k] for k in prof}:
            for g in G:
                for d in D:
                    model.Add(
                        sum(
                            x[(c2, g2, d, h)]
                            for (c2, g2), dp in prof.items()
                            if dp == p and g2 == g
                            for h in H
                        ) <= MAX_POR_DIA_DOCENTE_GRADO
                    )

    # ======== 6) Prohibir sesiones sueltas (evitar bloques aislados de 1 hora) por curso/grado/dia ========
    if r_prohibir_1h:
        for c, g in pares:
            for d in D:
                ones = sum(x[(c, g, d, h)] for h in H)
                b0 = model.NewBoolVar(f"c{c}_g{g}_d{d}_es0")
                bge2 = model.NewBoolVar(f"c{c}_g{g}_d{d}_ge2")
                model.Add(ones == 0).OnlyEnforceIf(b0)
                model.Add(ones != 0).OnlyEnforceIf(b0.Not())
                model.Add(ones >= 2).OnlyEnforceIf(bge2)
                model.Add(ones <= 1).OnlyEnforceIf(bge2.Not())
                model.AddBoolOr([b0, bge2])

    # ======== 7) Evitar dias consecutivos por curso/grado (solo >4 horas) ========
    consec_day_vars = []
    if r_no_dias_consecutivos:
        for c, g in pares:
            if Hreq[(c, g)] <= 4:
                continue
            day_has = []
            for d in D:
                has = model.NewBoolVar(f"has_c{c}_g{g}_d{d}")
                model.Add(sum(x[(c, g, d, h)] for h in H) >= 1).OnlyEnforceIf(has)
                model.Add(sum(x[(c, g, d, h)] for h in H) == 0).OnlyEnforceIf(has.Not())
                day_has.append(has)
            # No permitir 3 dias seguidos
            for d in range(NUM_DIAS - 2):
                model.Add(day_has[d] + day_has[d + 1] + day_has[d + 2] <= 2)
            # Penalizar dias consecutivos (si no se puede, se permiten)
            adj_vars = []
            for d in range(NUM_DIAS - 1):
                adj = model.NewBoolVar(f"adj_c{c}_g{g}_d{d}")
                model.Add(day_has[d] + day_has[d + 1] == 2).OnlyEnforceIf(adj)
                model.Add(day_has[d] + day_has[d + 1] <= 1).OnlyEnforceIf(adj.Not())
                adj_vars.append(adj)
                consec_day_vars.append(adj)
            # Si el curso tiene 7h o mas, permitir solo 1 par consecutivo
            if Hreq[(c, g)] >= 7:
                model.Add(sum(adj_vars) <= 1)

    # ======== Penalizacion por fragmentar bloques (preferir consecutivos) ========
    # Prioriza bloques agrupados aunque eso implique dejar horas sin asignar.
    break_vars = []
    if r_mejorar_continuidad:
        for c, g in pares:
            for d in D:
                for h in range(1, NUM_BLOQUES):
                    bvar = model.NewBoolVar(f"break_c{c}_g{g}_d{d}_h{h}")
                    model.Add(x[(c, g, d, h)] - x[(c, g, d, h - 1)] <= bvar)
                    model.Add(x[(c, g, d, h - 1)] - x[(c, g, d, h)] <= bvar)
                    break_vars.append(bvar)

    # ======== Penalizar huecos intermedios (preferir huecos al final del dia) ========
    gap_vars = []
    if r_mejorar_continuidad:
        for g in G:
            for d in D:
                for h in range(NUM_BLOQUES - 1):
                    tiene_clase_despues = model.NewBoolVar(f"after_g{g}_d{d}_h{h}")
                    model.Add(
                        sum(
                            x[(c, g, d, hh)]
                            for (c, g2) in pares
                            if g2 == g
                            for hh in range(h + 1, NUM_BLOQUES)
                        ) >= 1
                    ).OnlyEnforceIf(tiene_clase_despues)
                    model.Add(
                        sum(
                            x[(c, g, d, hh)]
                            for (c, g2) in pares
                            if g2 == g
                            for hh in range(h + 1, NUM_BLOQUES)
                        ) == 0
                    ).OnlyEnforceIf(tiene_clase_despues.Not())
                    gap = model.NewBoolVar(f"gap_g{g}_d{d}_h{h}")
                    model.Add(sum(x[(c, g, d, h)] for (c, g2) in pares if g2 == g) == 0).OnlyEnforceIf(gap)
                    model.Add(sum(x[(c, g, d, h)] for (c, g2) in pares if g2 == g) >= 1).OnlyEnforceIf(gap.Not())
                    gv = model.NewBoolVar(f"gap_active_g{g}_d{d}_h{h}")
                    model.AddBoolAnd([gap, tiene_clase_despues]).OnlyEnforceIf(gv)
                    model.AddBoolOr([gap.Not(), tiene_clase_despues.Not()]).OnlyEnforceIf(gv.Not())
                    gap_vars.append(gv)

    # ======== OBJETIVO: completar horas primero, luego calidad ========
    # Penalizamos muy fuerte el slack (horas faltantes).
    if r_mejorar_continuidad or r_no_dias_consecutivos:
        model.Minimize(
            100000 * sum(s.values())
            + 200 * sum(gap_vars)
            + 50 * sum(break_vars)
            + 80 * sum(consec_day_vars)
        )
    else:
        model.Minimize(100000 * sum(s.values()))

    # ======== RESOLVER ========
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 1200
    solver.parameters.num_search_workers = 8

    stop_event = threading.Event()

    def _progress_timer():
        if not progress_callback:
            return
        t_start = time.perf_counter()
        max_time = solver.parameters.max_time_in_seconds or 1
        while not stop_event.is_set():
            elapsed = time.perf_counter() - t_start
            pct = min(95, int((elapsed / max_time) * 100))
            progress_callback(pct, "resolviendo")
            time.sleep(1)

    timer_thread = None
    if progress_callback:
        progress_callback(5, "armando_modelo")
        timer_thread = threading.Thread(target=_progress_timer, daemon=True)
        timer_thread.start()

    t0 = time.perf_counter()
    status = solver.Solve(model)
    t1 = time.perf_counter()
    stop_event.set()
    if timer_thread:
        timer_thread.join(timeout=1)
    if progress_callback:
        progress_callback(100, "finalizado")

    horario = {d: {h: {} for h in H} for d in D}

    total_asignado = 0
    asignaciones_fallidas = 0
    detalle = []

    for (c, g) in Hreq:
        horas_asig = sum(solver.Value(x[(c, g, d, h)]) for d in D for h in H)
        slack = solver.Value(s[(c, g)])
        docente = prof[(c, g)]

        if slack > 0:
            asignaciones_fallidas += 1

        for d in D:
            for h in H:
                if solver.Value(x[(c, g, d, h)]) == 1:
                    horario[d][h][g] = c
                    total_asignado += 1

        detalle.append({
            "curso_id": c,
            "grado_id": g,
            "docente_id": docente,
            "horas_asignadas": horas_asig,
            "horas_requeridas": Hreq[(c, g)],
            "horas_faltantes": slack,
            "ok": slack == 0
        })

    # Log resumido: qué cursos quedaron incompletos
    incompletos = [d for d in detalle if not d["ok"]]
    if incompletos:
        print("⚠️ Cursos con horas faltantes:")
        for d in incompletos:
            faltan = d["horas_faltantes"]
            print(f" - Curso {d['curso_id']} grado {d['grado_id']}: faltan {faltan} hora(s)")
    else:
        print("✅ Todos los cursos asignados completamente.")

    # ======== Metricas tipo consola ========
    total_requerido = sum(Hreq.values())
    total_bloques_asignados = total_asignado
    p = (total_bloques_asignados / total_requerido) if total_requerido > 0 else 0.0
    asignaciones_exitosas = len(detalle) - asignaciones_fallidas
    conflictos = solver.NumConflicts()
    cumplimiento = "TOTAL" if asignaciones_fallidas == 0 else "PARCIAL"

    p0 = 1.0
    var = (1.0 / (4.0 * total_requerido)) if total_requerido > 0 else 0.0
    se = var ** 0.5
    z = ((p - p0) / se) if se > 0 else 0.0
    sig = abs(z) >= 1.96

    print(f"\n[INFO] Total asignado: {total_bloques_asignados} bloques")
    print("\n================= METRICAS PARA TESIS =================")
    print(f"Bloques requeridos: {total_requerido}")
    print(f"Bloques asignados: {total_bloques_asignados}")
    print(f"Proporcion de asignacion (p): {p:.3f} ({p*100:.2f}%)")
    print(f"Conflictos detectados: {conflictos}")
    print(f"Asignaciones exitosas: {asignaciones_exitosas}")
    print(f"Asignaciones con deficit: {asignaciones_fallidas}")
    print(f"Cumplimiento de restricciones duras: {cumplimiento}")

    print("\n--- Test Estadistico Z para proporcion de bloques asignados ---")
    print("Valor ideal esperado (p0): 1.0")
    print(f"Varianza estimada (rule of continuity): Var = 1/(4n) = {var:.6f}")
    print(f"Desviacion estandar (SE): sqrt(Var) = {se:.4f}")
    print("\nCalculo con formula:")
    print("Z = (p - p0) / SE")
    print(f"Z = ({p:.3f} - 1.0) / {se:.4f}")
    print(f"Z calculado = {z:.3f}")
    print("\nInterpretacion:")
    if sig:
        print("La diferencia ES estadisticamente significativa (p <= 0.05).")
        print("El sistema NO alcanza el 100% esperado.")
    else:
        print("La diferencia NO es estadisticamente significativa (p > 0.05).")
        print("El sistema mantiene un nivel de asignacion compatible con el 100% esperado.")

    print(f"\nTiempo de generacion: {t1 - t0:.3f} segundos")
    print("=========================================================")

    return {
        "horario": horario,
        "detalle_asignaciones": detalle,
        "total_asignado": total_asignado,
        "total_bloques_asignados": total_bloques_asignados,
        "total_requerido": total_requerido,
        "asignaciones_fallidas": asignaciones_fallidas,
        "asignaciones_exitosas": asignaciones_exitosas,
        "conflictos": conflictos,
        "proporcion_asignacion": p,
        "tiempo_generacion": t1 - t0,
        "estado_solver": status,
        "optimo": status == cp_model.OPTIMAL,
    }


# Wrapper para mantener la firma esperada por app.py
def generar_horario(docentes, asignaciones, restricciones, horas_curso_grado, nivel="Secundaria", progress_callback=None):
    return generar_horario_cp(
        docentes,
        asignaciones,
        restricciones,
        horas_curso_grado,
        nivel,
        progress_callback=progress_callback,
    )
