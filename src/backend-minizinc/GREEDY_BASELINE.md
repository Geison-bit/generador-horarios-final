# Greedy de la web y greedy del articulo

## Implementacion vigente

La unica implementacion fortalecida es:

```text
baseline_greedy.py::solve_greedy
```

Esta implementacion coloca sesiones completas y consecutivas, respeta
disponibilidad, evita solapamientos de docente y grupo, aplica ordenamiento por
dificultad, reinicios controlados y reparacion simple.

## Articulo

La comparacion del articulo se ejecuta exclusivamente con:

```powershell
python compare_cpsat_vs_greedy.py --synthetic --multipliers 1 2 5 10 20 --greedy-restarts 20 --skip-cpsat-rerun
```

Para x30:

```powershell
python compare_cpsat_vs_greedy.py --synthetic --multipliers 30 --skip-cpsat-rerun --include-x30-greedy --greedy-restarts 20 --greedy-time-limit 600
```

Los resultados validos para el articulo son:

```text
resultados/comparison_cpsat_vs_greedy_raw.csv
resultados/comparison_cpsat_vs_greedy_summary.csv
resultados/comparison_cpsat_vs_greedy_audit.json
```

CP-SAT x30 se carga desde su resultado existente y no se vuelve a ejecutar.

## Endpoint web

`app.py` importa:

```text
baseline_greedy.py::generar_horario_baseline
```

Esa funcion es un adaptador de la interfaz Flask y llama internamente al mismo
`solve_greedy` auditado. El log se identifica como `AUDITED GREEDY WEB`.

La implementacion anterior
`baseline_compare.py::generar_horario_baseline` ya no es usada por `app.py`.
Sus resultados no deben mezclarse con los CSV auditados del articulo.

## Modo real

El comando `--real` exige un snapshot local con los objetos `instance` y
`cpsat_result`. Si no existe, la comparacion se cancela para evitar comparar
instancias diferentes.

## Comparacion de la ultima ejecucion web real

`app.py` guarda automaticamente la instancia efectiva, despues de cargar
disponibilidad y patrones, en:

```text
resultados/web_real_instance_last.json
```

El snapshot contiene la instancia, las metricas greedy y
`instance_hash_sha256`. Para compararla con CP-SAT sin limite explicito:

```powershell
python compare_web_real_instance.py --expect-greedy-assigned 167
```

Esto genera archivos separados de los experimentos sinteticos:

```text
resultados/web_real_cpsat_vs_greedy.csv
resultados/web_real_cpsat_vs_greedy.json
```

El comparador valida el hash, comprueba la identidad de instancia y ejecuta
CP-SAT directamente sobre una copia exacta del snapshot. No consulta ni
reutiliza resultados CP-SAT de x1-x30.
