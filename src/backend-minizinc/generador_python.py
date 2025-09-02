import random
from itertools import permutations

# Constantes del horario
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes"]
NUM_DIAS = 5
NUM_BLOQUES = 8

def dividir_horas(horas):
    """
    Divide el total de horas en bloques pedagógicos.
    """
    if horas <= 1: return []
    if horas == 2: return [[2]]
    if horas == 3: return [[3], [2, 1]]
    if horas == 4: return [[2, 2], [3, 1]]
    if horas == 5:
        return [
            [3, 2], [2, 3],
            [2, 2, 1], [2, 1, 2], [1, 2, 2]
        ]
    if horas == 6:
        return [
            [3, 3], [2, 2, 2],
            [3, 2, 1], [3, 1, 2], [2, 3, 1], [2, 1, 3], [1, 3, 2], [1, 2, 3]
        ]
    if horas == 7:
        return [
            [3, 2, 2], [2, 3, 2], [2, 2, 3],
            [3, 3, 1], [3, 1, 3], [1, 3, 3]
        ]
    if horas == 8:
        return [
            [3, 3, 2], [3, 2, 3], [2, 3, 3],
            [2, 2, 2, 2]
        ]
    return [[horas]]

def son_consecutivos(bloques):
    return all(b2 - b1 == 1 for b1, b2 in zip(bloques, bloques[1:]))

def generar_horario(docentes, asignaciones, restricciones, horas_curso_grado, nivel="Secundaria"):
    if not docentes or not asignaciones or not horas_curso_grado:
        raise ValueError("Faltan datos de entrada requeridos para generar el horario.")

    horario = {d: {b: {} for b in range(NUM_BLOQUES)} for d in range(NUM_DIAS)}
    bloques_ocupados = {doc["id"]: set() for doc in docentes}
    horas_asignadas = {}
    fallidos = 0

    # ✅ Aquí corregimos: en Primaria ignoramos restricciones
    def bloque_disponible(docente_id, dia_nombre, bloque):
        if nivel == "Primaria":
            return True
        return restricciones.get(str(docente_id), {}).get(f"{dia_nombre}-{bloque}", False)

    asignaciones_ordenadas = []
    for curso_id, grados in asignaciones.items():
        for grado_str, datos in grados.items():
            grado = int(grado_str)
            horas = horas_curso_grado.get(str(curso_id), {}).get(str(grado), 0)
            asignaciones_ordenadas.append((curso_id, grado_str, datos["docente_id"], horas))
    asignaciones_ordenadas.sort(key=lambda x: -x[3])

    for curso_id, grado_str, docente_id, horas in asignaciones_ordenadas:
        grado = int(grado_str)

        if horas <= 1:
            print(f"⛔ Curso {curso_id}, Grado {grado}: solo {horas}h -> omitido")
            horas_asignadas[(curso_id, grado)] = 0
            continue

        combinaciones = sorted(dividir_horas(horas), key=len)
        asignado_ok = False

        for combo in combinaciones:
            dias_usados = set()
            asign_temp = []

            for cantidad in combo:
                dia_disponible = None
                bloques_asignables = []

                dias_shuffle = list(range(NUM_DIAS))
                random.shuffle(dias_shuffle)

                for dia in dias_shuffle:
                    if dia in dias_usados:
                        continue

                    dia_nombre = DIAS[dia]
                    libres = []
                    for b in range(NUM_BLOQUES):
                        if not bloque_disponible(docente_id, dia_nombre, b):
                            continue
                        if (dia, b) in bloques_ocupados[docente_id]:
                            continue
                        if grado in horario[dia][b]:
                            continue
                        # ⛔ Validar que el docente no esté ya asignado a otro grado en ese mismo bloque
                        ya_asignado = any(
                            asignaciones.get(str(c_existente), {}).get(str(g), {}).get("docente_id") == docente_id
                            for g, c_existente in horario[dia][b].items()
                            if c_existente
                        )
                        if ya_asignado:
                            continue
                        libres.append(b)

                    libres.sort()

                    for i in range(len(libres) - cantidad + 1):
                        segmento = libres[i:i + cantidad]
                        if son_consecutivos(segmento):
                            bloques_asignables = [(dia, b) for b in segmento]
                            dia_disponible = dia
                            break
                    if bloques_asignables:
                        break

                if bloques_asignables:
                    for dia, b in bloques_asignables:
                        horario[dia][b][grado] = int(curso_id)
                        bloques_ocupados[docente_id].add((dia, b))
                        asign_temp.append((dia, b))
                    dias_usados.add(dia_disponible)
                else:
                    break

            if len(asign_temp) == horas:
                asignado_ok = True
                horas_asignadas[(curso_id, grado)] = horas
                break

        if not asignado_ok:
            fallidos += 1
            horas_asignadas[(curso_id, grado)] = 0
            print(f"[!] No se pudo asignar: curso {curso_id}, grado {grado}")

    # Reporte
    print(f"\n[INFO] Asignación completada.")
    print(f"[INFO] Cursos no asignados completamente: {fallidos}")

    print("\n[INFO] Resumen de asignación de horas:")
    for (curso_id, grado), asignadas in horas_asignadas.items():
        requeridas = horas_curso_grado.get(str(curso_id), {}).get(str(grado), 0)
        estado = "✅ OK" if asignadas == requeridas else "❌ FALTAN"
        print(f" - Curso {curso_id}, Grado {grado}: {asignadas}/{requeridas} horas -> {estado}")

    total_bloques = sum(
        1 for dia in horario.values()
        for bloque in dia.values()
        for curso in bloque.values()
        if isinstance(curso, int) and curso > 0
    )
    print(f"\n[INFO] Total asignado: {total_bloques} bloques")

    print("\n[INFO] Cursos con solo 1 hora definida (no se asignan):")
    for curso_id, grados in horas_curso_grado.items():
        for grado_str, h in grados.items():
            if isinstance(h, int) and h == 1:
                print(f"[!] Curso {curso_id}, Grado {grado_str} tiene solo 1 hora definida.")

    return {
        "horario": horario,
        "asignaciones_exitosas": sum(1 for v in horas_asignadas.values() if v > 0),
        "asignaciones_fallidas": fallidos,
        "total_bloques_asignados": total_bloques
    }