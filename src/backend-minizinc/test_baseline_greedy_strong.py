from baseline_greedy import (
    copy_instance,
    generar_horario_baseline,
    preparar_instancia,
    solve_greedy,
    verify_same_instance,
)
from stress_runner import generar_instancia_sintetica


def test_verify_same_instance_comprueba_todos_los_datos_principales():
    instance = generar_instancia_sintetica(1)
    same = verify_same_instance(instance, copy_instance(instance))
    assert same["same"] is True
    assert all(same["checks"].values())

    changed = copy_instance(instance)
    changed["patrones_division"]["101-1"] = [2, 3]
    different = verify_same_instance(instance, changed)
    assert different["same"] is False
    assert "patrones_division" in different["differences"]


def test_greedy_fortalecido_x1_es_completo_y_sin_violaciones():
    instance = generar_instancia_sintetica(1)
    result = solve_greedy(instance, restarts=20)
    assert result["required_blocks"] == 175
    assert result["assigned_blocks"] == 175
    assert result["unassigned_blocks"] == 0
    assert result["unplaced_assignments"] == 0
    assert result["status"] == "COMPLETE"
    assert result["teacher_conflicts"] == 0
    assert result["group_conflicts"] == 0
    assert result["availability_violations"] == 0
    assert result["workload_violations"] == 0


def test_greedy_solo_coloca_sesiones_completas():
    instance = generar_instancia_sintetica(1)
    model = preparar_instancia(instance)
    result = solve_greedy(instance, restarts=0)
    expected_lengths = {
        session["id"]: session["length"] for session in model["sessions"]
    }
    assert len(result["placements"]) == len(model["sessions"])
    assert all(
        placement["length"] == expected_lengths[placement["id"]]
        for placement in result["placements"]
    )


def test_adaptador_web_usa_el_baseline_auditado():
    instance = generar_instancia_sintetica(1)
    result = generar_horario_baseline(
        docentes=instance["docentes"],
        asignaciones=instance["asignaciones"],
        restricciones=instance["restricciones"],
        horas_curso_grado=instance["horas_curso_grado"],
        nivel=instance["nivel"],
        version=instance["version"],
        patrones_division=instance["patrones_division"],
    )
    assert result["status"] == "COMPLETE"
    assert result["total_bloques_asignados"] == 175
    assert result["metricas"]["modelo"] == "baseline_greedy.py::solve_greedy"
    assert result["diagnostico"]["uso"] == (
        "web integrado al mismo baseline auditado"
    )
