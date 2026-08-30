# Greedy de la web y greedy del articulo

## Implementacion vigente

La unica implementacion fortalecida es:

```text
research/baselines/baseline_greedy.py::solve_greedy
```

Esta implementacion coloca sesiones completas y consecutivas, respeta
disponibilidad, evita solapamientos de docente y grupo, aplica ordenamiento por
dificultad, reinicios controlados y reparacion simple.

## Articulo

La comparacion del articulo se ejecuta exclusivamente con:

```powershell
python -m research.experiments.compare_cpsat_vs_greedy --synthetic --multipliers 1 2 5 10 20 --greedy-restarts 20 --skip-cpsat-rerun
```

Para x30:

```powershell
python -m research.experiments.compare_cpsat_vs_greedy --synthetic --multipliers 30 --skip-cpsat-rerun --include-x30-greedy --greedy-restarts 20 --greedy-time-limit 600
```

Los resultados validos para el articulo son:

```text
research/results/comparison_cpsat_vs_greedy_raw.csv
research/results/comparison_cpsat_vs_greedy_summary.csv
research/results/comparison_cpsat_vs_greedy_audit.json
```

CP-SAT x30 se carga desde su resultado existente y no se vuelve a ejecutar.

## Separación respecto de la aplicación

El backend web utiliza exclusivamente `backend/solver/generador_python.py`.
Los algoritmos greedy se conservan en `research/` solo para las comparaciones
experimentales de la tesis y no intervienen en la generación de horarios.

## Modo real

El comando `--real` exige un snapshot local con los objetos `instance` y
`cpsat_result`. Si no existe, la comparacion se cancela para evitar comparar
instancias diferentes.

## Comparacion de la ultima ejecucion web real

`app.py` guarda automaticamente la instancia efectiva, despues de cargar
disponibilidad y patrones, en:

```text
research/results/web_real_instance_last.json
```

El snapshot contiene la instancia, las metricas greedy y
`instance_hash_sha256`. Para compararla con CP-SAT sin limite explicito:

```powershell
python -m research.experiments.compare_web_real_instance --expect-greedy-assigned 167
```

Esto genera archivos separados de los experimentos sinteticos:

```text
research/results/web_real_cpsat_vs_greedy.csv
research/results/web_real_cpsat_vs_greedy.json
```

El comparador valida el hash, comprueba la identidad de instancia y ejecuta
CP-SAT directamente sobre una copia exacta del snapshot. No consulta ni
reutiliza resultados CP-SAT de x1-x30.
