"""Runner reproducible para las pruebas de estres CP-SAT.

La unidad de escala es una seccion completa de Secundaria: cinco grupos,
ocho docentes y 175 bloques. El runner no usa Flask ni Supabase.
"""

import argparse
import csv
import json
import sys
import threading
import time
from contextlib import redirect_stdout
from pathlib import Path

from backend.solver.generador_python import generar_horario_cp, normalizar_entero


MULTIPLICADORES_OFICIALES = (1, 2, 5, 10, 20, 30)
GRUPOS_POR_SECCION = 5
DOCENTES_POR_SECCION = 8
BLOQUES_POR_GRUPO = 35
BLOQUES_POR_SECCION = GRUPOS_POR_SECCION * BLOQUES_POR_GRUPO

# Plantilla curricular sintetica: cinco cargas 3+2 y cinco cargas de 2.
# Su suma por grupo es exactamente 35 y todos los patrones son explicitos.
PLANTILLA_CURSOS = (
    {"id": 101, "horas": 5, "patron": [3, 2]},
    {"id": 102, "horas": 5, "patron": [3, 2]},
    {"id": 103, "horas": 5, "patron": [3, 2]},
    {"id": 104, "horas": 5, "patron": [3, 2]},
    {"id": 105, "horas": 5, "patron": [3, 2]},
    {"id": 106, "horas": 2, "patron": [2]},
    {"id": 107, "horas": 2, "patron": [2]},
    {"id": 108, "horas": 2, "patron": [2]},
    {"id": 109, "horas": 2, "patron": [2]},
    {"id": 110, "horas": 2, "patron": [2]},
)

CSV_FIELDS = (
    "multiplicador",
    "secciones_generadas",
    "grupos_calculados",
    "docentes_calculados",
    "cursos_catalogo",
    "asignaciones_calculadas",
    "bloques_esperados_teoricos",
    "bloques_requeridos_calculados",
    "bloques_asignados",
    "coverage_rate",
    "solver_status",
    "tiempo_segundos",
    "time_limit_mode",
    "time_limit_seconds",
    "workers",
    "conflictos_docente",
    "conflictos_grupo",
    "violaciones_disponibilidad",
    "violaciones_carga",
    "solver_conflicts",
    "solver_branches",
    "progress_enabled",
    "solutions_found",
    "interrupted",
    "solver_log_path",
    "progress_log_path",
    "solucion_encontrada",
    "estructura_valida",
    "observacion",
)


class StressProgressMonitor:
    """Escribe etapas, soluciones completas y heartbeat sin progreso ficticio."""

    def __init__(
        self,
        scenario,
        required_blocks,
        log_path,
        interval_seconds=60,
        console_stream=None,
    ):
        self.scenario = str(scenario)
        self.required_blocks = int(required_blocks)
        self.log_path = Path(log_path)
        self.interval_seconds = float(interval_seconds)
        self.console_stream = console_stream or sys.stdout
        self.solution_count = 0
        self.solver_started_at = None
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread = None
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self._log_file = self.log_path.open("w", encoding="utf-8")

    def _write(self, message):
        with self._lock:
            print(message, file=self.console_stream, flush=True)
            print(message, file=self._log_file, flush=True)

    def stage(self, message):
        self._write(f"[STRESS][{self.scenario}] {message}")

    def __call__(self, event):
        event_type = event.get("type")
        if event_type == "model_build_started":
            self.stage("Construyendo modelo CP-SAT...")
        elif event_type == "model_built":
            self.stage("Modelo construido.")
        elif event_type == "solver_started":
            self.solver_started_at = float(event.get("started_at", time.time()))
            mode = "unlimited" if event.get("time_limit_seconds") is None else "limited"
            self.stage("Iniciando solver...")
            self.stage(f"Modo de tiempo: {mode}")
            self.stage(f"Workers: {event.get('workers')}")
            self._start_heartbeat()
        elif event_type == "solution":
            self.solution_count = int(event.get("solution_number", self.solution_count + 1))
            coverage = event.get("coverage_rate")
            coverage_text = f"{coverage * 100:.2f}%" if coverage is not None else "n/a"
            self._write(
                f"[STRESS][{self.scenario}][SOLUTION] "
                f"elapsed={event.get('elapsed_seconds', 0):.0f}s | "
                f"solution_number={self.solution_count} | "
                f"assigned_blocks={event.get('assigned_blocks')} | "
                f"required_blocks={self.required_blocks} | coverage={coverage_text}"
            )
        elif event_type == "solver_finished":
            self.solution_count = int(event.get("solutions_found", self.solution_count))
            self._stop_heartbeat()
            self.stage(
                "Solver finalizado: "
                f"status={event.get('status')} | "
                f"runtime={event.get('elapsed_seconds', 0):.3f}s | "
                f"conflicts={event.get('conflicts')} | branches={event.get('branches')}"
            )

    def _heartbeat(self):
        while not self._stop_event.wait(self.interval_seconds):
            started_at = self.solver_started_at or time.time()
            elapsed = time.time() - started_at
            self._write(
                f"[STRESS][{self.scenario}][RUNNING] elapsed={elapsed:.0f}s | "
                f"required_blocks={self.required_blocks} | status=solving | "
                f"solutions_found={self.solution_count}"
            )

    def _start_heartbeat(self):
        if self._thread is not None:
            return
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._heartbeat,
            name=f"heartbeat-{self.scenario}",
            daemon=True,
        )
        self._thread.start()

    def _stop_heartbeat(self):
        self._stop_event.set()
        if self._thread is not None and self._thread is not threading.current_thread():
            self._thread.join(timeout=min(5.0, self.interval_seconds + 1.0))
        self._thread = None

    def interrupted(self, elapsed_seconds):
        self._stop_heartbeat()
        self.stage(f"Ejecucion interrumpida por el usuario tras {elapsed_seconds:.3f}s")

    def close(self):
        self._stop_heartbeat()
        if not self._log_file.closed:
            self._log_file.close()


class SolverLogWriter:
    """Conserva el log CP-SAT completo y limita su eco en consola."""

    IMPORTANT_TOKENS = (
        "cpsolverresponse summary",
        "status:",
        "conflicts:",
        "branches:",
        "walltime:",
        "deterministic_time:",
        "presolve summary",
        "starting cp-sat solver",
    )

    def __init__(self, scenario, path, console_stream=None):
        self.scenario = str(scenario)
        self.path = Path(path)
        self.console_stream = console_stream or sys.stdout
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._file = self.path.open("w", encoding="utf-8")
        self._lock = threading.Lock()
        self._last_console_at = 0.0

    def __call__(self, message):
        text = str(message)
        with self._lock:
            self._file.write(text)
            if text and not text.endswith("\n"):
                self._file.write("\n")
            self._file.flush()
            for line in text.splitlines():
                lowered = line.lower()
                if not any(token in lowered for token in self.IMPORTANT_TOKENS):
                    continue
                now = time.monotonic()
                always_show = "cpsolverresponse summary" in lowered or "status:" in lowered
                if always_show or now - self._last_console_at >= 5.0:
                    print(
                        f"[STRESS][{self.scenario}][CP-SAT] {line}",
                        file=self.console_stream,
                        flush=True,
                    )
                    self._last_console_at = now

    def close(self):
        with self._lock:
            if not self._file.closed:
                self._file.close()


def generar_instancia_sintetica(multiplicador):
    """Replica secciones completas sin alterar las 35 horas de cada grupo."""
    multiplicador = int(multiplicador)
    if multiplicador not in MULTIPLICADORES_OFICIALES:
        raise ValueError(
            f"Multiplicador no oficial: {multiplicador}. "
            f"Usa uno de {MULTIPLICADORES_OFICIALES}."
        )

    docentes = []
    asignaciones = {}
    horas_curso_grado = {}
    patrones_division = {}
    grupos = []
    secciones = []

    for seccion_idx in range(multiplicador):
        seccion_num = seccion_idx + 1
        seccion_id = f"S{seccion_num:03d}"
        secciones.append(seccion_id)

        primer_docente_id = seccion_idx * DOCENTES_POR_SECCION + 1
        docentes_seccion = []
        for offset in range(DOCENTES_POR_SECCION):
            docente_id = primer_docente_id + offset
            docentes_seccion.append(docente_id)
            docentes.append({
                "id": docente_id,
                "nombre": f"Docente {docente_id}",
                "jornada_total": BLOQUES_POR_GRUPO,
            })

        for grado_id in range(1, GRUPOS_POR_SECCION + 1):
            grupo_id = seccion_idx * GRUPOS_POR_SECCION + grado_id
            grupos.append({
                "id": grupo_id,
                "grado_id": grado_id,
                "seccion": seccion_id,
            })

            for curso_idx, curso in enumerate(PLANTILLA_CURSOS):
                curso_key = str(curso["id"])
                grupo_key = str(grupo_id)
                docente_id = docentes_seccion[curso_idx % DOCENTES_POR_SECCION]

                asignaciones.setdefault(curso_key, {})[grupo_key] = {
                    "docente_id": docente_id,
                    "curso_id": curso["id"],
                    "grado_id": grado_id,
                    "seccion_id": grupo_id,
                }
                horas_curso_grado.setdefault(curso_key, {})[grupo_key] = curso["horas"]
                patrones_division[f"{curso['id']}-{grupo_id}"] = list(curso["patron"])

    return {
        "docentes": docentes,
        "asignaciones": asignaciones,
        "restricciones": {
            "disponibilidad": {},
            "reglas": {"limitar_carga_docente_grado": True},
        },
        "horas_curso_grado": horas_curso_grado,
        "nivel": "Secundaria",
        "version": 1,
        "patrones_division": patrones_division,
        "metadata": {
            "multiplicador": multiplicador,
            "secciones": secciones,
            "grupos": grupos,
            "cursos_catalogo": len(PLANTILLA_CURSOS),
        },
    }


def contar_datos_modelables(instancia):
    """Reproduce el filtro con el que CP-SAT forma map_asignaciones."""
    asignaciones = instancia["asignaciones"]
    horas_curso_grado = instancia["horas_curso_grado"]
    cantidad = 0
    bloques = 0

    for curso_id, targets in horas_curso_grado.items():
        for target_id, horas in targets.items():
            horas_int = normalizar_entero(horas)
            datos = asignaciones.get(str(curso_id), {}).get(str(target_id), {})
            docente_id = normalizar_entero(datos.get("docente_id"))
            if horas_int > 0 and docente_id > 0:
                cantidad += 1
                bloques += horas_int
    return cantidad, bloques


def resolver_limite_tiempo(time_limit, no_time_limit=False):
    """Resuelve la prioridad CLI: --no-time-limit siempre gana."""
    if no_time_limit:
        return None
    if time_limit is None:
        return None
    limite = float(time_limit)
    if limite <= 0:
        raise ValueError("time_limit debe ser mayor que cero")
    return limite


def resolver_progress(multiplicador, progress_requested=False):
    """x30 siempre tiene monitor; las demas escalas respetan --progress."""
    return bool(progress_requested or int(multiplicador) == 30)


def construir_observacion(solver_status, time_limit_seconds, coverage_rate=None):
    """Describe el resultado real sin atribuir UNKNOWN a un limite inexistente."""
    status = str(solver_status or "UNKNOWN").upper()
    if time_limit_seconds is None:
        mensajes_sin_limite = {
            "OPTIMAL": "Optimal solution found without explicit time limit",
            "FEASIBLE": "Feasible solution found without explicit time limit",
            "INFEASIBLE": "Instance proved infeasible without explicit time limit",
            "UNKNOWN": "Solver returned UNKNOWN even without explicit time limit or execution was interrupted",
        }
        return mensajes_sin_limite.get(
            status,
            f"Solver returned {status} without explicit time limit",
        )
    if status in {"OPTIMAL", "FEASIBLE"} and coverage_rate == 1.0:
        return "Estructura valida; solucion factible con cobertura completa"
    return (
        f"Estructura valida; solver_status={status}; "
        f"coverage_rate={coverage_rate}"
    )


def validar_estructura(instancia):
    """Valida conteos oficiales, referencias y carga exacta de cada grupo."""
    meta = instancia["metadata"]
    multiplicador = meta["multiplicador"]
    errores = []
    grupos = meta["grupos"]
    docentes = instancia["docentes"]
    docente_ids = [normalizar_entero(d["id"]) for d in docentes]
    docente_id_set = set(docente_ids)
    grupo_ids = [normalizar_entero(g["id"]) for g in grupos]

    esperado_secciones = multiplicador
    esperado_grupos = multiplicador * GRUPOS_POR_SECCION
    esperado_docentes = multiplicador * DOCENTES_POR_SECCION
    esperado_bloques = multiplicador * BLOQUES_POR_SECCION

    if len(meta["secciones"]) != esperado_secciones:
        errores.append(f"secciones={len(meta['secciones'])}, esperado={esperado_secciones}")
    if len(grupos) != esperado_grupos:
        errores.append(f"grupos={len(grupos)}, esperado={esperado_grupos}")
    if len(docentes) != esperado_docentes:
        errores.append(f"docentes={len(docentes)}, esperado={esperado_docentes}")
    if len(docente_id_set) != len(docente_ids):
        errores.append("hay IDs de docente duplicados")
    if len(set(grupo_ids)) != len(grupo_ids):
        errores.append("hay IDs de grupo duplicados")

    horas_por_grupo = {grupo_id: 0 for grupo_id in grupo_ids}
    for curso_id, targets in instancia["horas_curso_grado"].items():
        for grupo_id, horas in targets.items():
            grupo_int = normalizar_entero(grupo_id)
            if grupo_int not in horas_por_grupo:
                errores.append(f"curso {curso_id} referencia grupo inexistente {grupo_id}")
                continue
            datos = instancia["asignaciones"].get(str(curso_id), {}).get(str(grupo_id))
            if not datos:
                errores.append(f"falta asignacion para curso={curso_id}, grupo={grupo_id}")
                continue
            docente_id = normalizar_entero(datos.get("docente_id"))
            if docente_id not in docente_id_set:
                errores.append(f"docente inexistente {docente_id} en curso={curso_id}, grupo={grupo_id}")
            horas_int = normalizar_entero(horas)
            horas_por_grupo[grupo_int] += horas_int
            patron = instancia["patrones_division"].get(f"{curso_id}-{grupo_id}")
            if not patron or sum(normalizar_entero(v) for v in patron) != horas_int:
                errores.append(f"patron invalido para curso={curso_id}, grupo={grupo_id}")

    for grupo_id, total in horas_por_grupo.items():
        if total != BLOQUES_POR_GRUPO:
            errores.append(f"grupo {grupo_id}: bloques={total}, esperado={BLOQUES_POR_GRUPO}")

    _, bloques_modelables = contar_datos_modelables(instancia)
    if bloques_modelables != esperado_bloques:
        errores.append(f"bloques_modelables={bloques_modelables}, esperado={esperado_bloques}")

    return len(errores) == 0, errores


def crear_fila_base(
    instancia,
    time_limit_seconds,
    workers,
    progress_enabled=False,
    solver_log_path=None,
    progress_log_path=None,
):
    meta = instancia["metadata"]
    multiplicador = meta["multiplicador"]
    asignaciones_calculadas, bloques_requeridos = contar_datos_modelables(instancia)
    estructura_valida, errores = validar_estructura(instancia)
    return {
        "multiplicador": multiplicador,
        "secciones_generadas": len(meta["secciones"]),
        "grupos_calculados": len(meta["grupos"]),
        "docentes_calculados": len(instancia["docentes"]),
        "cursos_catalogo": meta["cursos_catalogo"],
        "asignaciones_calculadas": asignaciones_calculadas,
        "bloques_esperados_teoricos": multiplicador * BLOQUES_POR_SECCION,
        "bloques_requeridos_calculados": bloques_requeridos,
        "bloques_asignados": None,
        "coverage_rate": None,
        "solver_status": None,
        "tiempo_segundos": None,
        "time_limit_mode": "unlimited" if time_limit_seconds is None else "limited",
        "time_limit_seconds": (
            float(time_limit_seconds) if time_limit_seconds is not None else None
        ),
        "workers": int(workers),
        "conflictos_docente": None,
        "conflictos_grupo": None,
        "violaciones_disponibilidad": None,
        "violaciones_carga": None,
        "solver_conflicts": None,
        "solver_branches": None,
        "progress_enabled": bool(progress_enabled),
        "solutions_found": 0 if progress_enabled else None,
        "interrupted": False,
        "solver_log_path": str(Path(solver_log_path).resolve()) if solver_log_path else "",
        "progress_log_path": str(Path(progress_log_path).resolve()) if progress_log_path else "",
        "solucion_encontrada": False,
        "estructura_valida": estructura_valida,
        "observacion": "Estructura valida" if estructura_valida else "; ".join(errores),
    }


def ejecutar_instancia(
    instancia,
    time_limit_seconds,
    workers,
    log_path,
    progress_enabled=False,
    progress_log_path=None,
    solver_log_path=None,
    heartbeat_interval_seconds=60,
):
    meta = instancia["metadata"]
    scenario = f"x{meta['multiplicador']}"
    _, required_blocks = contar_datos_modelables(instancia)
    console_stream = sys.stdout
    monitor = None
    solver_logger = None
    if progress_enabled:
        monitor = StressProgressMonitor(
            scenario=scenario,
            required_blocks=required_blocks,
            log_path=progress_log_path,
            interval_seconds=heartbeat_interval_seconds,
            console_stream=console_stream,
        )
        monitor.stage("Validando estructura...")

    fila = crear_fila_base(
        instancia,
        time_limit_seconds,
        workers,
        progress_enabled=progress_enabled,
        solver_log_path=solver_log_path if progress_enabled else None,
        progress_log_path=progress_log_path if progress_enabled else None,
    )
    if monitor:
        if fila["estructura_valida"]:
            monitor.stage("Estructura valida.")
            monitor.stage(f"Secciones: {fila['secciones_generadas']}")
            monitor.stage(f"Grupos: {fila['grupos_calculados']}")
            monitor.stage(f"Docentes: {fila['docentes_calculados']}")
            monitor.stage(f"Asignaciones: {fila['asignaciones_calculadas']}")
            monitor.stage(f"Bloques requeridos: {fila['bloques_requeridos_calculados']}")
        else:
            monitor.stage(f"Estructura invalida: {fila['observacion']}")
    if not fila["estructura_valida"]:
        if monitor:
            monitor.close()
        return fila

    log_path.parent.mkdir(parents=True, exist_ok=True)
    if progress_enabled:
        solver_logger = SolverLogWriter(
            scenario=scenario,
            path=solver_log_path,
            console_stream=console_stream,
        )
    try:
        with log_path.open("w", encoding="utf-8") as log_file, redirect_stdout(log_file):
            resultado = generar_horario_cp(
                docentes=instancia["docentes"],
                asignaciones=instancia["asignaciones"],
                restricciones=instancia["restricciones"],
                horas_curso_grado=instancia["horas_curso_grado"],
                nivel=instancia["nivel"],
                version=instancia["version"],
                patrones_division=instancia["patrones_division"],
                time_limit_seconds=time_limit_seconds,
                workers=workers,
                progress_callback=monitor,
                log_search_progress=progress_enabled,
                solver_log_callback=solver_logger,
                progress_scenario=scenario,
                progress_print_interval_seconds=heartbeat_interval_seconds,
            )
    except KeyboardInterrupt as exc:
        elapsed = (
            time.time() - monitor.solver_started_at
            if monitor and monitor.solver_started_at
            else 0.0
        )
        if monitor:
            monitor.interrupted(elapsed)
        exc.solutions_found = monitor.solution_count if monitor else 0
        raise
    except Exception as exc:
        fila["solver_status"] = "ERROR"
        fila["solucion_encontrada"] = False
        if time_limit_seconds is None:
            fila["observacion"] = f"Execution error without explicit time limit: {exc}"
        else:
            fila["observacion"] = f"Estructura valida; error de ejecucion: {exc}"
        return fila
    finally:
        if solver_logger:
            solver_logger.close()
        if monitor:
            monitor.close()

    metricas = resultado.get("metricas", {})
    requeridos = normalizar_entero(metricas.get("bloques_requeridos"))
    asignados = normalizar_entero(metricas.get("bloques_asignados"))
    coverage_rate = (asignados / requeridos) if requeridos > 0 else None

    fila.update({
        "bloques_requeridos_calculados": requeridos,
        "bloques_asignados": asignados,
        "coverage_rate": round(coverage_rate, 6) if coverage_rate is not None else None,
        "solver_status": metricas.get("estado_solver", resultado.get("status")),
        "tiempo_segundos": metricas.get("tiempo_ejecucion_segundos"),
        "time_limit_mode": "unlimited" if time_limit_seconds is None else "limited",
        "time_limit_seconds": metricas.get(
            "time_limit_seconds",
            float(time_limit_seconds) if time_limit_seconds is not None else None,
        ),
        "workers": metricas.get("workers", int(workers)),
        "conflictos_docente": metricas.get("conflictos_docentes"),
        "conflictos_grupo": metricas.get("conflictos_grupo"),
        "violaciones_disponibilidad": metricas.get("violaciones_disponibilidad"),
        "violaciones_carga": metricas.get("violaciones_carga"),
        "solver_conflicts": metricas.get("num_conflicts"),
        "solver_branches": metricas.get("num_branches"),
        "solutions_found": metricas.get(
            "solutions_found",
            monitor.solution_count if monitor else None,
        ),
        "interrupted": False,
    })
    fila["solucion_encontrada"] = fila["solver_status"] in {"OPTIMAL", "FEASIBLE"}
    fila["observacion"] = construir_observacion(
        fila["solver_status"],
        time_limit_seconds=time_limit_seconds,
        coverage_rate=fila["coverage_rate"],
    )
    return fila


def exportar_resultados(filas, output_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8-sig") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(filas)

    fila_x30 = next((fila for fila in filas if fila["multiplicador"] == 30), None)
    if fila_x30 is not None:
        resumen_x30 = output_path.with_name(f"{output_path.stem}_x30.json")
        resumen_x30.write_text(
            json.dumps(fila_x30, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    return output_path


def parse_args():
    default_output = Path(__file__).resolve().parent.parent / "results" / "stress_cp_sat.csv"
    parser = argparse.ArgumentParser(description="Pruebas de estres del generador CP-SAT")
    parser.add_argument(
        "--multipliers",
        type=int,
        nargs="+",
        default=list(MULTIPLICADORES_OFICIALES),
        help="Escalas oficiales a ejecutar",
    )
    parser.add_argument("--time-limit", type=float, default=30.0)
    parser.add_argument(
        "--no-time-limit",
        action="store_true",
        help="No configura un limite de tiempo en CP-SAT; tiene prioridad sobre --time-limit",
    )
    parser.add_argument(
        "--progress",
        action="store_true",
        help="Muestra etapas, soluciones completas y heartbeat (automatico para x30)",
    )
    parser.add_argument(
        "--progress-interval",
        type=float,
        default=30.0,
        help="Segundos entre heartbeat; valor predeterminado: 30",
    )
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--output", type=Path, default=default_output)
    return parser.parse_args()


def main():
    args = parse_args()
    multiplicadores = list(dict.fromkeys(args.multipliers))
    invalidos = [m for m in multiplicadores if m not in MULTIPLICADORES_OFICIALES]
    if invalidos:
        raise SystemExit(f"Multiplicadores no oficiales: {invalidos}")
    try:
        time_limit_seconds = resolver_limite_tiempo(
            args.time_limit,
            no_time_limit=args.no_time_limit,
        )
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    if args.workers <= 0:
        raise SystemExit("--workers debe ser mayor que cero")
    if args.progress_interval <= 0:
        raise SystemExit("--progress-interval debe ser mayor que cero")

    logs_dir = args.output.parent / "logs"
    filas = []
    for multiplicador in multiplicadores:
        print(f"[STRESS] Ejecutando x{multiplicador}...")
        progress_enabled = resolver_progress(multiplicador, args.progress)
        if multiplicador == 30 and not args.progress:
            print("[STRESS][x30] Monitor de progreso activado automaticamente.")
        instancia = generar_instancia_sintetica(multiplicador)
        inicio_instancia = time.perf_counter()
        progress_log_path = logs_dir / f"stress_x{multiplicador}_progress.log"
        solver_log_path = logs_dir / f"stress_x{multiplicador}_solver.log"
        try:
            fila = ejecutar_instancia(
                instancia,
                time_limit_seconds=time_limit_seconds,
                workers=args.workers,
                log_path=logs_dir / f"stress_x{multiplicador}.log",
                progress_enabled=progress_enabled,
                progress_log_path=progress_log_path,
                solver_log_path=solver_log_path,
                heartbeat_interval_seconds=args.progress_interval,
            )
        except KeyboardInterrupt as exc:
            elapsed = round(time.perf_counter() - inicio_instancia, 6)
            fila = crear_fila_base(
                instancia,
                time_limit_seconds,
                args.workers,
                progress_enabled=progress_enabled,
                solver_log_path=solver_log_path if progress_enabled else None,
                progress_log_path=progress_log_path if progress_enabled else None,
            )
            fila.update({
                "solver_status": "INTERRUPTED",
                "tiempo_segundos": elapsed,
                "solutions_found": int(getattr(exc, "solutions_found", 0)),
                "interrupted": True,
                "solucion_encontrada": False,
                "observacion": f"Execution interrupted by user after {elapsed:.3f} seconds",
            })
            filas.append(fila)
            print("\n[STRESS] Ejecucion interrumpida por el usuario.")
            print(json.dumps(fila, ensure_ascii=False, indent=2))
            output = exportar_resultados(filas, args.output.resolve())
            print(f"[STRESS] Resultados parciales guardados: {output}")
            return 130
        filas.append(fila)
        print(json.dumps(fila, ensure_ascii=False, indent=2))
        if progress_enabled:
            print(f"[STRESS][x{multiplicador}][DONE]")
            print(f"solver_status: {fila['solver_status']}")
            print(f"runtime_seconds: {fila['tiempo_segundos']}")
            print(f"required_blocks: {fila['bloques_requeridos_calculados']}")
            print(f"assigned_blocks: {fila['bloques_asignados']}")
            print(f"coverage_rate: {fila['coverage_rate']}")
            print(f"solver_conflicts: {fila['solver_conflicts']}")
            print(f"solver_branches: {fila['solver_branches']}")
            print(f"solutions_found: {fila['solutions_found']}")

    output = exportar_resultados(filas, args.output.resolve())
    print(f"[STRESS] CSV consolidado: {output}")
    if any(fila["multiplicador"] == 30 for fila in filas):
        print(f"[STRESS] Resumen x30: {output.with_name(f'{output.stem}_x30.json')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
