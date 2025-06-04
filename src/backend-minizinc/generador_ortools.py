from ortools.sat.python import cp_model
from itertools import product

NUM_DIAS = 5
NUM_BLOQUES = 8
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes"]

def dividir_horas(horas):
    if horas <= 1:
        return []
    if horas == 2: return [[2]]
    if horas == 3: return [[3]]
    if horas == 4: return [[2, 2]]
    if horas == 5: return [[2, 3], [3, 2]]
    if horas == 6: return [[3, 3], [2, 2, 2]]
    if horas == 7: return [[2, 2, 3], [2, 3, 2], [3, 2, 2]]
    return [[horas]]

def generar_horario(docentes, asignaciones, restricciones, horas_curso_grado, nivel="Secundaria"):
    model = cp_model.CpModel()

    grados_ids = list(range(1, 6)) if nivel == "Secundaria" else list(range(6, 12))
    curso_grado_combos = []
    docente_grado = {}

    for curso_id in asignaciones:
        for grado in asignaciones[curso_id]:
            horas = horas_curso_grado.get(str(curso_id), {}).get(str(grado), 0)
            if horas > 1:
                curso_grado_combos.append((int(curso_id), int(grado)))
                docente_grado[(int(curso_id), int(grado))] = asignaciones[curso_id][grado]['docente_id']

    x = {
        (curso_id, grado, d, b): model.NewBoolVar(f"x_{curso_id}_{grado}_{d}_{b}")
        for curso_id, grado in curso_grado_combos
        for d in range(NUM_DIAS)
        for b in range(NUM_BLOQUES)
    }

    for curso_id, grado in sorted(curso_grado_combos, key=lambda cg: -horas_curso_grado[str(cg[0])][str(cg[1])]):
        horas = horas_curso_grado[str(curso_id)][str(grado)]
        combinaciones = dividir_horas(horas)
        uso_vars = []

        for d in range(NUM_DIAS):
            for comb in combinaciones:
                if any(seg == 1 for seg in comb): continue
                inicios_validos = [range(NUM_BLOQUES - l + 1) for l in comb]
                for inicios in product(*inicios_validos):
                    if len(set(inicios)) < len(inicios): continue
                    bloques_total = []
                    for i, inicio in enumerate(inicios):
                        bloques_total += list(range(inicio, inicio + comb[i]))
                    if max(bloques_total, default=-1) >= NUM_BLOQUES: continue

                    var = model.NewBoolVar(f"u_{curso_id}_{grado}_{d}_{'_'.join(map(str, bloques_total))}")
                    uso_vars.append(var)
                    for b in range(NUM_BLOQUES):
                        model.Add(x[curso_id, grado, d, b] == int(b in bloques_total)).OnlyEnforceIf(var)

        if uso_vars:
            model.Add(sum(uso_vars) >= 1)
            model.Add(sum(x[curso_id, grado, d, b] for d in range(NUM_DIAS) for b in range(NUM_BLOQUES)) == horas)
        else:
            print(f"[!] Sin combinación válida para curso {curso_id}, grado {grado} (horas: {horas})")

    for d in range(NUM_DIAS):
        for b in range(NUM_BLOQUES):
            for grado in grados_ids:
                model.Add(
                    sum(x[c_id, grado, d, b]
                        for (c_id, g) in curso_grado_combos if g == grado) <= 1
                )

    docentes_ids = set(docente_grado.values())
    for d in range(NUM_DIAS):
        for b in range(NUM_BLOQUES):
            for doc_id in docentes_ids:
                model.Add(
                    sum(x[c_id, g, d, b]
                        for (c_id, g), doc in docente_grado.items()
                        if doc == doc_id) <= 1
                )

    model.Maximize(
        sum(x[c, g, d, b]
            for (c, g) in curso_grado_combos
            for d in range(NUM_DIAS)
            for b in range(NUM_BLOQUES))
    )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 60.0
    status = solver.Solve(model)

    horario = {d: {b: {} for b in range(NUM_BLOQUES)} for d in range(NUM_DIAS)}
    total_bloques = 0
    horas_asignadas = {}

    if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
        for (curso_id, grado) in curso_grado_combos:
            count = 0
            for d in range(NUM_DIAS):
                for b in range(NUM_BLOQUES):
                    if solver.Value(x[curso_id, grado, d, b]):
                        horario[d][b][grado] = curso_id
                        total_bloques += 1
                        count += 1
            horas_asignadas[(curso_id, grado)] = count
    else:
        print("\n❌ No se encontró solución.")

    print(f"\n[INFO] Total bloques asignados: {total_bloques}")
    print("[INFO] Resumen:")
    for (curso_id, grado), count in horas_asignadas.items():
        requeridas = horas_curso_grado.get(str(curso_id), {}).get(str(grado), 0)
        estado = "✅ OK" if count == requeridas else "❌ FALTAN"
        print(f" - Curso {curso_id}, Grado {grado}: {count}/{requeridas} horas -> {estado}")

    return {
        "horario": horario,
        "total_bloques_asignados": total_bloques
    }
