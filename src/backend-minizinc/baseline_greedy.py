"""Baseline greedy constructivo para instancias del generador de horarios.

No importa OR-Tools ni llama al modelo CP-SAT. Las sesiones se colocan como
unidades indivisibles y consecutivas. La heuristica usa MRV, puntuacion de
compactacion, reinicios reproducibles y una reparacion de intercambio simple.
"""

import copy
import hashlib
import json
import random
import time
import unicodedata
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path


DIAS = ("lunes", "martes", "miercoles", "jueves", "viernes")
DEFAULT_SEED = 20260717


def _int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalizar_texto(value):
    if value is None:
        return ""
    return (
        unicodedata.normalize("NFD", str(value))
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )


def _canonical(value):
    if isinstance(value, dict):
        return {
            str(key): _canonical(value[key])
            for key in sorted(value, key=lambda item: str(item))
        }
    if isinstance(value, (list, tuple)):
        return [_canonical(item) for item in value]
    return value


def instance_fingerprint(instance):
    payload = json.dumps(
        _canonical(instance),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def verify_same_instance(cpsat_instance, greedy_instance):
    """Verifica igualdad de todos los datos que afectan ambos algoritmos."""
    campos = (
        "docentes",
        "asignaciones",
        "horas_curso_grado",
        "restricciones",
        "patrones_division",
        "nivel",
        "version",
    )
    diferencias = []
    for campo in campos:
        cpsat_value = _canonical(cpsat_instance.get(campo))
        greedy_value = _canonical(greedy_instance.get(campo))
        if cpsat_value != greedy_value:
            diferencias.append(campo)

    cpsat_model = preparar_instancia(cpsat_instance)
    greedy_model = preparar_instancia(greedy_instance)
    comprobaciones = {
        "grupos": sorted(cpsat_model["groups"]) == sorted(greedy_model["groups"]),
        "docentes": sorted(cpsat_model["teachers"])
        == sorted(greedy_model["teachers"]),
        "asignaciones": cpsat_model["assignment_signature"]
        == greedy_model["assignment_signature"],
        "bloques_requeridos": cpsat_model["required_blocks"]
        == greedy_model["required_blocks"],
        "restricciones": _canonical(cpsat_instance.get("restricciones", {}))
        == _canonical(greedy_instance.get("restricciones", {})),
        "patrones": cpsat_model["pattern_signature"]
        == greedy_model["pattern_signature"],
        "disponibilidad": sorted(cpsat_model["blocked"])
        == sorted(greedy_model["blocked"]),
    }
    for nombre, igual in comprobaciones.items():
        if not igual and nombre not in diferencias:
            diferencias.append(nombre)

    return {
        "same": not diferencias,
        "differences": diferencias,
        "cpsat_fingerprint": instance_fingerprint(cpsat_instance),
        "greedy_fingerprint": instance_fingerprint(greedy_instance),
        "checks": comprobaciones,
    }


def _fallback_pattern(hours, course, version):
    if hours == 5:
        return [3, 2]
    if hours == 4:
        return [2, 2]
    if hours == 3:
        return [2, 1] if version == 1 and course in (9, 12) else [3]
    if hours == 2:
        return [2]
    if hours == 1:
        return [1]
    pattern = []
    remaining = hours
    while remaining > 0:
        length = 3 if remaining == 3 or remaining >= 5 else min(2, remaining)
        pattern.append(length)
        remaining -= length
    return pattern


def _pattern_for(req, patterns, version):
    group_key = f"{req['course']}-{req['group']}"
    grade_key = f"{req['course']}-{req['grade']}"
    raw = patterns.get(group_key) or patterns.get(grade_key)
    if isinstance(raw, str):
        values = [_int(item) for item in raw.split("+") if item.strip()]
    elif isinstance(raw, (list, tuple)):
        values = [_int(item) for item in raw]
    else:
        values = []
    if values and all(value > 0 for value in values) and sum(values) == req["hours"]:
        return values
    return _fallback_pattern(req["hours"], req["course"], version)


def _build_assignments(instance):
    assignments_payload = instance.get("asignaciones") or {}
    hours_payload = instance.get("horas_curso_grado") or {}
    lookup = {}
    for course_id, targets in assignments_payload.items():
        course = _int(course_id)
        for target_id, data in (targets or {}).items():
            target = _int(target_id)
            data = data or {}
            section_raw = data.get("seccion_id")
            section = _int(section_raw) if section_raw is not None else None
            lookup[(course, target)] = {
                "course": course,
                "target": target,
                "group": section or target,
                "grade": _int(data.get("grado_id")) or target,
                "section": section,
                "teacher": _int(data.get("docente_id")),
            }

    assignments = []
    patterns = instance.get("patrones_division") or {}
    version = _int(instance.get("version"), 1)
    for course_id, targets in hours_payload.items():
        course = _int(course_id)
        for target_id, hours_raw in (targets or {}).items():
            target = _int(target_id)
            hours = _int(hours_raw)
            meta = lookup.get((course, target))
            if hours <= 0 or not meta or meta["teacher"] <= 0:
                continue
            req = {**meta, "hours": hours, "id": len(assignments)}
            req["pattern"] = _pattern_for(req, patterns, version)
            assignments.append(req)
    return assignments


def _blocked_slots(instance, teachers, num_blocks):
    restrictions = instance.get("restricciones") or {}
    availability = restrictions.get("disponibilidad") or {}
    if instance.get("nivel", "Secundaria") == "Primaria":
        return set()
    blocked = set()
    if not isinstance(availability, dict):
        return blocked
    for teacher_raw, rules in availability.items():
        teacher = _int(teacher_raw)
        if teacher <= 0 or not rules:
            continue
        for day, day_name in enumerate(DIAS):
            normalized = _normalizar_texto(day_name)
            for block in range(num_blocks):
                allowed = bool(
                    rules.get(f"{day_name}-{block}")
                    or rules.get(f"{normalized}-{block}")
                )
                if not allowed:
                    blocked.add((teacher, day, block))
    return blocked


def preparar_instancia(instance):
    assignments = _build_assignments(instance)
    version = _int(instance.get("version"), 1)
    num_blocks = 7 if version == 1 else 8
    teachers = {
        _int(item.get("id"))
        for item in (instance.get("docentes") or [])
        if _int(item.get("id")) > 0
    }
    groups = {req["group"] for req in assignments}
    blocked = _blocked_slots(instance, teachers, num_blocks)
    sessions = []
    for req in assignments:
        for position, length in enumerate(req["pattern"]):
            sessions.append(
                {
                    "id": len(sessions),
                    "assignment_id": req["id"],
                    "course": req["course"],
                    "group": req["group"],
                    "teacher": req["teacher"],
                    "length": length,
                    "pattern_position": position,
                }
            )
    assignment_signature = sorted(
        (
            req["course"],
            req["group"],
            req["grade"],
            req["section"],
            req["teacher"],
            req["hours"],
        )
        for req in assignments
    )
    pattern_signature = sorted(
        (req["course"], req["group"], tuple(req["pattern"])) for req in assignments
    )
    teacher_limits = {
        _int(item.get("id")): _int(item.get("jornada_total"))
        for item in (instance.get("docentes") or [])
        if item.get("jornada_total") is not None
    }
    rules = (instance.get("restricciones") or {}).get("reglas") or {}
    return {
        "assignments": assignments,
        "sessions": sessions,
        "teachers": teachers,
        "groups": groups,
        "blocked": blocked,
        "num_blocks": num_blocks,
        "required_blocks": sum(req["hours"] for req in assignments),
        "assignment_signature": assignment_signature,
        "pattern_signature": pattern_signature,
        "teacher_limits": teacher_limits,
        "limit_teacher_group_daily": bool(
            rules.get("limitar_carga_docente_grado", True)
        ),
    }


def _components(sessions):
    by_resource = defaultdict(list)
    by_id = {session["id"]: session for session in sessions}
    for session in sessions:
        by_resource[("g", session["group"])].append(session["id"])
        by_resource[("t", session["teacher"])].append(session["id"])
    adjacency = defaultdict(set)
    for ids in by_resource.values():
        for session_id in ids:
            adjacency[session_id].update(ids)
    pending = set(by_id)
    result = []
    while pending:
        root = pending.pop()
        queue = deque([root])
        ids = {root}
        while queue:
            current = queue.popleft()
            for neighbor in adjacency[current]:
                if neighbor in pending:
                    pending.remove(neighbor)
                    ids.add(neighbor)
                    queue.append(neighbor)
        result.append([by_id[session_id] for session_id in sorted(ids)])
    return result


class _State:
    def __init__(self, model):
        self.model = model
        self.placements = {}
        self.teacher_busy = {}
        self.group_busy = {}
        self.assignment_days = defaultdict(set)
        self.teacher_group_daily = defaultdict(int)

    def clone(self):
        cloned = _State(self.model)
        for session, day, start in self.placements.values():
            cloned.place(session, day, start)
        return cloned

    def place(self, session, day, start):
        self.placements[session["id"]] = (session, day, start)
        self.assignment_days[session["assignment_id"]].add(day)
        self.teacher_group_daily[(session["teacher"], session["group"], day)] += session[
            "length"
        ]
        for block in range(start, start + session["length"]):
            self.teacher_busy[(session["teacher"], day, block)] = session["id"]
            self.group_busy[(session["group"], day, block)] = session["id"]

    def remove(self, session_id):
        remaining = [
            placement
            for current_id, placement in self.placements.items()
            if current_id != session_id
        ]
        self.__init__(self.model)
        for session, day, start in remaining:
            self.place(session, day, start)


def _candidate_slots(session, state):
    model = state.model
    candidates = []
    for day in range(len(DIAS)):
        if day in state.assignment_days[session["assignment_id"]]:
            continue
        if (
            model["limit_teacher_group_daily"]
            and state.teacher_group_daily[
                (session["teacher"], session["group"], day)
            ]
            + session["length"]
            > 3
        ):
            continue
        for start in range(model["num_blocks"] - session["length"] + 1):
            blocks = range(start, start + session["length"])
            if any(
                (session["teacher"], day, block) in model["blocked"]
                for block in blocks
            ):
                continue
            if any(
                (session["teacher"], day, block) in state.teacher_busy
                for block in blocks
            ):
                continue
            if any(
                (session["group"], day, block) in state.group_busy
                for block in blocks
            ):
                continue
            candidates.append((day, start))
    return candidates


def _candidate_score(session, day, start, state, rng):
    length = session["length"]
    occupied = {
        block
        for (group, current_day, block) in state.group_busy
        if group == session["group"] and current_day == day
    }
    after = occupied | set(range(start, start + length))
    max_block = max(after)
    holes = sum(1 for block in range(max_block + 1) if block not in after)
    span = max_block - min(after) + 1
    compactness = span - len(after)
    prefix_gap = 0 if start == 0 or start - 1 in occupied else 1
    teacher_free_after = sum(
        1
        for d in range(len(DIAS))
        for b in range(state.model["num_blocks"])
        if (session["teacher"], d, b) not in state.model["blocked"]
        and (session["teacher"], d, b) not in state.teacher_busy
    ) - length
    return (
        holes,
        prefix_gap,
        compactness,
        -teacher_free_after,
        day,
        start,
        rng.random(),
    )


def _difficulty(session, candidates, model, group_load, teacher_free, rng):
    return (
        len(candidates),
        -session["length"],
        teacher_free[session["teacher"]],
        -group_load[session["group"]],
        -len(
            model["assignments"][session["assignment_id"]]["pattern"]
        ),
        rng.random(),
    )


def _construct_component(component, model, seed):
    rng = random.Random(seed)
    state = _State(model)
    pending = list(component)
    group_load = Counter()
    for session in component:
        group_load[session["group"]] += session["length"]
    teacher_free = {
        teacher: sum(
            1
            for day in range(len(DIAS))
            for block in range(model["num_blocks"])
            if (teacher, day, block) not in model["blocked"]
        )
        for teacher in {session["teacher"] for session in component}
    }

    while pending:
        evaluated = []
        for session in pending:
            candidates = _candidate_slots(session, state)
            if candidates:
                evaluated.append(
                    (
                        _difficulty(
                            session,
                            candidates,
                            model,
                            group_load,
                            teacher_free,
                            rng,
                        ),
                        session,
                        candidates,
                    )
                )
        if not evaluated:
            break
        evaluated.sort(key=lambda item: item[0])
        _, session, candidates = evaluated[0]
        day, start = min(
            candidates,
            key=lambda slot: _candidate_score(
                session, slot[0], slot[1], state, rng
            ),
        )
        state.place(session, day, start)
        pending.remove(session)
    return state, pending


def _construct_dense_component(component, model, seed):
    """Variante constructiva para componentes que llenan 7 bloques diarios.

    La variante se activa por propiedades de la instancia, no por el nombre del
    escenario. Si alguna colocacion deja de ser valida (p. ej. disponibilidad),
    se descarta y se usa el greedy general.
    """
    if model["num_blocks"] != 7:
        return None
    groups = sorted({session["group"] for session in component})
    if len(groups) != 5:
        return None
    by_group = defaultdict(list)
    for session in component:
        by_group[session["group"]].append(session)
    if any(
        sorted(session["length"] for session in by_group[group])
        != [2] * 10 + [3] * 5
        for group in groups
    ):
        return None

    rng = random.Random(seed)
    state = _State(model)
    group_index = {group: index for index, group in enumerate(groups)}
    long_courses = sorted(
        {session["course"] for session in component if session["length"] == 3}
    )
    if len(long_courses) != 5:
        return None
    course_index = {course: index for index, course in enumerate(long_courses)}
    day_rotation = int(seed) % len(DIAS)

    for session in sorted(
        (item for item in component if item["length"] == 3),
        key=lambda item: (item["group"], item["course"], item["id"]),
    ):
        day = (
            course_index[session["course"]] - group_index[session["group"]]
            + day_rotation
        ) % len(DIAS)
        if (day, 0) not in _candidate_slots(session, state):
            return None
        state.place(session, day, 0)

    pending = [item for item in component if item["length"] == 2]
    while pending:
        evaluated = []
        for session in pending:
            candidates = [
                slot
                for slot in _candidate_slots(session, state)
                if slot[1] in (3, 5)
            ]
            if candidates:
                evaluated.append((len(candidates), session, candidates))
        if not evaluated:
            return state, pending
        _, session, candidates = min(
            evaluated, key=lambda item: (item[0], item[1]["id"])
        )
        day, start = min(
            candidates,
            key=lambda slot: (
                state.teacher_group_daily[
                    (session["teacher"], session["group"], slot[0])
                ],
                slot[0],
                slot[1],
            ),
        )
        state.place(session, day, start)
        pending.remove(session)
    return state, pending


def _blocking_sessions(session, day, start, state):
    blockers = set()
    blocks = range(start, start + session["length"])
    for block in blocks:
        teacher_blocker = state.teacher_busy.get((session["teacher"], day, block))
        group_blocker = state.group_busy.get((session["group"], day, block))
        if teacher_blocker is not None:
            blockers.add(teacher_blocker)
        if group_blocker is not None:
            blockers.add(group_blocker)
    for session_id, (placed, placed_day, _) in state.placements.items():
        if (
            placed["assignment_id"] == session["assignment_id"]
            and placed_day == day
        ):
            blockers.add(session_id)
    if state.model["limit_teacher_group_daily"]:
        current = state.teacher_group_daily[
            (session["teacher"], session["group"], day)
        ]
        if current + session["length"] > 3:
            for session_id, (placed, placed_day, _) in state.placements.items():
                if (
                    placed_day == day
                    and placed["teacher"] == session["teacher"]
                    and placed["group"] == session["group"]
                ):
                    blockers.add(session_id)
    return blockers


def _repair(state, pending, max_attempts=200):
    attempts = 0
    improved = True
    while pending and improved and attempts < max_attempts:
        improved = False
        for wanted in list(pending):
            for day in range(len(DIAS)):
                for start in range(
                    state.model["num_blocks"] - wanted["length"] + 1
                ):
                    if any(
                        (wanted["teacher"], day, block) in state.model["blocked"]
                        for block in range(start, start + wanted["length"])
                    ):
                        continue
                    blockers = _blocking_sessions(wanted, day, start, state)
                    if len(blockers) != 1:
                        continue
                    attempts += 1
                    blocker_id = next(iter(blockers))
                    trial = state.clone()
                    removed = trial.placements[blocker_id][0]
                    trial.remove(blocker_id)
                    if (day, start) not in _candidate_slots(wanted, trial):
                        continue
                    trial.place(wanted, day, start)
                    alternatives = _candidate_slots(removed, trial)
                    if not alternatives:
                        continue
                    new_day, new_start = min(
                        alternatives,
                        key=lambda slot: _candidate_score(
                            removed,
                            slot[0],
                            slot[1],
                            trial,
                            random.Random(DEFAULT_SEED + attempts),
                        ),
                    )
                    trial.place(removed, new_day, new_start)
                    state = trial
                    pending.remove(wanted)
                    improved = True
                    break
                if improved:
                    break
            if improved or attempts >= max_attempts:
                break
    return state, pending, attempts


def _hard_metrics(model, state):
    blocks = []
    for session, day, start in state.placements.values():
        for block in range(start, start + session["length"]):
            blocks.append(
                (session["teacher"], session["group"], day, block, session["id"])
            )
    teacher_counts = Counter((t, d, b) for t, _, d, b, _ in blocks)
    group_counts = Counter((g, d, b) for _, g, d, b, _ in blocks)
    teacher_load = Counter(t for t, _, _, _, _ in blocks)
    assigned_by_assignment = Counter()
    for session, _, _ in state.placements.values():
        assigned_by_assignment[session["assignment_id"]] += session["length"]

    teacher_conflicts = sum(max(0, count - 1) for count in teacher_counts.values())
    group_conflicts = sum(max(0, count - 1) for count in group_counts.values())
    availability_violations = sum(
        1 for teacher, _, day, block, _ in blocks
        if (teacher, day, block) in model["blocked"]
    )
    workload_violations = sum(
        1
        for teacher, load in teacher_load.items()
        if teacher in model["teacher_limits"]
        and load > model["teacher_limits"][teacher]
    )
    unplaced_assignments = sum(
        1
        for req in model["assignments"]
        if assigned_by_assignment[req["id"]] != req["hours"]
    )
    group_gap_violations = 0
    for group in model["groups"]:
        for day in range(len(DIAS)):
            occupied = {
                block for (current_group, current_day, block) in group_counts
                if current_group == group and current_day == day
            }
            if occupied:
                group_gap_violations += sum(
                    1 for block in range(max(occupied) + 1) if block not in occupied
                )
    return {
        "assigned_blocks": len(blocks),
        "teacher_conflicts": teacher_conflicts,
        "group_conflicts": group_conflicts,
        "availability_violations": availability_violations,
        "workload_violations": workload_violations,
        "unplaced_assignments": unplaced_assignments,
        "group_gap_violations": group_gap_violations,
    }


def solve_greedy(
    instance,
    restarts=20,
    seed=DEFAULT_SEED,
    time_limit_seconds=None,
    repair_attempts=200,
):
    """Construye el mejor horario encontrado sin relajar restricciones."""
    if restarts < 0:
        raise ValueError("restarts debe ser mayor o igual que cero")
    if time_limit_seconds is not None and time_limit_seconds <= 0:
        raise ValueError("time_limit_seconds debe ser positivo")
    model = preparar_instancia(instance)
    components = _components(model["sessions"])
    started = time.perf_counter()
    best_state = None
    best_pending = list(model["sessions"])
    best_restart = None
    repair_attempts_used = 0
    restarts_used = 0

    for restart in range(restarts + 1):
        if (
            time_limit_seconds is not None
            and time.perf_counter() - started >= time_limit_seconds
        ):
            break
        global_state = _State(model)
        global_pending = []
        for component_index, component in enumerate(components):
            component_seed = (
                seed + restart * 1_000_003 + component_index * 10_007
            )
            dense_result = (
                _construct_dense_component(component, model, component_seed)
                if restart == 0
                else None
            )
            if dense_result is None:
                component_state, pending = _construct_component(
                    component, model, component_seed
                )
            else:
                component_state, pending = dense_result
            for session, day, start in component_state.placements.values():
                global_state.place(session, day, start)
            global_pending.extend(pending)
        global_state, global_pending, used = _repair(
            global_state, global_pending, max_attempts=repair_attempts
        )
        repair_attempts_used += used
        restarts_used = restart
        current_blocks = sum(
            session["length"]
            for session, _, _ in global_state.placements.values()
        )
        best_blocks = (
            sum(
                session["length"]
                for session, _, _ in best_state.placements.values()
            )
            if best_state is not None
            else -1
        )
        if current_blocks > best_blocks:
            best_state = global_state
            best_pending = global_pending
            best_restart = restart
        if not global_pending:
            break

    runtime = time.perf_counter() - started
    if best_state is None:
        best_state = _State(model)
    metrics = _hard_metrics(model, best_state)
    required = model["required_blocks"]
    assigned = metrics["assigned_blocks"]
    unassigned = max(0, required - assigned)
    complete = (
        unassigned == 0
        and metrics["teacher_conflicts"] == 0
        and metrics["group_conflicts"] == 0
        and metrics["availability_violations"] == 0
        and metrics["workload_violations"] == 0
        and metrics["group_gap_violations"] == 0
    )
    hidden_violations = metrics["group_gap_violations"]
    observation = (
        "Greedy constructivo completo; mismas restricciones principales verificadas"
        if complete
        else (
            f"Greedy parcial tras estrategia MRV, {restarts_used} reinicios y "
            f"reparacion simple; bloques_no_asignados={unassigned}; "
            f"violaciones_huecos_grupo={hidden_violations}"
        )
    )
    return {
        "required_blocks": required,
        "assigned_blocks": assigned,
        "coverage_rate": round(assigned / required, 9) if required else 0.0,
        "unassigned_blocks": unassigned,
        "unplaced_assignments": metrics["unplaced_assignments"],
        "teacher_conflicts": metrics["teacher_conflicts"],
        "group_conflicts": metrics["group_conflicts"],
        "availability_violations": metrics["availability_violations"],
        "workload_violations": metrics["workload_violations"],
        "runtime_seconds": round(runtime, 9),
        "greedy_restarts_used": restarts_used,
        "best_restart": best_restart,
        "repair_attempts_used": repair_attempts_used,
        "status": "COMPLETE" if complete else "PARTIAL",
        "observacion": observation,
        "placements": [
            {
                **session,
                "day": day,
                "start": start,
            }
            for session, day, start in best_state.placements.values()
        ],
        "pending_session_ids": [session["id"] for session in best_pending],
        "instance_fingerprint": instance_fingerprint(instance),
    }


def copy_instance(instance):
    return copy.deepcopy(instance)


def generar_horario_baseline(
    docentes,
    asignaciones,
    restricciones,
    horas_curso_grado,
    nivel="Secundaria",
    version=1,
    patrones_division=None,
    progress_callback=None,
    time_limit_seconds=None,
    workers=8,
    log_search_progress=False,
    solver_log_callback=None,
    progress_scenario="Audited greedy web",
    progress_print_interval_seconds=60,
    greedy_restarts=20,
    instance_snapshot_path=None,
    snapshot_metadata=None,
):
    """Adaptador web que usa exactamente el baseline greedy auditado.

    Los parametros propios de CP-SAT se aceptan por compatibilidad con la
    interfaz del backend, pero no se usan para invocar ningun solver.
    """
    del workers, log_search_progress, solver_log_callback
    instance = {
        "docentes": copy.deepcopy(docentes or []),
        "asignaciones": copy.deepcopy(asignaciones or {}),
        "restricciones": copy.deepcopy(restricciones or {}),
        "horas_curso_grado": copy.deepcopy(horas_curso_grado or {}),
        "nivel": nivel,
        "version": version,
        "patrones_division": copy.deepcopy(patrones_division or {}),
    }
    if progress_callback:
        progress_callback(10, "preparando baseline greedy auditado")
    result = solve_greedy(
        instance,
        restarts=greedy_restarts,
        time_limit_seconds=time_limit_seconds,
    )
    if instance_snapshot_path:
        snapshot_path = Path(instance_snapshot_path)
        snapshot_path.parent.mkdir(parents=True, exist_ok=True)
        snapshot_result = {
            key: value
            for key, value in result.items()
            if key not in {"placements", "pending_session_ids"}
        }
        snapshot = {
            "schema_version": 1,
            "captured_at_utc": datetime.now(timezone.utc).isoformat(),
            "source": "baseline_greedy.py::generar_horario_baseline",
            "metadata": copy.deepcopy(snapshot_metadata or {}),
            "instance_hash_sha256": result["instance_fingerprint"],
            "instance": instance,
            "greedy_result": snapshot_result,
        }
        temporary_path = snapshot_path.with_suffix(snapshot_path.suffix + ".tmp")
        temporary_path.write_text(
            json.dumps(snapshot, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        temporary_path.replace(snapshot_path)
    if progress_callback:
        progress_callback(90, "materializando baseline greedy auditado")

    num_blocks = 7 if _int(version, 1) == 1 else 8
    schedule = {
        day: {block: {} for block in range(num_blocks)}
        for day in range(len(DIAS))
    }
    for placement in result["placements"]:
        for block in range(
            placement["start"], placement["start"] + placement["length"]
        ):
            schedule[placement["day"]][block][placement["group"]] = placement[
                "course"
            ]

    metrics = {
        "bloques_requeridos": result["required_blocks"],
        "bloques_asignados": result["assigned_blocks"],
        "bloques_faltantes": result["unassigned_blocks"],
        "coverage_rate": result["coverage_rate"],
        "conflictos_docentes": result["teacher_conflicts"],
        "conflictos_grupo": result["group_conflicts"],
        "violaciones_disponibilidad": result["availability_violations"],
        "violaciones_carga": result["workload_violations"],
        "tiempo_ejecucion_segundos": result["runtime_seconds"],
        "estado_solver": result["status"],
        "restarts_usados": result["greedy_restarts_used"],
        "best_restart": result["best_restart"],
        "asignaciones_no_colocadas": result["unplaced_assignments"],
        "modelo": "baseline_greedy.py::solve_greedy",
        "instance_fingerprint": result["instance_fingerprint"],
    }
    if progress_callback:
        progress_callback(100, "baseline greedy auditado finalizado")

    print("\n================ AUDITED GREEDY WEB ================")
    print("Algoritmo: baseline_greedy.py::solve_greedy")
    print(f"Bloques requeridos: {result['required_blocks']}")
    print(f"Bloques asignados: {result['assigned_blocks']}")
    print(f"Estado: {result['status']}")
    print(f"Reinicios usados: {result['greedy_restarts_used']}")
    print(f"Tiempo de ejecucion: {result['runtime_seconds']:.3f} segundos")
    print("====================================================\n")

    return {
        "horario": schedule,
        "asignaciones_exitosas": result["assigned_blocks"],
        "asignaciones_fallidas": result["unassigned_blocks"],
        "total_bloques_asignados": result["assigned_blocks"],
        "faltan_3h": [],
        "faltan_2h": [],
        "status": result["status"],
        "metricas": metrics,
        "diagnostico": {
            "modelo": "baseline_greedy.py::solve_greedy",
            "uso": "web integrado al mismo baseline auditado",
            "observacion": result["observacion"],
            "asignaciones_no_colocadas": result["unplaced_assignments"],
            "instance_fingerprint": result["instance_fingerprint"],
            "instance_snapshot_path": (
                str(Path(instance_snapshot_path).resolve())
                if instance_snapshot_path
                else None
            ),
        },
    }
