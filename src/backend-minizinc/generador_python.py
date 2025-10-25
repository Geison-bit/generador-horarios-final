# generador_python.py

import random
import unicodedata

# --- Constantes del horario (con tildes, como en la BD/UI) ---
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes"]
NUM_DIAS = 5
NUM_BLOQUES = 8


def _normalize(s: str) -> str:
    """Quita tildes y pasa a minúsculas (para tolerar claves sin tilde)."""
    if s is None:
        return ""
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode("ascii").lower()


def dividir_horas(horas: int):
    """Particiones pedagógicas para las horas requeridas (para 'bloques_consecutivos')."""
    if horas <= 1:
        return []
    if horas == 2:
        return [[2]]
    if horas == 3:
        return [[3], [2, 1]]
    if horas == 4:
        return [[2, 2], [3, 1]]
    if horas == 5:
        return [[3, 2], [2, 3], [2, 2, 1], [2, 1, 2], [1, 2, 2]]
    if horas == 6:
        return [[3, 3], [2, 2, 2], [3, 2, 1], [3, 1, 2], [2, 3, 1], [2, 1, 3], [1, 3, 2], [1, 2, 3]]
    if horas == 7:
        return [[3, 2, 2], [2, 3, 2], [2, 2, 3], [3, 3, 1], [3, 1, 3], [1, 3, 3]]
    if horas == 8:
        return [[3, 3, 2], [3, 2, 3], [2, 3, 3], [2, 2, 2, 2]]
    # fallback
    return [[horas]]


def son_consecutivos(bloques):
    return all(b2 - b1 == 1 for b1, b2 in zip(bloques, bloques[1:]))


def generar_horario(docentes, asignaciones, restricciones, horas_curso_grado, nivel="Secundaria"):
    """
    'restricciones' esperado:
    - Puede venir plano { "<docenteId>": { "miércoles-3": true, ... } }
      o dentro de la llave 'disponibilidad': { "disponibilidad": { ... } }

    Semántica:
    - En Primaria o si la regla está desactivada -> no se restringe.
    - Si un docente NO tiene mapa -> NO disponible (default False).
    - Si tiene mapa -> disponible SOLO cuando existe la clave "<día>-<bloque>"
      con True. Se tolera tanto con tilde ("miércoles-3") como sin tilde ("miercoles-3").
    """
    if not docentes or not asignaciones or not horas_curso_grado:
        raise ValueError("Faltan datos de entrada requeridos para generar el horario.")

    # Reglas (defaults ON)
    reglas = (restricciones or {}).get("reglas", {}) or {}
    regla_disponibilidad = bool(reglas.get("disponibilidad_docente", True))
    regla_no_solape_docente = bool(reglas.get("no_solape_docente", True))
    regla_bloques_consecutivos = bool(reglas.get("bloques_consecutivos", True))
    regla_distribuir_en_dias = bool(reglas.get("distribuir_en_dias_distintos", True))
    regla_omitir_cursos_1h = bool(reglas.get("omitir_cursos_1h", True))

    # Mapa que puede venir plano o dentro de "disponibilidad"
    disponibilidad_map = (restricciones or {}).get("disponibilidad", restricciones or {})

    # Estructuras
    # horario[dia][bloque][grado_id] = curso_id
    horario = {d: {b: {} for b in range(NUM_BLOQUES)} for d in range(NUM_DIAS)}
    # Para chequear 'no_solape_docente'
    bloques_ocupados = {doc["id"]: set() for doc in docentes}
    # Métricas
    horas_asignadas = {}
    required_hours = {}
    fallidos = 0

    def bloque_disponible(docente_id, dia_nombre, bloque_idx):
        """Evalúa disponibilidad del docente para un (día, bloque)."""
        if not regla_disponibilidad or nivel == "Primaria":
            return True

        reglas_doc = disponibilidad_map.get(str(docente_id))
        # Sin configuración para este docente => NO disponible
        if not reglas_doc:
            return False

        # Probar clave exacta (con tildes) y normalizada (sin tildes)
        key_exact = f"{dia_nombre}-{int(bloque_idx)}"
        key_norm = f"{_normalize(dia_nombre)}-{int(bloque_idx)}"
        return bool(reglas_doc.get(key_exact) or reglas_doc.get(key_norm))

    # Preparar lista de asignaciones (ordenada por horas requeridas desc)
    asignaciones_ordenadas = []
    for curso_id, grados in (asignaciones or {}).items():
        for grado_str, datos in (grados or {}).items():
            grado = int(grado_str)
            horas_req = int((horas_curso_grado.get(str(curso_id), {}) or {}).get(str(grado), 0))
            docente_id = int(datos["docente_id"])
            required_hours[(int(curso_id), grado)] = horas_req
            asignaciones_ordenadas.append((int(curso_id), grado, docente_id, horas_req))
    asignaciones_ordenadas.sort(key=lambda x: -x[3])  # más horas primero

    # Asignación
    for curso_id, grado, docente_id, horas in asignaciones_ordenadas:
        # Regla 5: omitir cursos con 1 hora
        if horas <= 1 and regla_omitir_cursos_1h:
            horas_asignadas[(curso_id, grado)] = 0
            continue

        combinaciones = sorted(dividir_horas(horas), key=len)
        # Si 'bloques_consecutivos' está OFF, permitimos todo 1x1
        if not regla_bloques_consecutivos and horas > 0:
            if [1] * horas not in combinaciones:
                combinaciones.insert(0, [1] * horas)

        asignado_ok = False

        for combo in combinaciones:
            # Regla 4: distribuir en días distintos
            dias_usados = set() if regla_distribuir_en_dias else None
            asign_temp = []

            for cantidad in combo:
                dia_elegido = None
                bloques_asignables = []

                dias_shuffle = list(range(NUM_DIAS))
                random.shuffle(dias_shuffle)

                for dia in dias_shuffle:
                    if dias_usados is not None and dia in dias_usados:
                        continue

                    dia_nombre = DIAS[dia]
                    libres = []

                    # Buscar bloques libres cumpliendo reglas 1 y 2
                    for b in range(NUM_BLOQUES):
                        # 1) disponibilidad
                        if not bloque_disponible(docente_id, dia_nombre, b):
                            continue
                        # 2) no solapar docente
                        if regla_no_solape_docente and (dia, b) in bloques_ocupados[docente_id]:
                            continue
                        # no pisar curso ya puesto en ese grado (el grado ya tiene algo en ese bloque)
                        if grado in horario[dia][b]:
                            continue
                        # además, si hay otra clase con el mismo docente en ese bloque (otro grado)
                        if regla_no_solape_docente:
                            ya_asignado = any(
                                asignaciones.get(str(c_existente), {}).get(str(g), {}).get("docente_id") == docente_id
                                for g, c_existente in horario[dia][b].items()
                                if c_existente
                            )
                            if ya_asignado:
                                continue

                        libres.append(b)

                    libres.sort()

                    # Regla 3: bloques consecutivos
                    if regla_bloques_consecutivos and cantidad > 1:
                        for i in range(len(libres) - cantidad + 1):
                            segmento = libres[i:i + cantidad]
                            if son_consecutivos(segmento):
                                bloques_asignables = [(dia, bn) for bn in segmento]
                                dia_elegido = dia
                                break
                    else:
                        if len(libres) >= cantidad:
                            bloques_asignables = [(dia, bn) for bn in libres[:cantidad]]
                            dia_elegido = dia

                    if bloques_asignables:
                        break  # encontramos sitio para este segmento

                if bloques_asignables:
                    # Colocar segmento
                    for dia, b in bloques_asignables:
                        horario[dia][b][grado] = int(curso_id)
                        if regla_no_solape_docente:
                            bloques_ocupados[docente_id].add((dia, b))
                        asign_temp.append((dia, b))
                    if dias_usados is not None and dia_elegido is not None:
                        dias_usados.add(dia_elegido)
                else:
                    # no se pudo colocar este segmento
                    break

            # ¿colocamos todos los segmentos de la combinación?
            if len(asign_temp) == sum(combo):
                asignado_ok = True
                horas_asignadas[(curso_id, grado)] = sum(combo)
                break

        if not asignado_ok:
            fallidos += 1
            horas_asignadas[(curso_id, grado)] = 0
            print(f"[!] No se pudo asignar: curso {curso_id}, grado {grado}")

    # Métricas y salida
    total_bloques = sum(
        1
        for dia in horario.values()
        for bloque in dia.values()
        for curso in bloque.values()
        if isinstance(curso, int) and curso > 0
    )

    detalle_asignaciones = []
    exitosas = 0
    for (curso_id, grado), horas_req in (required_hours or {}).items():
        asignadas = int(horas_asignadas.get((curso_id, grado), 0))
        docente_id = int((asignaciones.get(str(curso_id), {}) or {}).get(str(grado), {}).get("docente_id", 0))
        ok = asignadas >= horas_req and horas_req > 0
        if ok:
            exitosas += 1
        detalle_asignaciones.append(
            {
                "curso_id": int(curso_id),
                "grado_id": int(grado),
                "docente_id": docente_id,
                "horas_asignadas": asignadas,
                "horas_requeridas": int(horas_req),
                "ok": bool(ok),
            }
        )

    print("\n[INFO] Asignación completada.")
    print(f"[INFO] Cursos no asignados completamente: {fallidos}")
    print("\n[INFO] Resumen de asignación de horas:")
    for item in sorted(detalle_asignaciones, key=lambda x: (x["curso_id"], x["grado_id"])):
        estado = "✅ OK" if item["ok"] else "❌ FALTAN"
        print(
            f"- Curso {item['curso_id']}, Grado {item['grado_id']}: "
            f"{item['horas_asignadas']}/{item['horas_requeridas']} horas -> {estado}"
        )
    print(f"\n[INFO] Total asignado: {total_bloques} bloques")

    return {
        "horario": horario,
        "asignaciones_exitosas": exitosas,
        "asignaciones_fallidas": fallidos,
        "total_bloques_asignados": total_bloques,
        "detalle_asignaciones": detalle_asignaciones,
        "resumen_por_docente": {},
        "reglas_aplicadas": {
            "disponibilidad_docente": regla_disponibilidad,
            "no_solape_docente": regla_no_solape_docente,
            "bloques_consecutivos": regla_bloques_consecutivos,
            "distribuir_en_dias_distintos": regla_distribuir_en_dias,
            "omitir_cursos_1h": regla_omitir_cursos_1h,
        },
    }
