import csv
import json
import sys

import stress_runner
from stress_runner import (
    BLOQUES_POR_GRUPO,
    generar_instancia_sintetica,
    contar_datos_modelables,
    crear_fila_base,
    construir_observacion,
    exportar_resultados,
    resolver_limite_tiempo,
    resolver_progress,
    validar_estructura,
)


def test_x1_respeta_la_escala_oficial():
    instancia = generar_instancia_sintetica(1)
    asignaciones, bloques = contar_datos_modelables(instancia)
    valida, errores = validar_estructura(instancia)

    assert valida, errores
    assert len(instancia["metadata"]["secciones"]) == 1
    assert len(instancia["metadata"]["grupos"]) == 5
    assert len(instancia["docentes"]) == 8
    assert asignaciones == 50
    assert bloques == 175


def test_x30_replica_secciones_y_no_horas_internas():
    instancia = generar_instancia_sintetica(30)
    asignaciones, bloques = contar_datos_modelables(instancia)
    valida, errores = validar_estructura(instancia)

    assert valida, errores
    assert len(instancia["metadata"]["secciones"]) == 30
    assert len(instancia["metadata"]["grupos"]) == 150
    assert len(instancia["docentes"]) == 240
    assert asignaciones == 1500
    assert bloques == 5250

    for grupo in instancia["metadata"]["grupos"]:
        grupo_key = str(grupo["id"])
        total = sum(
            targets.get(grupo_key, 0)
            for targets in instancia["horas_curso_grado"].values()
        )
        assert total == BLOQUES_POR_GRUPO


def test_no_time_limit_tiene_prioridad_y_se_exporta_como_none():
    assert resolver_limite_tiempo(60, no_time_limit=True) is None
    assert resolver_limite_tiempo(60, no_time_limit=False) == 60.0

    instancia = generar_instancia_sintetica(1)
    fila = crear_fila_base(instancia, time_limit_seconds=None, workers=8)
    assert fila["time_limit_seconds"] is None
    assert fila["time_limit_mode"] == "unlimited"
    assert fila["solucion_encontrada"] is False

    fila_limitada = crear_fila_base(instancia, time_limit_seconds=60, workers=8)
    assert fila_limitada["time_limit_seconds"] == 60.0
    assert fila_limitada["time_limit_mode"] == "limited"


def test_x30_activa_monitor_aunque_no_se_escriba_progress():
    assert resolver_progress(30, progress_requested=False) is True
    assert resolver_progress(20, progress_requested=False) is False
    assert resolver_progress(20, progress_requested=True) is True


def test_observaciones_sin_limite_dependen_del_estado_real():
    assert construir_observacion("OPTIMAL", None) == (
        "Optimal solution found without explicit time limit"
    )
    assert construir_observacion("FEASIBLE", None) == (
        "Feasible solution found without explicit time limit"
    )
    assert construir_observacion("INFEASIBLE", None) == (
        "Instance proved infeasible without explicit time limit"
    )
    assert construir_observacion("UNKNOWN", None) == (
        "Solver returned UNKNOWN even without explicit time limit or execution was interrupted"
    )


def test_exportacion_sin_limite_usa_vacio_en_csv_y_null_en_json(tmp_path):
    instancia = generar_instancia_sintetica(30)
    fila = crear_fila_base(instancia, time_limit_seconds=None, workers=8)
    output = tmp_path / "stress.csv"

    exportar_resultados([fila], output)

    with output.open(encoding="utf-8-sig", newline="") as archivo:
        exportada = next(csv.DictReader(archivo))
    assert exportada["time_limit_mode"] == "unlimited"
    assert exportada["time_limit_seconds"] == ""

    resumen = json.loads((tmp_path / "stress_x30.json").read_text(encoding="utf-8"))
    assert resumen["time_limit_mode"] == "unlimited"
    assert resumen["time_limit_seconds"] is None


def test_ctrl_c_guarda_fila_interrumpida(monkeypatch, tmp_path):
    output = tmp_path / "interrumpido.csv"

    def interrumpir(*args, **kwargs):
        raise KeyboardInterrupt

    monkeypatch.setattr(stress_runner, "ejecutar_instancia", interrumpir)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "stress_runner.py",
            "--multipliers",
            "1",
            "--no-time-limit",
            "--output",
            str(output),
        ],
    )

    assert stress_runner.main() == 130
    with output.open(encoding="utf-8-sig", newline="") as archivo:
        fila = next(csv.DictReader(archivo))
    assert fila["solver_status"] == "INTERRUPTED"
    assert fila["solucion_encontrada"] == "False"
    assert fila["time_limit_mode"] == "unlimited"
    assert fila["time_limit_seconds"] == ""
    assert fila["interrupted"] == "True"
    assert fila["observacion"].startswith("Execution interrupted by user after ")
