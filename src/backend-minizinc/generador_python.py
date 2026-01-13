from ortools.sat.python import cp_model
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


def generar_horario_cp(docentes, asignaciones, restricciones, horas_curso_grado, nivel="Secundaria"):
    model = cp_model.CpModel()

    # ======== Reglas desde UI ========
    reglas = (restricciones or {}).get("reglas", {}) or {}
    r_disp = bool(reglas.get("disponibilidad_docente", True))
    r_nosolape = bool(reglas.get("no_solape_docente", True))

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

    for c in C:
        for g in G:
            for d in D:
                for h in H:
                    x[(c, g, d, h)] = model.NewBoolVar(f"x_c{c}_g{g}_d{d}_h{h}")

            s[(c, g)] = model.NewIntVar(0, Hreq[(c, g)], f"s_c{c}_g{g}")

    # ======== 1) Carga horaria exacta con slack ========
    for c in C:
        for g in G:
            model.Add(
                sum(x[(c, g, d, h)] for d in D for h in H) + s[(c, g)] == Hreq[(c, g)]
            )
            # Limitar carga diaria para forzar distribución (evita concentrar todas las horas en un día)
            for d in D:
                model.Add(sum(x[(c, g, d, h)] for h in H) <= 3)
            # Limitar carga diaria para forzar distribución (evita meter todas las horas de un curso en un solo día)
            for d in D:
                model.Add(sum(x[(c, g, d, h)] for h in H) <= 3)  # máx 3 bloques por día

    # ======== 2) Un curso por grado y bloque ========
    for g in G:
        for d in D:
            for h in H:
                model.Add(
                    sum(x[(c, g, d, h)] for c in C) <= 1
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

    for c in C:
        for g in G:
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

    # ======== 5) Bloques consecutivos por curso/grado/día (evita 1-0-1) ========
    for c in C:
        for g in G:
            for d in D:
                for h1 in range(NUM_BLOQUES):
                    for h3 in range(h1 + 2, NUM_BLOQUES):
                        for h2 in range(h1 + 1, h3):
                            model.Add(
                                x[(c, g, d, h1)] + x[(c, g, d, h3)] - x[(c, g, d, h2)] <= 1
                            )

    # ======== 5) Limitar carga diaria por docente/grado (evita saturar un grado con varios cursos del mismo docente) ========
    MAX_POR_DIA_DOCENTE_GRADO = 3
    for p in {prof[k] for k in prof}:
        for g in G:
            for d in D:
                model.Add(
                    sum(
                        x[(c, g, d, h)]
                        for c in C
                        if prof.get((c, g)) == p
                        for h in H
                    ) <= MAX_POR_DIA_DOCENTE_GRADO
                )

    # ======== 6) Prohibir sesiones sueltas (evitar bloques aislados de 1 hora) por curso/grado/día ========
    for c in C:
        for g in G:
            for d in D:
                ones = sum(x[(c, g, d, h)] for h in H)
                b0 = model.NewBoolVar(f"c{c}_g{g}_d{d}_es0")
                bge2 = model.NewBoolVar(f"c{c}_g{g}_d{d}_ge2")
                model.Add(ones == 0).OnlyEnforceIf(b0)
                model.Add(ones != 0).OnlyEnforceIf(b0.Not())
                model.Add(ones >= 2).OnlyEnforceIf(bge2)
                model.Add(ones <= 1).OnlyEnforceIf(bge2.Not())
                model.AddBoolOr([b0, bge2])

    # ======== Penalización por fragmentar bloques (preferir consecutivos) ========
    # Prioriza bloques agrupados aunque eso implique dejar horas sin asignar.
    break_vars = []
    for c in C:
        for g in G:
            for d in D:
                for h in range(1, NUM_BLOQUES):
                    bvar = model.NewBoolVar(f"break_c{c}_g{g}_d{d}_h{h}")
                    model.Add(x[(c, g, d, h)] - x[(c, g, d, h - 1)] <= bvar)
                    model.Add(x[(c, g, d, h - 1)] - x[(c, g, d, h)] <= bvar)
                    break_vars.append(bvar)

    # ======== Penalizar huecos intermedios (preferir huecos al final del día) ========
    gap_vars = []
    for g in G:
        for d in D:
            for h in range(NUM_BLOQUES - 1):
                tiene_clase_despues = model.NewBoolVar(f"after_c{g}_d{d}_h{h}")
                model.Add(sum(x[(c, g, d, hh)] for c in C for hh in range(h + 1, NUM_BLOQUES)) >= 1).OnlyEnforceIf(tiene_clase_despues)
                model.Add(sum(x[(c, g, d, hh)] for c in C for hh in range(h + 1, NUM_BLOQUES)) == 0).OnlyEnforceIf(tiene_clase_despues.Not())
                gap = model.NewBoolVar(f"gap_c{g}_d{d}_h{h}")
                model.Add(sum(x[(c, g, d, h)] for c in C) == 0).OnlyEnforceIf(gap)
                model.Add(sum(x[(c, g, d, h)] for c in C) >= 1).OnlyEnforceIf(gap.Not())
                gap_vars.append(model.NewBoolVar(f"gap_active_c{g}_d{d}_h{h}"))
                model.AddBoolAnd([gap, tiene_clase_despues]).OnlyEnforceIf(gap_vars[-1])
                model.AddBoolOr([gap.Not(), tiene_clase_despues.Not()]).OnlyEnforceIf(gap_vars[-1].Not())

    # ======== OBJETIVO: completar horas primero, luego calidad ========
    # Penalizamos muy fuerte el slack (horas faltantes), luego huecos y fragmentacion.
    model.Minimize(100000 * sum(s.values()) + 200 * sum(gap_vars) + 50 * sum(break_vars))

    # ======== RESOLVER ========
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 120
    solver.parameters.num_search_workers = 8

    status = solver.Solve(model)

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

    return {
        "horario": horario,
        "detalle_asignaciones": detalle,
        "total_asignado": total_asignado,
        "total_requerido": sum(Hreq.values()),
        "asignaciones_fallidas": asignaciones_fallidas,
        "estado_solver": status,
        "optimo": status == cp_model.OPTIMAL,
    }


# Wrapper para mantener la firma esperada por app.py
def generar_horario(docentes, asignaciones, restricciones, horas_curso_grado, nivel="Secundaria"):
    return generar_horario_cp(docentes, asignaciones, restricciones, horas_curso_grado, nivel)  
