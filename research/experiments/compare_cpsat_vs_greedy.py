"""Runner de comparacion justa CP-SAT existente vs baseline greedy."""

import argparse
import csv
import json
import re
from pathlib import Path

from research.baselines.baseline_greedy import (
    copy_instance,
    preparar_instancia,
    solve_greedy,
    verify_same_instance,
)
from research.experiments.stress_runner import generar_instancia_sintetica


DEFAULT_MULTIPLIERS = (1, 2, 5, 10, 20)
RAW_FIELDS = (
    "algorithm",
    "scenario",
    "multiplicador",
    "required_blocks",
    "assigned_blocks",
    "coverage_rate",
    "unassigned_blocks",
    "unplaced_assignments",
    "status",
    "runtime_seconds",
    "teacher_conflicts",
    "group_conflicts",
    "availability_violations",
    "workload_violations",
    "greedy_restarts_used",
    "best_restart",
    "solver_conflicts",
    "solver_branches",
    "same_instance_verified",
    "instance_fingerprint",
    "source",
    "observation",
)

SUMMARY_FIELDS = (
    "scenario",
    "multiplicador",
    "required_blocks",
    "cpsat_assigned_blocks",
    "greedy_assigned_blocks",
    "cpsat_coverage_rate",
    "greedy_coverage_rate",
    "coverage_delta_greedy_minus_cpsat",
    "cpsat_unassigned_blocks",
    "greedy_unassigned_blocks",
    "cpsat_status",
    "greedy_status",
    "cpsat_runtime_seconds",
    "greedy_runtime_seconds",
    "speedup_cpsat_over_greedy",
    "cpsat_teacher_conflicts",
    "greedy_teacher_conflicts",
    "cpsat_group_conflicts",
    "greedy_group_conflicts",
    "cpsat_availability_violations",
    "greedy_availability_violations",
    "cpsat_workload_violations",
    "greedy_workload_violations",
    "greedy_restarts_used",
    "greedy_best_restart",
    "same_instance_verified",
    "instance_fingerprint",
    "observation",
)


def _int(value, default=0):
    if value in (None, ""):
        return default
    return int(float(value))


def _float(value, default=None):
    if value in (None, ""):
        return default
    return float(value)


def _extract_log(path):
    text = path.read_text(encoding="utf-8", errors="replace")

    def value(label, pattern=r"([0-9]+)"):
        match = re.search(rf"{re.escape(label)}\s*{pattern}", text)
        if not match:
            raise ValueError(f"No se encontro '{label}' en {path}")
        return match.group(1)

    return {
        "required_blocks": int(value("Bloques requeridos:")),
        "assigned_blocks": int(value("Bloques asignados:")),
        "status": value("Estado del solver:", r"([A-Z_]+)"),
        "runtime_seconds": float(
            value("Tiempo de ejecucion:", r"([0-9]+(?:\.[0-9]+)?)")
        ),
        "teacher_conflicts": int(value("Conflictos docentes:")),
        "group_conflicts": int(value("Conflictos por grupo:")),
        "availability_violations": int(
            value("Violaciones de disponibilidad:")
        ),
        "workload_violations": int(value("Violaciones de carga:")),
        "solver_conflicts": int(value("NumConflicts:")),
        "solver_branches": int(value("NumBranches:")),
    }


def _normalize_cp_result(data):
    required = _int(
        data.get(
            "required_blocks",
            data.get("bloques_requeridos", data.get("bloques_requeridos_calculados")),
        )
    )
    assigned = _int(data.get("assigned_blocks", data.get("bloques_asignados")))
    coverage = _float(data.get("coverage_rate"))
    if coverage is None:
        coverage = assigned / required if required else 0.0
    return {
        "required_blocks": required,
        "assigned_blocks": assigned,
        "coverage_rate": round(coverage, 9),
        "unassigned_blocks": max(0, required - assigned),
        "unplaced_assignments": 0 if assigned == required else "",
        "status": str(data.get("status", data.get("solver_status", "UNKNOWN"))),
        "runtime_seconds": _float(
            data.get("runtime_seconds", data.get("tiempo_segundos"))
        ),
        "teacher_conflicts": _int(
            data.get("teacher_conflicts", data.get("conflictos_docente"))
        ),
        "group_conflicts": _int(
            data.get("group_conflicts", data.get("conflictos_grupo"))
        ),
        "availability_violations": _int(
            data.get(
                "availability_violations",
                data.get("violaciones_disponibilidad"),
            )
        ),
        "workload_violations": _int(
            data.get("workload_violations", data.get("violaciones_carga"))
        ),
        "solver_conflicts": _int(data.get("solver_conflicts")),
        "solver_branches": _int(data.get("solver_branches")),
    }


def load_existing_cp_result(results_dir, multiplier):
    results_dir = Path(results_dir)
    json_path = results_dir / f"stress_cp_sat_x{multiplier}.json"
    if json_path.exists():
        return _normalize_cp_result(
            json.loads(json_path.read_text(encoding="utf-8"))
        ), json_path

    csv_path = results_dir / "stress_cp_sat.csv"
    if csv_path.exists():
        with csv_path.open(encoding="utf-8-sig", newline="") as file:
            for row in csv.DictReader(file):
                if _int(row.get("multiplicador"), -1) == multiplier:
                    return _normalize_cp_result(row), csv_path

    log_path = results_dir / "logs" / f"stress_x{multiplier}.log"
    if log_path.exists():
        return _normalize_cp_result(_extract_log(log_path)), log_path
    raise FileNotFoundError(
        f"No existe resultado CP-SAT guardado para x{multiplier}"
    )


def _cp_raw(scenario, multiplier, result, source, verification):
    return {
        "algorithm": "CP-SAT",
        "scenario": scenario,
        "multiplicador": multiplier,
        **result,
        "greedy_restarts_used": "",
        "best_restart": "",
        "same_instance_verified": verification["same"],
        "instance_fingerprint": verification["cpsat_fingerprint"],
        "source": str(Path(source).resolve()),
        "observation": "Resultado CP-SAT existente; solver no reejecutado",
    }


def _greedy_raw(scenario, multiplier, result, verification):
    return {
        "algorithm": "Greedy",
        "scenario": scenario,
        "multiplicador": multiplier,
        "required_blocks": result["required_blocks"],
        "assigned_blocks": result["assigned_blocks"],
        "coverage_rate": result["coverage_rate"],
        "unassigned_blocks": result["unassigned_blocks"],
        "unplaced_assignments": result["unplaced_assignments"],
        "status": result["status"],
        "runtime_seconds": result["runtime_seconds"],
        "teacher_conflicts": result["teacher_conflicts"],
        "group_conflicts": result["group_conflicts"],
        "availability_violations": result["availability_violations"],
        "workload_violations": result["workload_violations"],
        "greedy_restarts_used": result["greedy_restarts_used"],
        "best_restart": result["best_restart"],
        "solver_conflicts": "",
        "solver_branches": "",
        "same_instance_verified": verification["same"],
        "instance_fingerprint": verification["greedy_fingerprint"],
        "source": "baseline_greedy.py::solve_greedy",
        "observation": result["observacion"],
    }


def _summary(cp_row, greedy_row):
    greedy_time = float(greedy_row["runtime_seconds"])
    cp_time = float(cp_row["runtime_seconds"])
    same = bool(
        cp_row["same_instance_verified"]
        and greedy_row["same_instance_verified"]
        and cp_row["instance_fingerprint"] == greedy_row["instance_fingerprint"]
    )
    return {
        "scenario": cp_row["scenario"],
        "multiplicador": cp_row["multiplicador"],
        "required_blocks": cp_row["required_blocks"],
        "cpsat_assigned_blocks": cp_row["assigned_blocks"],
        "greedy_assigned_blocks": greedy_row["assigned_blocks"],
        "cpsat_coverage_rate": cp_row["coverage_rate"],
        "greedy_coverage_rate": greedy_row["coverage_rate"],
        "coverage_delta_greedy_minus_cpsat": round(
            float(greedy_row["coverage_rate"]) - float(cp_row["coverage_rate"]),
            9,
        ),
        "cpsat_unassigned_blocks": cp_row["unassigned_blocks"],
        "greedy_unassigned_blocks": greedy_row["unassigned_blocks"],
        "cpsat_status": cp_row["status"],
        "greedy_status": greedy_row["status"],
        "cpsat_runtime_seconds": cp_time,
        "greedy_runtime_seconds": greedy_time,
        "speedup_cpsat_over_greedy": (
            round(cp_time / greedy_time, 6) if greedy_time else ""
        ),
        "cpsat_teacher_conflicts": cp_row["teacher_conflicts"],
        "greedy_teacher_conflicts": greedy_row["teacher_conflicts"],
        "cpsat_group_conflicts": cp_row["group_conflicts"],
        "greedy_group_conflicts": greedy_row["group_conflicts"],
        "cpsat_availability_violations": cp_row["availability_violations"],
        "greedy_availability_violations": greedy_row[
            "availability_violations"
        ],
        "cpsat_workload_violations": cp_row["workload_violations"],
        "greedy_workload_violations": greedy_row["workload_violations"],
        "greedy_restarts_used": greedy_row["greedy_restarts_used"],
        "greedy_best_restart": greedy_row["best_restart"],
        "same_instance_verified": same,
        "instance_fingerprint": cp_row["instance_fingerprint"],
        "observation": (
            "Comparacion valida: misma instancia verificada"
            if same
            else "COMPARACION INVALIDA: las instancias no coinciden"
        ),
    }


def _write_csv(path, fields, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def _merge_existing(path, fields, new_rows, key_fields):
    existing = []
    if path.exists():
        with path.open(encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)
            if tuple(reader.fieldnames or ()) == tuple(fields):
                existing = list(reader)
    new_keys = {
        tuple(str(row[field]) for field in key_fields) for row in new_rows
    }
    kept = [
        row
        for row in existing
        if tuple(str(row[field]) for field in key_fields) not in new_keys
    ]
    merged = kept + new_rows
    merged.sort(
        key=lambda row: (
            10_000
            if row.get("multiplicador") in ("", None)
            else _int(row.get("multiplicador")),
            str(row.get("algorithm", "")),
        )
    )
    return merged


def _compare_one(
    scenario,
    multiplier,
    cp_instance,
    greedy_instance,
    cp_result,
    cp_source,
    restarts,
    time_limit,
):
    verification = verify_same_instance(cp_instance, greedy_instance)
    if not verification["same"]:
        raise ValueError(
            "Comparacion cancelada: instancias diferentes en "
            + ", ".join(verification["differences"])
        )
    model = preparar_instancia(cp_instance)
    if cp_result["required_blocks"] != model["required_blocks"]:
        raise ValueError(
            f"Comparacion cancelada en {scenario}: CP-SAT reporta "
            f"{cp_result['required_blocks']} bloques, pero la instancia tiene "
            f"{model['required_blocks']}"
        )
    greedy_result = solve_greedy(
        greedy_instance,
        restarts=restarts,
        time_limit_seconds=time_limit,
    )
    cp_row = _cp_raw(
        scenario, multiplier, cp_result, cp_source, verification
    )
    greedy_row = _greedy_raw(
        scenario, multiplier, greedy_result, verification
    )
    return cp_row, greedy_row, _summary(cp_row, greedy_row), verification


def run_synthetic(args):
    multipliers = list(dict.fromkeys(args.multipliers))
    if 30 in multipliers and not args.include_x30_greedy:
        raise SystemExit(
            "x30 requiere --include-x30-greedy; CP-SAT x30 nunca se reejecutara"
        )
    invalid = [value for value in multipliers if value not in (1, 2, 5, 10, 20, 30)]
    if invalid:
        raise SystemExit(f"Multiplicadores no soportados: {invalid}")

    raw_rows = []
    summary_rows = []
    audit = {
        "mode": "synthetic",
        "cpsat_rerun": False,
        "greedy_restarts_requested": args.greedy_restarts,
        "scenarios": [],
        "audit_41_of_175": {
            "artifact_found": False,
            "conclusion": (
                "No se encontro un artefacto 41/175 en resultados. La "
                "implementacion fortalecida se reevalua sobre x1 y solo "
                "coloca sesiones completas."
            ),
        },
    }
    for multiplier in multipliers:
        scenario = f"x{multiplier}"
        print(f"[COMPARE] {scenario}: verificando identidad de instancia...")
        cp_instance = generar_instancia_sintetica(multiplier)
        greedy_instance = copy_instance(cp_instance)
        cp_result, cp_source = load_existing_cp_result(
            args.resultados_dir, multiplier
        )
        cp_row, greedy_row, summary, verification = _compare_one(
            scenario,
            multiplier,
            cp_instance,
            greedy_instance,
            cp_result,
            cp_source,
            args.greedy_restarts,
            args.greedy_time_limit,
        )
        raw_rows.extend((cp_row, greedy_row))
        summary_rows.append(summary)
        audit["scenarios"].append(
            {
                "scenario": scenario,
                "same_instance": verification["same"],
                "instance_fingerprint": verification["cpsat_fingerprint"],
                "cp_source": str(Path(cp_source).resolve()),
                "greedy_status": greedy_row["status"],
                "greedy_assigned_blocks": greedy_row["assigned_blocks"],
                "required_blocks": greedy_row["required_blocks"],
            }
        )
        print(
            f"[COMPARE] {scenario}: greedy={greedy_row['status']} | "
            f"{greedy_row['assigned_blocks']}/{greedy_row['required_blocks']} | "
            f"time={greedy_row['runtime_seconds']:.6f}s"
        )
    return raw_rows, summary_rows, audit


def run_real(args):
    snapshot = args.real_instance or (
        Path(args.resultados_dir) / "real_instance.json"
    )
    if not snapshot.exists():
        raise SystemExit(
            "No existe snapshot real. Comparacion cancelada para no usar "
            f"instancias diferentes: {snapshot}"
        )
    payload = json.loads(snapshot.read_text(encoding="utf-8"))
    instance = payload.get("instance")
    cp_result_payload = payload.get("cpsat_result")
    if not isinstance(instance, dict) or not isinstance(cp_result_payload, dict):
        raise SystemExit(
            "El snapshot real debe contener objetos 'instance' y 'cpsat_result'"
        )
    cp_result = _normalize_cp_result(cp_result_payload)
    cp_row, greedy_row, summary, verification = _compare_one(
        "real",
        "",
        instance,
        copy_instance(instance),
        cp_result,
        snapshot,
        args.greedy_restarts,
        args.greedy_time_limit,
    )
    audit = {
        "mode": "real",
        "cpsat_rerun": False,
        "snapshot": str(snapshot.resolve()),
        "same_instance": verification,
    }
    return [cp_row, greedy_row], [summary], audit


def parse_args():
    default_results = Path(__file__).resolve().parent.parent / "results"
    parser = argparse.ArgumentParser(
        description="Compara CP-SAT existente con greedy fortalecido"
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--synthetic", action="store_true")
    mode.add_argument("--real", action="store_true")
    parser.add_argument(
        "--multipliers",
        type=int,
        nargs="+",
        default=list(DEFAULT_MULTIPLIERS),
    )
    parser.add_argument("--greedy-restarts", type=int, default=20)
    parser.add_argument("--greedy-time-limit", type=float)
    parser.add_argument("--skip-cpsat-rerun", action="store_true")
    parser.add_argument("--include-x30-greedy", action="store_true")
    parser.add_argument("--resultados-dir", type=Path, default=default_results)
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Directorio de salida; por defecto usa --resultados-dir",
    )
    parser.add_argument("--real-instance", type=Path)
    return parser.parse_args()


def main():
    args = parse_args()
    if args.greedy_restarts < 0:
        raise SystemExit("--greedy-restarts debe ser >= 0")
    args.resultados_dir = args.resultados_dir.resolve()
    args.output_dir = (
        args.output_dir.resolve()
        if args.output_dir is not None
        else args.resultados_dir
    )
    # El runner no contiene ninguna ruta que ejecute CP-SAT. El flag se acepta
    # para hacer explicita la metodologia solicitada.
    if args.synthetic:
        raw_rows, summary_rows, audit = run_synthetic(args)
    else:
        raw_rows, summary_rows, audit = run_real(args)

    raw_path = args.output_dir / "comparison_cpsat_vs_greedy_raw.csv"
    summary_path = args.output_dir / "comparison_cpsat_vs_greedy_summary.csv"
    audit_path = args.output_dir / "comparison_cpsat_vs_greedy_audit.json"
    args.output_dir.mkdir(parents=True, exist_ok=True)
    raw_rows = _merge_existing(
        raw_path,
        RAW_FIELDS,
        raw_rows,
        key_fields=("scenario", "algorithm"),
    )
    summary_rows = _merge_existing(
        summary_path,
        SUMMARY_FIELDS,
        summary_rows,
        key_fields=("scenario",),
    )
    _write_csv(raw_path, RAW_FIELDS, raw_rows)
    _write_csv(summary_path, SUMMARY_FIELDS, summary_rows)
    audit_path.write_text(
        json.dumps(audit, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[COMPARE] Raw: {raw_path}")
    print(f"[COMPARE] Summary: {summary_path}")
    print(f"[COMPARE] Audit: {audit_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
