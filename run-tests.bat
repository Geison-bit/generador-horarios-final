@echo off
call venv\Scripts\activate
pip install -r src\backend-minizinc\requirements.txt
pytest
pause
