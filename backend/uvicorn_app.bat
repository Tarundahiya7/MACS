@echo off
set PYTHONUTF8=1
set PORT=8000
uvicorn app.main:app --reload --port %PORT%