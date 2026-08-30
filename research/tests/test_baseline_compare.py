from research.baselines.baseline_compare import (
    ESCALAS_COMPARACION,
    cargar_resultados_cp_sat,
    construir_summary,
    ejecutar_greedy,
)


def test_greedy_x1_respeta_cobertura_y_conflictos():
    row = ejecutar_greedy(1)
    assert row["bloques_requeridos"] == 175
    assert row["bloques_asignados"] <= 175
    assert row["conflictos_docente"] == 0
    assert row["conflictos_grupo"] == 0
    assert row["violaciones_disponibilidad"] == 0
    assert row["violaciones_carga"] == 0


def test_carga_todos_los_resultados_cp_sat_existentes():
    resultados_dir = __import__("pathlib").Path(__file__).parent.parent / "results"
    rows = cargar_resultados_cp_sat(resultados_dir)
    assert [row["multiplicador"] for row in rows] == list(ESCALAS_COMPARACION)
    assert all(row["algorithm"] == "CP-SAT" for row in rows)
    assert all(row["source"] for row in rows)


def test_summary_empareja_ambos_metodos():
    cpsat = {
        "algorithm": "CP-SAT",
        "multiplicador": 1,
        "secciones_generadas": 1,
        "grupos_calculados": 5,
        "docentes_calculados": 8,
        "bloques_requeridos": 175,
        "bloques_asignados": 175,
        "coverage_rate": 1.0,
        "status": "OPTIMAL",
        "tiempo_segundos": 2.0,
        "conflictos_docente": 0,
        "conflictos_grupo": 0,
        "violaciones_disponibilidad": 0,
        "violaciones_carga": 0,
        "solucion_completa": True,
    }
    greedy = {
        **cpsat,
        "algorithm": "Greedy",
        "status": "COMPLETE",
        "tiempo_segundos": 1.0,
    }
    summary = construir_summary([cpsat, greedy], escalas=(1,))
    assert summary[0]["speedup_cpsat_over_greedy"] == 2.0
    assert summary[0]["ambos_completos"] is True
