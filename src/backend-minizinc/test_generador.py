import pytest
from app import app

@pytest.fixture
def client():
    app.testing = True
    return app.test_client()

def test_generar_horario_exito_minimo(client):
    payload = {
        "docentes": [
            {"id": 1, "nombre": "Docente A", "jornada_total": 30, "aula_id": 1}
        ],
        "asignaciones": {
            "1": {
                "6": {"docente_id": 1, "curso_id": 1, "grado_id": 6}
            }
        },
        "restricciones": {},
        "horas_curso_grado": {
            "1": {
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
            {"id": 1, "nombre": "Docente A", "jornada_total": 30, "aula_id": 1},
            {"id": 2, "nombre": "Docente B", "jornada_total": 30, "aula_id": 2}
        ],
        "asignaciones": {
            "1": {"6": {"docente_id": 1}},  # curso 1, grado 6
            "2": {"6": {"docente_id": 2}},  # curso 2, grado 6
        },
        "restricciones": {},
        "horas_curso_grado": {
            "1": {"6": 2},
            "2": {"6": 2},
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
            {"id": 3, "nombre": "Docente C", "jornada_total": 30, "aula_id": 3}
        ],
        "asignaciones": {
            "3": {"6": {"docente_id": 3}}
        },
        "restricciones": {
            "3": {"lunes-0": False, "lunes-1": False}
        },
        "horas_curso_grado": {
            "3": {"6": 2}
        },
        "nivel": "Primaria"
    }
    response = client.post("/generar-horario-general", json=payload)
    assert response.status_code == 200
    data = response.get_json()
    assert "horario" in data

def test_curso_con_solo_una_hora(client):
    payload = {
        "docentes": [
            {"id": 4, "nombre": "Docente D", "jornada_total": 20, "aula_id": 4}
        ],
        "asignaciones": {
            "4": {"6": {"docente_id": 4}}
        },
        "restricciones": {},
        "horas_curso_grado": {
            "4": {"6": 1}
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
