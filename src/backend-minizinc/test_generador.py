import pytest
from app import app

@pytest.fixture
def client():
    app.testing = True
    return app.test_client()

def test_generar_horario_exito_minimo(client):
    payload = {
        "docentes": [
            {"id": 75, "nombre": "yodg", "jornada_total": 40, "aula_id": 9}
        ],
        "asignaciones": {
            "16": {
                "6": {"docente_id": 75, "curso_id": 16, "grado_id": 6}
            }
        },
        "restricciones": {},
        "horas_curso_grado": {
            "16": {
                "6": 2
            }
        },
        "nivel": "Primaria"
    }
    response = client.post("/generar-horario-general", json=payload)
    assert response.status_code == 200
    data = response.get_json()
    assert "horario" in data
    assert isinstance(data["horario"], list)

def test_generar_horario_multiple_asignaciones(client):
    payload = {
        "docentes": [
            {"id": 76, "nombre": "yefd", "jornada_total": 40, "aula_id": 10},
            {"id": 80, "nombre": "geison", "jornada_total": 40, "aula_id": 12}
        ],
        "asignaciones": {
            "16": {"6": {"docente_id": 76}},  # Tutoría al grado 6
            "17": {"5": {"docente_id": 80}},  # Inglés al grado 5
        },
        "restricciones": {},
        "horas_curso_grado": {
            "16": {"6": 2},
            "17": {"5": 2},
        },
        "nivel": "Primaria"
    }
    response = client.post("/generar-horario-general", json=payload)
    assert response.status_code == 200
    data = response.get_json()
    assert data["total_bloques_asignados"] >= 2

def test_horario_con_restricciones(client):
    payload = {
        "docentes": [
            {"id": 50, "nombre": "Javier Delgado", "jornada_total": 30, "aula_id": 1}
        ],
        "asignaciones": {
            "5": {"6": {"docente_id": 50}}  # curso_id 5 = Inglés (Secundaria)
        },
        "restricciones": {
            "50": {"lunes-0": False, "lunes-1": False}
        },
        "horas_curso_grado": {
            "5": {"6": 2}
        },
        "nivel": "Secundaria"
    }
    response = client.post("/generar-horario-general", json=payload)
    assert response.status_code == 200
    data = response.get_json()
    assert data["total_bloques_asignados"] == 0

def test_curso_con_solo_una_hora(client):
    payload = {
        "docentes": [
            {"id": 76, "nombre": "yefd", "jornada_total": 40, "aula_id": 10}
        ],
        "asignaciones": {
            "16": {"6": {"docente_id": 76}}  # Tutoría
        },
        "restricciones": {},
        "horas_curso_grado": {
            "16": {"6": 1}  # Solo una hora → no se debe asignar
        },
        "nivel": "Primaria"
    }
    response = client.post("/generar-horario-general", json=payload)
    assert response.status_code == 200
    data = response.get_json()
    assert data["total_bloques_asignados"] == 0

def test_falta_datos(client):
    response = client.post("/generar-horario-general", json={})
    assert response.status_code == 500
    data = response.get_json()
    assert "error" in data
