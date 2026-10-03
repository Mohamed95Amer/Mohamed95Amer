"""Critical Path Method (CPM) primitives — Primavera-style scheduling.

Pure functions on ``datetime.date`` with a Monday–Friday working calendar, kept
separate from the ORM so they can be unit-tested in isolation. Durations are in
whole working days; a task of duration ``d`` occupies ``d`` working days
inclusive (start and finish land on working days).
"""
from datetime import date, timedelta


def is_working_day(day):
    return day.weekday() < 5  # 0=Mon .. 4=Fri


def snap_forward(day):
    """Return ``day`` or the next working day if it falls on a weekend."""
    while not is_working_day(day):
        day += timedelta(days=1)
    return day


def snap_backward(day):
    while not is_working_day(day):
        day -= timedelta(days=1)
    return day


def add_working_days(day, n):
    """Move ``n`` working days from ``day`` (n may be negative).

    ``day`` is first snapped onto a working day in the direction of travel;
    ``n == 0`` therefore returns the nearest working day.
    """
    if n == 0:
        return snap_forward(day)
    step = 1 if n > 0 else -1
    remaining = abs(n)
    current = day
    while remaining:
        current += timedelta(days=step)
        if is_working_day(current):
            remaining -= 1
    return current


def next_working_day(day):
    """First working day strictly after ``day``."""
    nxt = day + timedelta(days=1)
    return snap_forward(nxt)


def prev_working_day(day):
    prev = day - timedelta(days=1)
    return snap_backward(prev)


def finish_from_start(start, duration, milestone=False):
    if milestone or duration <= 1:
        return snap_forward(start)
    return add_working_days(start, duration - 1)


def start_from_finish(finish, duration, milestone=False):
    if milestone or duration <= 1:
        return snap_backward(finish)
    return add_working_days(finish, -(duration - 1))


def working_days_between(start, end):
    """Signed count of working-day steps from ``start`` to ``end``."""
    if start == end:
        return 0
    step = 1 if end > start else -1
    count = 0
    current = snap_forward(start) if step > 0 else snap_backward(start)
    target = end
    while (current < target) if step > 0 else (current > target):
        current += timedelta(days=step)
        if is_working_day(current):
            count += step
    return count


def topological_order(task_ids, links):
    """Kahn's algorithm. ``links`` = list of (predecessor, successor).

    Returns the task ids in dependency order, or raises ValueError on a cycle.
    """
    succ = {t: [] for t in task_ids}
    indeg = {t: 0 for t in task_ids}
    for pred, s in links:
        if pred in succ and s in indeg:
            succ[pred].append(s)
            indeg[s] += 1
    queue = [t for t in task_ids if indeg[t] == 0]
    order = []
    while queue:
        node = queue.pop(0)
        order.append(node)
        for s in succ[node]:
            indeg[s] -= 1
            if indeg[s] == 0:
                queue.append(s)
    if len(order) != len(task_ids):
        raise ValueError("Dependency cycle detected in schedule.")
    return order


def compute_schedule(tasks, links, project_start):
    """Forward + backward CPM pass.

    ``tasks`` = {id: {"duration": int, "milestone": bool, "snet": date|None}}
    ``links`` = [{"pred": id, "succ": id, "type": "FS|SS|FF|SF", "lag": int}]

    Returns {id: {"early_start","early_finish","late_start","late_finish",
                  "total_float","is_critical"}} with date values.
    """
    project_start = snap_forward(project_start)
    order = topological_order(list(tasks), [(l["pred"], l["succ"]) for l in links])
    preds = {t: [] for t in tasks}
    succs = {t: [] for t in tasks}
    for link in links:
        if link["pred"] in tasks and link["succ"] in tasks:
            preds[link["succ"]].append(link)
            succs[link["pred"]].append(link)

    es, ef = {}, {}
    for tid in order:
        t = tasks[tid]
        dur, ms = t["duration"], t["milestone"]
        candidates = [project_start]
        if t.get("snet"):
            candidates.append(snap_forward(t["snet"]))
        for link in preds[tid]:
            p = link["pred"]
            lag = link.get("lag", 0)
            if link["type"] == "FS":
                candidates.append(add_working_days(next_working_day(ef[p]), lag))
            elif link["type"] == "SS":
                candidates.append(add_working_days(es[p], lag))
            elif link["type"] == "FF":
                cand_finish = add_working_days(ef[p], lag)
                candidates.append(start_from_finish(cand_finish, dur, ms))
            elif link["type"] == "SF":
                cand_finish = add_working_days(es[p], lag)
                candidates.append(start_from_finish(cand_finish, dur, ms))
        start = max(candidates)
        es[tid] = start
        ef[tid] = finish_from_start(start, dur, ms)

    project_finish = max(ef.values()) if ef else project_start

    ls, lf = {}, {}
    for tid in reversed(order):
        t = tasks[tid]
        dur, ms = t["duration"], t["milestone"]
        candidates = [project_finish]
        for link in succs[tid]:
            s = link["succ"]
            lag = link.get("lag", 0)
            if link["type"] == "FS":
                candidates.append(add_working_days(prev_working_day(ls[s]), -lag))
            elif link["type"] == "SS":
                cand_start = add_working_days(ls[s], -lag)
                candidates.append(finish_from_start(cand_start, dur, ms))
            elif link["type"] == "FF":
                candidates.append(add_working_days(lf[s], -lag))
            elif link["type"] == "SF":
                cand_start = add_working_days(lf[s], -lag)
                candidates.append(finish_from_start(cand_start, dur, ms))
        finish = min(candidates)
        lf[tid] = finish
        ls[tid] = start_from_finish(finish, dur, ms)

    result = {}
    for tid in tasks:
        total_float = working_days_between(es[tid], ls[tid])
        result[tid] = {
            "early_start": es[tid],
            "early_finish": ef[tid],
            "late_start": ls[tid],
            "late_finish": lf[tid],
            "total_float": total_float,
            "is_critical": total_float <= 0,
        }
    return result
