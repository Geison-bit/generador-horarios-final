@echo off
python -m pip install -r backend\requirements-dev.txt
python -m pytest backend\tests research\tests -m "not integration"
pause
