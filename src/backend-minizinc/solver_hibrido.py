import os
import json
import subprocess
import tempfile

def llamar_minizinc_chuffed(data):
    docentes = data['docentes']
    asignaciones = data['asignaciones']
    restricciones = data['restricciones']
    horas_curso_grado = data['horas_curso_grado']

    NUM_DIAS = 5
    NUM_BLOQUES = 8
    NUM_GRADOS = 5
    NUM_CURSOS = len(asignaciones)
    NUM_DOCENTES = len(docentes)

    def generar_dzn():
        def matriz2d(nombre, matriz):
            flat = ",".join(str(cell) for fila in matriz for cell in fila)
            filas = len(matriz)
            columnas = len(matriz[0]) if filas > 0 else 0
            return f"{nombre} = array2d(1..{filas}, 1..{columnas}, [{flat}]);\n"

        def matriz3d_bool(nombre, tensor):
            flat = ",".join("true" if val else "false" for d in tensor for fila in d for val in fila)
            return f"{nombre} = array3d(1..{NUM_DOCENTES}, 1..{NUM_DIAS}, 1..{NUM_BLOQUES}, [{flat}]);\n"

        docente_asignado = [[0] * NUM_GRADOS for _ in range(NUM_CURSOS)]
        for c in range(NUM_CURSOS):
            curso_id = str(c + 1)
            for g in range(NUM_GRADOS):
                grado = str(g + 1)
                if curso_id in asignaciones and grado in asignaciones[curso_id]:
                    docente_asignado[c][g] = asignaciones[curso_id][grado]["docente_id"]

        horas = [[0] * NUM_GRADOS for _ in range(NUM_CURSOS)]
        for c in range(NUM_CURSOS):
            curso_id = str(c + 1)
            for g in range(NUM_GRADOS):
                grado = str(g + 1)
                horas[c][g] = horas_curso_grado.get(curso_id, {}).get(grado, 0)

        disponible = [[[False for _ in range(NUM_BLOQUES)] for _ in range(NUM_DIAS)] for _ in range(NUM_DOCENTES)]
        dias = ["lunes", "martes", "miércoles", "jueves", "viernes"]
        for d_idx in range(NUM_DOCENTES):
            docente_id = str(d_idx + 1)
            for dia_idx, dia in enumerate(dias):
                for b in range(NUM_BLOQUES):
                    clave = f"{dia}-{b}"
                    if restricciones.get(docente_id, {}).get(clave, False):
                        disponible[d_idx][dia_idx][b] = True

        dzn = ""
        dzn += matriz2d("docente_asignado", docente_asignado)
        dzn += matriz2d("horas_curso_grado", horas)
        dzn += matriz3d_bool("disponible", disponible)
        return dzn

    dzn_data = generar_dzn()
    modelo_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "modelo_validacion.mzn"))

    with tempfile.NamedTemporaryFile(mode="w", suffix=".dzn", delete=False) as tmp_dzn:
        tmp_dzn.write(dzn_data)
        tmp_dzn_path = tmp_dzn.name

    try:
        result = subprocess.run(
            ["minizinc", "--solver", "chuffed", modelo_path, tmp_dzn_path],
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr)

        salida = result.stdout.strip().splitlines()[-1]
        return json.loads(salida)

    finally:
        if os.path.exists(tmp_dzn_path):
            os.remove(tmp_dzn_path)
