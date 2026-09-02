from generador_python import calcular_metricas_solucion, generar_horario_cp


def test_calcular_metricas_solucion_detecta_conflictos_y_violaciones():
    requerimientos = [
        {"horas": 1},
        {"horas": 1},
        {"horas": 1},
        {"horas": 1},
    ]
    programadas = [
        {"docente": 1, "grupo": 10, "dia": 0, "bloque": 0},
        {"docente": 1, "grupo": 11, "dia": 0, "bloque": 0},
        {"docente": 2, "grupo": 10, "dia": 0, "bloque": 0},
        {"docente": 2, "grupo": 12, "dia": 0, "bloque": 1},
    ]
    docentes = [
        {"id": 1, "jornada_total": 1},
        {"id": 2, "jornada_total": 3},
    ]

    metricas = calcular_metricas_solucion(
        map_asignaciones=requerimientos,
        asignaciones_programadas=programadas,
        bloqueos={(2, 0, 1)},
        docentes=docentes,
        tiempo_ejecucion_segundos=1.25,
        estado_solver="FEASIBLE",
        num_conflicts=7,
        num_branches=12,
        tiempo_solver_segundos=1.0,
    )

    assert metricas["bloques_requeridos"] == 4
    assert metricas["bloques_asignados"] == 4
    assert metricas["bloques_faltantes"] == 0
    assert metricas["conflictos_docentes"] == 1
    assert metricas["conflictos_grupo"] == 1
    assert metricas["violaciones_disponibilidad"] == 1
    assert metricas["violaciones_carga"] == 1
    assert metricas["exceso_carga_bloques"] == 1
    assert metricas["estado_solver"] == "FEASIBLE"
    assert metricas["num_conflicts"] == 7
    assert metricas["num_branches"] == 12
    assert metricas["tiempo_ejecucion_segundos"] == 1.25
    assert metricas["tiempo_solver_segundos"] == 1.0


def test_calcular_metricas_solucion_sin_solucion_reporta_faltantes():
    metricas = calcular_metricas_solucion(
        map_asignaciones=[{"horas": 3}],
        asignaciones_programadas=[],
        bloqueos=set(),
        docentes=[],
        tiempo_ejecucion_segundos=0.5,
        estado_solver="INFEASIBLE",
        num_conflicts=0,
        num_branches=0,
    )

    assert metricas["bloques_requeridos"] == 3
    assert metricas["bloques_asignados"] == 0
    assert metricas["bloques_faltantes"] == 3
    assert metricas["estado_solver"] == "INFEASIBLE"


def test_generador_cp_devuelve_metricas_del_solver():
    resultado = generar_horario_cp(
        docentes=[{"id": 75, "jornada_total": 10}],
        asignaciones={
            "16": {
                "6": {"docente_id": 75, "curso_id": 16, "grado_id": 6}
            }
        },
        restricciones={},
        horas_curso_grado={"16": {"6": 2}},
        nivel="Primaria",
        version=1,
    )

    metricas = resultado["metricas"]
    assert metricas["bloques_requeridos"] == 2
    assert metricas["bloques_asignados"] == 2
    assert metricas["conflictos_docentes"] == 0
    assert metricas["conflictos_grupo"] == 0
    assert metricas["violaciones_disponibilidad"] == 0
    assert metricas["violaciones_carga"] == 0
    assert metricas["estado_solver"] in {"OPTIMAL", "FEASIBLE"}
    assert isinstance(metricas["num_conflicts"], int)
    assert isinstance(metricas["num_branches"], int)
    assert metricas["time_limit_seconds"] is None
