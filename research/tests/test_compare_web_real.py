import json

from research.baselines.baseline_greedy import generar_horario_baseline
from research.experiments.compare_web_real_instance import FIELDS, compare_snapshot
from research.experiments.stress_runner import generar_instancia_sintetica


def test_snapshot_web_y_comparacion_cp_sat_usan_mismo_hash(tmp_path):
    instance = generar_instancia_sintetica(1)
    snapshot = tmp_path / "web_real_instance_last.json"
    web_result = generar_horario_baseline(
        docentes=instance["docentes"],
        asignaciones=instance["asignaciones"],
        restricciones=instance["restricciones"],
        horas_curso_grado=instance["horas_curso_grado"],
        nivel=instance["nivel"],
        version=instance["version"],
        patrones_division=instance["patrones_division"],
        instance_snapshot_path=snapshot,
        snapshot_metadata={"endpoint": "test"},
    )
    assert web_result["diagnostico"]["instance_snapshot_path"] == str(
        snapshot.resolve()
    )

    csv_path = tmp_path / "web_real_cpsat_vs_greedy.csv"
    json_path = tmp_path / "web_real_cpsat_vs_greedy.json"
    rows, payload = compare_snapshot(
        snapshot,
        csv_path,
        json_path,
        time_limit_seconds=10,
        workers=2,
    )
    assert csv_path.exists()
    assert json_path.exists()
    assert {row["algorithm"] for row in rows} == {"CP-SAT", "Greedy"}
    assert all(row["same_instance_verified"] for row in rows)
    assert len({row["instance_hash_sha256"] for row in rows}) == 1
    assert all(set(row) == set(FIELDS) for row in rows)
    assert payload["same_instance_verified"] is True

    saved = json.loads(json_path.read_text(encoding="utf-8"))
    assert saved["instance_hash_sha256"] == rows[0]["instance_hash_sha256"]
