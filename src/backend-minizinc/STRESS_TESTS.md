# Pruebas de estres CP-SAT

El runner usa como unidad oficial una seccion completa de Secundaria:

- 5 grupos (1.o a 5.o)
- 8 docentes
- 35 bloques por grupo
- 175 bloques por seccion

No usa Flask ni Supabase. Ejecuta directamente `generar_horario_cp`.

## Ejecutar la bateria oficial

Desde `src/backend-minizinc`:

```powershell
python stress_runner.py
```

Esto ejecuta `x1`, `x2`, `x5`, `x10`, `x20` y `x30` con limite de 30
segundos y 8 workers. Este valor se conserva como predeterminado del runner
para mantener compatibilidad con las ejecuciones anteriores. Los resultados
se guardan en:

```text
resultados/stress_cp_sat.csv
resultados/stress_cp_sat_x30.json
resultados/logs/stress_x1.log
...
resultados/logs/stress_x30.log
```

## Configuracion explicita

Ejecutar sin limite de tiempo explicito:

```powershell
python stress_runner.py --no-time-limit
```

Si se escriben simultaneamente `--no-time-limit` y `--time-limit`, prevalece
`--no-time-limit`. En el CSV se exporta una celda vacia y en el resumen JSON
se exporta `null` para `time_limit_seconds`. La columna `time_limit_mode`
registra `unlimited`; cuando se usa un limite numerico registra `limited`.

Si se interrumpe la escala activa con `Ctrl+C`, el CSV parcial se guarda con:

```text
solver_status=INTERRUPTED
solucion_encontrada=false
interrupted=true
observacion=Execution interrupted by user after X seconds
```

```powershell
python stress_runner.py --time-limit 60 --workers 8
```

Ejecutar solo algunas escalas:

```powershell
python stress_runner.py --multipliers 1 2 5
```

Cambiar la salida:

```powershell
python stress_runner.py --output resultados/experimento_01.csv
```

El CSV registra el limite y los workers realmente enviados a CP-SAT. Si la
estructura no cumple los conteos oficiales o algun grupo no suma exactamente
35 bloques, se marca `estructura_valida=false` y esa instancia no se resuelve.

## Monitor de progreso

Ejecutar x30 con monitor y sin limite explicito:

```powershell
python stress_runner.py --multipliers 30 --no-time-limit --progress
```

Ejecutar x30 con monitor y limite de una hora:

```powershell
python stress_runner.py --multipliers 30 --time-limit 3600 --progress
```

Para x30 el monitor se activa automaticamente, incluso si se omite
`--progress`. El heartbeat se imprime cada 30 segundos. Mientras no exista una solucion
factible, solo informa tiempo transcurrido, bloques requeridos y
`solutions_found=0`; nunca presenta bloques internos parciales como asignados.

El intervalo puede cambiarse, por ejemplo:

```powershell
python stress_runner.py --multipliers 30 --no-time-limit --progress-interval 60
```

Ver el log de progreso:

```powershell
type resultados\logs\stress_x30_progress.log
```

Ver el log interno completo de CP-SAT:

```powershell
type resultados\logs\stress_x30_solver.log
```

El CSV y el JSON incluyen `progress_enabled`, `solutions_found`, `interrupted`,
`solver_log_path` y `progress_log_path`.
