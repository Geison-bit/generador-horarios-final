from backend.solver.generador_python import generar_horario_cp


def _regla(tipo, **parametros):
    return {"tipo": tipo, "activa": True, **parametros}


def _bloques_por_curso(resultado):
    bloques = {}
    for dia, filas in resultado["horario"].items():
        for bloque, grupos in filas.items():
            for curso in grupos.values():
                bloques.setdefault(curso, {}).setdefault(dia, []).append(bloque)
    return bloques


def test_division_tres_horas_respeta_excepciones_por_nombre():
    resultado = generar_horario_cp(
        docentes=[{"id": 1}, {"id": 2}],
        asignaciones={
            "10": {"100": {"docente_id": 1}},
            "20": {"200": {"docente_id": 2}},
        },
        horas_curso_grado={"10": {"100": 3}, "20": {"200": 3}},
        restricciones={
            "num_bloques": 8,
            "catalogo_cursos": [
                {"id": 10, "nombre": "Inglés"},
                {"id": 20, "nombre": "Arte"},
            ],
            "reglas_ia": [
                # Simula la regla global antigua que mezclaba ambas alternativas.
                _regla("division_horas", total_horas=3, patrones=[[2, 1], [3]]),
                _regla("division_horas", total_horas=3, patrones=[[2, 1]], cursos=["Inglés"]),
                _regla("division_horas", total_horas=3, patrones=[[3]], excepto_cursos=["Inglés", "Desarrollo Personal"]),
            ],
        },
        nivel="Secundaria",
        workers=1,
        random_seed=1,
    )

    assert resultado["status"] in {"OPTIMAL", "FEASIBLE"}
    por_curso = _bloques_por_curso(resultado)
    sesiones_ingles = sorted(len(bloques) for bloques in por_curso[10].values())
    sesiones_arte = sorted(len(bloques) for bloques in por_curso[20].values())
    assert sesiones_ingles == [1, 2]
    assert sesiones_arte == [3]
    assert all(
        bloques == list(range(min(bloques), max(bloques) + 1))
        for bloques in por_curso[20].values()
    )


def test_maximo_docente_grado_rechaza_cinco_horas_en_un_dia():
    disponibilidad = {
        "1": {
            f"{dia}-{bloque}": dia == "lunes" and bloque < 5
            for dia in ("lunes", "martes", "miercoles", "jueves", "viernes")
            for bloque in range(8)
        }
    }
    resultado = generar_horario_cp(
        docentes=[{"id": 1}],
        asignaciones={
            "10": {"100": {"docente_id": 1}},
            "20": {"100": {"docente_id": 1}},
        },
        horas_curso_grado={"10": {"100": 3}, "20": {"100": 2}},
        restricciones={
            "num_bloques": 8,
            "disponibilidad": disponibilidad,
            "catalogo_cursos": [{"id": 10, "nombre": "Comunicación"}, {"id": 20, "nombre": "Inglés"}],
            "reglas_ia": [
                _regla("division_horas", total_horas=3, patrones=[[3]], cursos=["Comunicación"]),
                _regla("division_horas", total_horas=2, patrones=[[2]], cursos=["Inglés"]),
                _regla(
                    "limite_materia_dia",
                    maximo=3,
                    texto_original="Un docente podrá impartir como máximo tres bloques al mismo grado por día.",
                ),
                _regla("bloque_unico_docente_grado_dia"),
            ],
        },
        nivel="Secundaria",
        workers=1,
        random_seed=1,
    )

    assert resultado["status"] == "INFEASIBLE"


def test_docente_no_puede_salir_y_regresar_al_mismo_grado():
    disponibilidad = {
        "1": {
            f"{dia}-{bloque}": dia == "lunes" and bloque in {0, 2, 3}
            for dia in ("lunes", "martes", "miercoles", "jueves", "viernes")
            for bloque in range(8)
        }
    }
    resultado = generar_horario_cp(
        docentes=[{"id": 1}],
        asignaciones={
            "10": {"100": {"docente_id": 1}},
            "20": {"100": {"docente_id": 1}},
        },
        horas_curso_grado={"10": {"100": 1}, "20": {"100": 2}},
        restricciones={
            "num_bloques": 8,
            "disponibilidad": disponibilidad,
            "catalogo_cursos": [{"id": 10, "nombre": "Desarrollo Personal"}, {"id": 20, "nombre": "Ciencias Sociales"}],
            "reglas_ia": [
                _regla("division_horas", total_horas=1, patrones=[[1]], cursos=["Desarrollo Personal"]),
                _regla("division_horas", total_horas=2, patrones=[[2]], cursos=["Ciencias Sociales"]),
                _regla("limite_docente_grado_dia", maximo=3),
                _regla(
                    "no_soportada",
                    texto_original=(
                        "Todas las clases que un docente imparta al mismo grado durante un día "
                        "deberán formar un único periodo continuo y no podrá regresar a enseñar."
                    ),
                ),
            ],
        },
        nivel="Secundaria",
        workers=1,
        random_seed=1,
    )

    assert resultado["status"] == "INFEASIBLE"


def test_preferencia_franja_ubica_curso_en_primeros_bloques():
    resultado = generar_horario_cp(
        docentes=[{"id": 1}],
        asignaciones={"10": {"100": {"docente_id": 1}}},
        horas_curso_grado={"10": {"100": 3}},
        restricciones={
            "num_bloques": 7,
            "catalogo_cursos": [{"id": 10, "nombre": "Educación Física"}],
            "reglas_ia": [
                _regla("division_horas", total_horas=3, patrones=[[3]], cursos=["Educación Física"]),
                _regla(
                    "preferencia_franja_curso",
                    dureza="soft",
                    cursos=["Educación Física"],
                    bloques_preferidos=[1, 2, 3],
                ),
            ],
        },
        nivel="Secundaria",
        workers=1,
        random_seed=1,
    )

    assert resultado["status"] in {"OPTIMAL", "FEASIBLE"}
    por_curso = _bloques_por_curso(resultado)
    bloques = next(iter(por_curso[10].values()))
    assert bloques == [0, 1, 2]
    assert resultado["metricas"]["violaciones_preferencia_franja"] == 0


def test_preferencia_franja_no_impide_usar_disponibilidad_tardia():
    disponibilidad = {
        "1": {
            f"{dia}-{bloque}": dia == "lunes" and bloque in {3, 4, 5}
            for dia in ("lunes", "martes", "miercoles", "jueves", "viernes")
            for bloque in range(7)
        }
    }
    resultado = generar_horario_cp(
        docentes=[{"id": 1}],
        asignaciones={"10": {"100": {"docente_id": 1}}},
        horas_curso_grado={"10": {"100": 3}},
        restricciones={
            "num_bloques": 7,
            "disponibilidad": disponibilidad,
            "catalogo_cursos": [{"id": 10, "nombre": "Educación Física"}],
            "reglas_ia": [
                _regla("division_horas", total_horas=3, patrones=[[3]], cursos=["Educación Física"]),
                _regla(
                    "preferencia_franja_curso",
                    dureza="soft",
                    cursos=["Educación Física"],
                    bloques_preferidos=[1, 2, 3],
                ),
            ],
        },
        nivel="Secundaria",
        workers=1,
        random_seed=1,
    )

    assert resultado["status"] in {"OPTIMAL", "FEASIBLE"}
    por_curso = _bloques_por_curso(resultado)
    assert por_curso[10][0] == [3, 4, 5]
    assert resultado["metricas"]["violaciones_preferencia_franja"] == 3


def test_preferencia_franja_dura_vuelve_obligatorios_los_bloques():
    disponibilidad = {
        "1": {
            f"{dia}-{bloque}": dia == "lunes" and bloque in {3, 4, 5}
            for dia in ("lunes", "martes", "miercoles", "jueves", "viernes")
            for bloque in range(7)
        }
    }
    resultado = generar_horario_cp(
        docentes=[{"id": 1}],
        asignaciones={"10": {"100": {"docente_id": 1}}},
        horas_curso_grado={"10": {"100": 3}},
        restricciones={
            "num_bloques": 7,
            "disponibilidad": disponibilidad,
            "catalogo_cursos": [{"id": 10, "nombre": "Educación Física"}],
            "reglas_ia": [
                _regla("division_horas", total_horas=3, patrones=[[3]], cursos=["Educación Física"]),
                _regla(
                    "preferencia_franja_curso",
                    dureza="hard",
                    cursos=["Educación Física"],
                    bloques_preferidos=[1, 2, 3],
                ),
            ],
        },
        nivel="Secundaria",
        workers=1,
        random_seed=1,
    )

    assert resultado["status"] == "INFEASIBLE"


def test_division_suave_puede_incumplirse_para_conservar_factibilidad():
    disponibilidad = {
        "1": {
            f"{dia}-{bloque}": dia == "lunes" and bloque in {0, 2, 4}
            for dia in ("lunes", "martes", "miercoles", "jueves", "viernes")
            for bloque in range(7)
        }
    }
    resultado = generar_horario_cp(
        docentes=[{"id": 1}],
        asignaciones={"10": {"100": {"docente_id": 1}}},
        horas_curso_grado={"10": {"100": 3}},
        restricciones={
            "num_bloques": 7,
            "disponibilidad": disponibilidad,
            "catalogo_cursos": [{"id": 10, "nombre": "Arte"}],
            "reglas_ia": [
                _regla(
                    "division_horas",
                    dureza="soft",
                    total_horas=3,
                    patrones=[[3]],
                    cursos=["Arte"],
                ),
            ],
        },
        nivel="Secundaria",
        workers=1,
        random_seed=1,
    )

    assert resultado["status"] in {"OPTIMAL", "FEASIBLE"}
    assert _bloques_por_curso(resultado)[10][0] == [0, 2, 4]
