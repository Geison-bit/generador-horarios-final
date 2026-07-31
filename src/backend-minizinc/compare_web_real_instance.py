"""Ejecuta CP-SAT sobre el ultimo snapshot web y lo compara con su greedy."""

import argparse
import copy
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

from baseline_greedy import instance_fingerprint, verify_same_instance
from generador_python import generar_horario_cp


FIELDS = (
    "algorithm",
    "required_blocks",
    "assigned_blocks",
    "coverage_rate",
    "unassigned_blocks",
    "status",
    "runtime_seconds",
    "teacher_conflicts",
    "group_conflicts",
    "availability_violations",
    "workload_violations",
    "greedy_restarts_used",
    "solver_conflicts",
    "solver_branches",
    "same_instance_verified",
    "instance_hash_sha256",
)


def load_snapshot(path):
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(
            f"No existe snapshot web: {path}. Reinicia app.py y genera el horario otra vez."
        )
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    instance = snapshot.get("instance")
    greedy_result = snapshot.get("greedy_result")
    if not isinstance(instance, dict) or not isinstance(greedy_result, dict):
        raise ValueError(
            "Snapshot invalido: debe contener objetos 'instance' y 'greedy_result'"
        )
    calculated_hash = instance_fingerprint(instance)
    stored_hash = snapshot.get("instance_hash_sha256")
    if calculated_hash != stored_hash:
        raise ValueError(
            "Snapshot invalido: instance_hash_sha256 no coincide con la instancia"
        )
    return snapshot, instance, greedy_result


def _greedy_row(result, instance_hash):
    return {
        "algorithm": "Greedy",
        "required_blocks": int(result["required_blocks"]),
        "assigned_blocks": int(result["assigned_blocks"]),
        "coverage_rate": float(result["coverage_rate"]),
        "unassigned_blocks": int(result["unassigned_blocks"]),
        "status": str(result["status"]),
        "runtime_seconds": float(result["runtime_seconds"]),
        "teacher_conflicts": int(result["teacher_conflicts"]),
        "group_conflicts": int(result["group_conflicts"]),
        "availability_violations": int(result["availability_violations"]),
        "workload_violations": int(result["workload_violations"]),
        "greedy_restarts_used": int(result["greedy_restarts_used"]),
        "solver_conflicts": "",
        "solver_branches": "",
        "same_instance_verified": True,
        "instance_hash_sha256": instance_hash,
    }


def run_cp_sat(instance, time_limit_seconds=None, workers=8):
    cp_instance = copy.deepcopy(instance)
    return generar_horario_cp(
        docentes=cp_instance["docentes"],
        asignaciones=cp_instance["asignaciones"],
        restricciones=cp_instance["restricciones"],
        horas_curso_grado=cp_instance["horas_curso_grado"],
        nivel=cp_instance.get("nivel", "Secundaria"),
        version=cp_instance.get("version", 1),
        patrones_division=cp_instance.get("patrones_division") or {},
        time_limit_seconds=time_limit_seconds,
        workers=workers,
    )


def _cp_row(result, instance_hash, same_instance):
    metrics = result.get("metricas") or {}
    required = int(metrics.get("bloques_requeridos", 0))
    assigned = int(metrics.get("bloques_asignados", 0))
    return {
        "algorithm": "CP-SAT",
        "required_blocks": required,
        "assigned_blocks": assigned,
        "coverage_rate": assigned / required if required else 0.0,
        "unassigned_blocks": max(0, required - assigned),
        "status": str(metrics.get("estado_solver", result.get("status", "UNKNOWN"))),
        "runtime_seconds": float(metrics.get("tiempo_ejecucion_segundos", 0.0)),
        "teacher_conflicts": int(metrics.get("conflictos_docentes", 0)),
        "group_conflicts": int(metrics.get("conflictos_grupo", 0)),
        "availability_violations": int(
            metrics.get("violaciones_disponibilidad", 0)
        ),
        "workload_violations": int(metrics.get("violaciones_carga", 0)),
        "greedy_restarts_used": "",
        "solver_conflicts": int(metrics.get("num_conflicts", 0)),
        "solver_branches": int(metrics.get("num_branches", 0)),
        "same_instance_verified": bool(same_instance),
        "instance_hash_sha256": instance_hash,
    }


def compare_snapshot(
    snapshot_path,
    csv_path,
    json_path,
    time_limit_seconds=None,
    workers=8,
    expected_greedy_assigned=None,
):
    snapshot, instance, greedy_result = load_snapshot(snapshot_path)
    if (
        expected_greedy_assigned is not None
        and int(greedy_result.get("assigned_blocks", -1))
        != int(expected_greedy_assigned)
    ):
        raise ValueError(
            "Comparacion cancelada: el snapshot greedy contiene "
            f"{greedy_result.get('assigned_blocks')} bloques, no "
            f"{expected_greedy_assigned}"
        )
    cp_instance = copy.deepcopy(instance)
    verification = verify_same_instance(instance, cp_instance)
    if not verification["same"]:
        raise ValueError(
            "Comparacion cancelada: la instancia CP-SAT difiere del snapshot web"
        )

    cp_result = run_cp_sat(
        cp_instance,
        time_limit_seconds=time_limit_seconds,
        workers=workers,
    )
    instance_hash = snapshot["instance_hash_sha256"]
    greedy_row = _greedy_row(greedy_result, instance_hash)
    cp_row = _cp_row(cp_result, instance_hash, verification["same"])
    if greedy_row["required_blocks"] != cp_row["required_blocks"]:
        raise ValueError(
            "Comparacion cancelada: CP-SAT y Greedy no reportan los mismos bloques"
        )
    rows = [cp_row, greedy_row]

    csv_path = Path(csv_path)
    json_path = Path(json_path)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    payload = {
        "schema_version": 1,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_snapshot": str(Path(snapshot_path).resolve()),
        "snapshot_captured_at_utc": snapshot.get("captured_at_utc"),
        "snapshot_metadata": snapshot.get("metadata", {}),
        "same_instance_verified": verification["same"],
        "instance_hash_sha256": instance_hash,
        "time_limit_seconds": time_limit_seconds,
        "workers": workers,
        "results": rows,
        "conclusion": (
            f"CP-SAT {cp_row['assigned_blocks']}/{cp_row['required_blocks']} "
            f"({cp_row['status']}); Greedy "
            f"{greedy_row['assigned_blocks']}/{greedy_row['required_blocks']} "
            f"({greedy_row['status']})"
        ),
    }
    json_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return rows, payload


def parse_args():
    results = Path(__file__).resolve().parent / "resultados"
    parser = argparse.ArgumentParser(
        description="Compara el ultimo caso web real contra CP-SAT"
    )
    parser.add_argument(
        "--snapshot",
        type=Path,
        default=results / "web_real_instance_last.json",
    )
    parser.add_argument(
        "--csv-output",
        type=Path,
        default=results / "web_real_cpsat_vs_greedy.csv",
    )
    parser.add_argument(
        "--json-output",
        type=Path,
        default=results / "web_real_cpsat_vs_greedy.json",
    )
    parser.add_argument("--time-limit", type=float)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--expect-greedy-assigned", type=int)
    return parser.parse_args()


def main():
    args = parse_args()
    if args.time_limit is not None and args.time_limit <= 0:
        raise SystemExit("--time-limit debe ser positivo")
    if args.workers <= 0:
        raise SystemExit("--workers debe ser positivo")
    rows, payload = compare_snapshot(
        args.snapshot.resolve(),
        args.csv_output.resolve(),
        args.json_output.resolve(),
        time_limit_seconds=args.time_limit,
        workers=args.workers,
        expected_greedy_assigned=args.expect_greedy_assigned,
    )
    for row in rows:
        print(
            f"[WEB-REAL] {row['algorithm']}: "
            f"{row['assigned_blocks']}/{row['required_blocks']} | "
            f"status={row['status']} | time={row['runtime_seconds']:.3f}s"
        )
    print(f"[WEB-REAL] {payload['conclusion']}")
    print(f"[WEB-REAL] CSV: {args.csv_output.resolve()}")
    print(f"[WEB-REAL] JSON: {args.json_output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
