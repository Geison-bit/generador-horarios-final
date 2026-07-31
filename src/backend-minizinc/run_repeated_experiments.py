"""Protocolo de repeticiones independientes CP-SAT vs Greedy.

Por defecto solo admite x1, x2, x5 y x10. x20 requiere ``--include-x20``;
x30 y x50 requieren autorizaciones explicitas y nunca se activan por defecto.
"""

import argparse
import copy
import csv
import json
import statistics
import time
from collections import Counter
from contextlib import redirect_stdout
from pathlib import Path

from baseline_greedy import (
    instance_fingerprint,
    preparar_instancia,
    solve_greedy,
)
from generador_python import generar_horario_cp
import stress_runner


DEFAULT_MULTIPLIERS = (1, 2, 5, 10)
DEFAULT_RUNS = 10
GREEDY_RESTARTS = 20

RAW_FIELDS = (
    "instance_type",
    "scenario",
    "run_id",
    "seed",
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
    "solver_conflicts",
    "solver_branches",
    "workers",
    "time_limit_seconds",
    "instance_hash_sha256",
    "observation",
)

SUMMARY_FIELDS = (
    "instance_type",
    "scenario",
    "algorithm",
    "runs",
    "required_blocks",
    "mean_assigned_blocks",
    "mean_coverage",
    "sd_coverage",
    "min_coverage",
    "max_coverage",
    "mean_runtime",
    "sd_runtime",
    "min_runtime",
    "max_runtime",
    "mean_solver_conflicts",
    "sd_solver_conflicts",
    "mean_solver_branches",
    "sd_solver_branches",
    "complete_runs",
    "partial_runs",
    "optimal_runs",
    "feasible_runs",
    "failed_runs",
)


def _synthetic_instance(multiplier):
    if multiplier != 50:
        return stress_runner.generar_instancia_sintetica(multiplier)
    # x50 es una escala historica. Solo se habilita tras --allow-x50.
    original = stress_runner.MULTIPLICADORES_OFICIALES
    try:
        stress_runner.MULTIPLICADORES_OFICIALES = tuple(
            sorted(set(original + (50,)))
        )
        return stress_runner.generar_instancia_sintetica(50)
    finally:
        stress_runner.MULTIPLICADORES_OFICIALES = original


def _load_web_snapshot(path):
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"No existe snapshot web real: {path}")
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    instance = snapshot.get("instance")
    if not isinstance(instance, dict):
        raise ValueError("Snapshot web invalido: falta el objeto 'instance'")
    calculated = instance_fingerprint(instance)
    stored = snapshot.get("instance_hash_sha256")
    if calculated != stored:
        raise ValueError("Snapshot web invalido: hash SHA-256 no coincide")
    return copy.deepcopy(instance), calculated


def _cp_row(
    instance_type,
    scenario,
    run_id,
    seed,
    instance,
    workers,
    time_limit_seconds,
    log_path,
):
    required = preparar_instancia(instance)["required_blocks"]
    instance_hash = instance_fingerprint(instance)
    started = time.perf_counter()
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("w", encoding="utf-8") as log_file, redirect_stdout(
            log_file
        ):
            result = generar_horario_cp(
                docentes=copy.deepcopy(instance["docentes"]),
                asignaciones=copy.deepcopy(instance["asignaciones"]),
                restricciones=copy.deepcopy(instance["restricciones"]),
                horas_curso_grado=copy.deepcopy(instance["horas_curso_grado"]),
                nivel=instance.get("nivel", "Secundaria"),
                version=instance.get("version", 1),
                patrones_division=copy.deepcopy(
                    instance.get("patrones_division") or {}
                ),
                time_limit_seconds=time_limit_seconds,
                workers=workers,
                random_seed=seed,
            )
        metrics = result.get("metricas") or {}
        assigned = int(metrics.get("bloques_asignados", 0))
        measured_required = int(metrics.get("bloques_requeridos", required))
        if measured_required != required:
            raise ValueError(
                f"CP-SAT reporto {measured_required}, instancia requiere {required}"
            )
        status = str(metrics.get("estado_solver", result.get("status", "UNKNOWN")))
        return {
            "instance_type": instance_type,
            "scenario": scenario,
            "run_id": run_id,
            "seed": seed,
            "algorithm": "CP-SAT",
            "required_blocks": required,
            "assigned_blocks": assigned,
            "coverage_rate": assigned / required if required else 0.0,
            "unassigned_blocks": max(0, required - assigned),
            "status": status,
            "runtime_seconds": float(
                metrics.get(
                    "tiempo_ejecucion_segundos",
                    time.perf_counter() - started,
                )
            ),
            "teacher_conflicts": int(metrics.get("conflictos_docentes", 0)),
            "group_conflicts": int(metrics.get("conflictos_grupo", 0)),
            "availability_violations": int(
                metrics.get("violaciones_disponibilidad", 0)
            ),
            "workload_violations": int(metrics.get("violaciones_carga", 0)),
            "solver_conflicts": int(metrics.get("num_conflicts", 0)),
            "solver_branches": int(metrics.get("num_branches", 0)),
            "workers": workers,
            "time_limit_seconds": (
                "" if time_limit_seconds is None else time_limit_seconds
            ),
            "instance_hash_sha256": instance_hash,
            "observation": (
                f"CP-SAT random_seed={seed}; log={log_path.resolve()}"
            ),
        }
    except Exception as exc:
        return {
            "instance_type": instance_type,
            "scenario": scenario,
            "run_id": run_id,
            "seed": seed,
            "algorithm": "CP-SAT",
            "required_blocks": required,
            "assigned_blocks": 0,
            "coverage_rate": 0.0,
            "unassigned_blocks": required,
            "status": "ERROR",
            "runtime_seconds": time.perf_counter() - started,
            "teacher_conflicts": 0,
            "group_conflicts": 0,
            "availability_violations": 0,
            "workload_violations": 0,
            "solver_conflicts": "",
            "solver_branches": "",
            "workers": workers,
            "time_limit_seconds": (
                "" if time_limit_seconds is None else time_limit_seconds
            ),
            "instance_hash_sha256": instance_hash,
            "observation": f"CP-SAT execution error: {exc}",
        }


def _greedy_row(
    instance_type,
    scenario,
    run_id,
    seed,
    instance,
    workers,
    time_limit_seconds,
):
    result = solve_greedy(
        copy.deepcopy(instance),
        restarts=GREEDY_RESTARTS,
        seed=seed,
        time_limit_seconds=time_limit_seconds,
    )
    return {
        "instance_type": instance_type,
        "scenario": scenario,
        "run_id": run_id,
        "seed": seed,
        "algorithm": "Greedy",
        "required_blocks": result["required_blocks"],
        "assigned_blocks": result["assigned_blocks"],
        "coverage_rate": result["coverage_rate"],
        "unassigned_blocks": result["unassigned_blocks"],
        "status": result["status"],
        "runtime_seconds": result["runtime_seconds"],
        "teacher_conflicts": result["teacher_conflicts"],
        "group_conflicts": result["group_conflicts"],
        "availability_violations": result["availability_violations"],
        "workload_violations": result["workload_violations"],
        "solver_conflicts": "",
        "solver_branches": "",
        "workers": workers,
        "time_limit_seconds": (
            "" if time_limit_seconds is None else time_limit_seconds
        ),
        "instance_hash_sha256": result["instance_fingerprint"],
        "observation": (
            f"{result['observacion']}; greedy_restarts={GREEDY_RESTARTS}; "
            f"restarts_used={result['greedy_restarts_used']}; "
            f"best_restart={result['best_restart']}"
        ),
    }


def _write_raw(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=RAW_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def _read_raw(path):
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def _numeric(rows, field):
    return [
        float(row[field])
        for row in rows
        if row.get(field) not in ("", None)
    ]


def _mean(values):
    return statistics.fmean(values) if values else ""


def _sd(values):
    return statistics.stdev(values) if len(values) > 1 else 0.0 if values else ""


def summarize(raw_rows):
    grouped = {}
    for row in raw_rows:
        key = (row["instance_type"], row["scenario"], row["algorithm"])
        grouped.setdefault(key, []).append(row)
    summary = []
    for (instance_type, scenario, algorithm), rows in sorted(grouped.items()):
        assigned = _numeric(rows, "assigned_blocks")
        coverage = _numeric(rows, "coverage_rate")
        runtime = _numeric(rows, "runtime_seconds")
        conflicts = _numeric(rows, "solver_conflicts")
        branches = _numeric(rows, "solver_branches")
        statuses = Counter(str(row["status"]) for row in rows)
        complete_runs = sum(
            1
            for row in rows
            if int(float(row["assigned_blocks"])) == int(row["required_blocks"])
            and row["status"] in {"OPTIMAL", "FEASIBLE", "COMPLETE"}
        )
        partial_runs = sum(
            1
            for row in rows
            if row["status"] == "PARTIAL"
            or int(float(row["assigned_blocks"])) < int(row["required_blocks"])
            and row["status"] not in {"ERROR", "UNKNOWN", "INFEASIBLE"}
        )
        failed_runs = sum(
            statuses.get(status, 0)
            for status in ("ERROR", "UNKNOWN", "INFEASIBLE", "MODEL_INVALID", "INTERRUPTED")
        )
        summary.append(
            {
                "instance_type": instance_type,
                "scenario": scenario,
                "algorithm": algorithm,
                "runs": len(rows),
                "required_blocks": int(rows[0]["required_blocks"]),
                "mean_assigned_blocks": _mean(assigned),
                "mean_coverage": _mean(coverage),
                "sd_coverage": _sd(coverage),
                "min_coverage": min(coverage),
                "max_coverage": max(coverage),
                "mean_runtime": _mean(runtime),
                "sd_runtime": _sd(runtime),
                "min_runtime": min(runtime),
                "max_runtime": max(runtime),
                "mean_solver_conflicts": _mean(conflicts),
                "sd_solver_conflicts": _sd(conflicts),
                "mean_solver_branches": _mean(branches),
                "sd_solver_branches": _sd(branches),
                "complete_runs": complete_runs,
                "partial_runs": partial_runs,
                "optimal_runs": statuses.get("OPTIMAL", 0),
                "feasible_runs": statuses.get("FEASIBLE", 0),
                "failed_runs": failed_runs,
                "_status_summary": ";".join(
                    f"{status}:{count}" for status, count in sorted(statuses.items())
                ),
            }
        )
    return summary


def _write_summary(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=SUMMARY_FIELDS)
        writer.writeheader()
        writer.writerows(
            {
                field: row[field]
                for field in SUMMARY_FIELDS
            }
            for row in rows
        )


def _print_table(summary):
    headers = (
        "scenario",
        "algorithm",
        "runs",
        "mean_runtime",
        "sd_runtime",
        "min_runtime",
        "max_runtime",
        "mean_coverage",
        "complete_runs",
        "status_summary",
    )
    print("\n" + " | ".join(headers))
    print("-" * 150)
    for row in summary:
        values = (
            row["scenario"],
            row["algorithm"],
            str(row["runs"]),
            f"{float(row['mean_runtime']):.6f}",
            f"{float(row['sd_runtime']):.6f}",
            f"{float(row['min_runtime']):.6f}",
            f"{float(row['max_runtime']):.6f}",
            f"{float(row['mean_coverage']):.6f}",
            str(row["complete_runs"]),
            row["_status_summary"],
        )
        print(" | ".join(values))


def _validate_multipliers(args):
    multipliers = list(dict.fromkeys(args.multipliers))
    if args.include_x20 and 20 not in multipliers:
        multipliers.append(20)
    if 20 in multipliers and not args.include_x20:
        raise SystemExit(
            "ADVERTENCIA: x20 no se ejecuta por defecto. Usa --include-x20."
        )
    if 30 in multipliers and not args.allow_x30:
        raise SystemExit(
            "ADVERTENCIA: x30 bloqueado. Solo se permite con --allow-x30."
        )
    if 50 in multipliers and not args.allow_x50:
        raise SystemExit(
            "ADVERTENCIA: x50 bloqueado. Solo se permite con --allow-x50."
        )
    invalid = [
        value for value in multipliers
        if value not in {1, 2, 5, 10, 20, 30, 50}
    ]
    if invalid:
        raise SystemExit(f"Multiplicadores no soportados: {invalid}")
    return multipliers


def parse_args():
    results_dir = Path(__file__).resolve().parent / "resultados"
    parser = argparse.ArgumentParser(
        description="Repeticiones independientes CP-SAT vs Greedy"
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--synthetic", action="store_true")
    mode.add_argument("--web-real", action="store_true")
    mode.add_argument("--all", action="store_true")
    parser.add_argument(
        "--multipliers",
        type=int,
        nargs="+",
        default=list(DEFAULT_MULTIPLIERS),
    )
    parser.add_argument("--runs", type=int, default=DEFAULT_RUNS)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--time-limit", type=float)
    parser.add_argument("--include-x20", action="store_true")
    parser.add_argument("--allow-x30", action="store_true")
    parser.add_argument("--allow-x50", action="store_true")
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Reanuda desde las filas ya guardadas sin repetir algoritmos terminados.",
    )
    parser.add_argument(
        "--web-snapshot",
        type=Path,
        default=results_dir / "web_real_instance_last.json",
    )
    parser.add_argument(
        "--raw-output",
        type=Path,
        default=results_dir / "repeated_runs_raw.csv",
    )
    parser.add_argument(
        "--summary-output",
        type=Path,
        default=results_dir / "repeated_runs_summary.csv",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    if args.runs <= 0:
        raise SystemExit("--runs debe ser positivo")
    if args.workers <= 0:
        raise SystemExit("--workers debe ser positivo")
    if args.time_limit is not None and args.time_limit <= 0:
        raise SystemExit("--time-limit debe ser positivo")

    scenarios = []
    if args.synthetic or args.all:
        for multiplier in _validate_multipliers(args):
            scenarios.append(
                ("synthetic", f"x{multiplier}", _synthetic_instance(multiplier))
            )
    if args.web_real or args.all:
        try:
            web_instance, web_hash = _load_web_snapshot(args.web_snapshot.resolve())
        except FileNotFoundError:
            if args.web_real:
                raise
            print("[WARN] Snapshot web real ausente; se omite en --all.")
        else:
            if instance_fingerprint(web_instance) != web_hash:
                raise SystemExit("Hash web real invalido")
            scenarios.append(("web-real", "web-real", web_instance))

    raw_path = args.raw_output.resolve()
    raw_rows = _read_raw(raw_path) if args.resume else []
    completed = {
        (
            row["instance_type"],
            row["scenario"],
            int(row["run_id"]),
            int(row["seed"]),
            row["algorithm"],
        )
        for row in raw_rows
    }
    if args.resume:
        print(
            f"[REPEATED] Reanudando con {len(raw_rows)} filas ya guardadas.",
            flush=True,
        )
    try:
        for instance_type, scenario, instance in scenarios:
            print(f"[REPEATED] Escenario {scenario}")
            for run_id in range(1, args.runs + 1):
                seed = run_id
                cp_key = (instance_type, scenario, run_id, seed, "CP-SAT")
                if cp_key not in completed:
                    print(
                        f"[REPEATED] {scenario} run={run_id}/{args.runs} "
                        f"seed={seed} CP-SAT...",
                        flush=True,
                    )
                    cp_row = _cp_row(
                        instance_type,
                        scenario,
                        run_id,
                        seed,
                        instance,
                        args.workers,
                        args.time_limit,
                        Path(__file__).resolve().parent
                        / "resultados"
                        / "repeated_logs"
                        / f"{scenario}_run{run_id}_cpsat.log",
                    )
                    raw_rows.append(cp_row)
                    completed.add(cp_key)
                    _write_raw(raw_path, raw_rows)

                greedy_key = (instance_type, scenario, run_id, seed, "Greedy")
                if greedy_key not in completed:
                    print(
                        f"[REPEATED] {scenario} run={run_id}/{args.runs} "
                        f"seed={seed} Greedy...",
                        flush=True,
                    )
                    greedy_row = _greedy_row(
                        instance_type,
                        scenario,
                        run_id,
                        seed,
                        instance,
                        args.workers,
                        args.time_limit,
                    )
                    raw_rows.append(greedy_row)
                    completed.add(greedy_key)
                    _write_raw(raw_path, raw_rows)
    except KeyboardInterrupt:
        print("[REPEATED] Interrumpido; resultados parciales guardados.")
        summary = summarize(raw_rows)
        _write_summary(args.summary_output.resolve(), summary)
        _print_table(summary)
        return 130

    summary = summarize(raw_rows)
    _write_summary(args.summary_output.resolve(), summary)
    _print_table(summary)
    print(f"\n[REPEATED] Raw: {args.raw_output.resolve()}")
    print(f"[REPEATED] Summary: {args.summary_output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
