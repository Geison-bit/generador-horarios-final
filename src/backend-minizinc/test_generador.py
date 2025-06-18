import pytest
from app import app

@pytest.fixture
def client():
    app.testing = True
    return app.test_client()

def test_generar_horario_general_exito(client):
    payload = {
        "docentes": [
            {"id": 1, "nombre": "Docente A", "jornada_total": 30, "aula_id": 1}
        ],
        "asignaciones": {
            "1": {
                "1": {"docente_id": 1, "curso_id": 1, "grado_id": 1}
            }
        },
        "restricciones": {},
        "horas_curso_grado": {
            "1": {
                "1": 2
            }
        },
        "nivel": "Secundaria"
    }

    response = client.post("/generar-horario-general", json=payload)
    assert response.status_code == 200
    data = response.get_json()
    assert "horario" in data
    assert isinstance(data["horario"], list)

def test_generar_horario_faltan_datos(client):
    response = client.post("/generar-horario-general", json={})
    assert response.status_code == 500
    data = response.get_json()
    assert "error" in data
