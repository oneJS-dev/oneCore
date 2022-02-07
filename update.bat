@echo off
set REPO=%1
if %REPO%==git git add . && git commit -m "automatic update" && git push -u origin main
if %REPO%==npm npm version patch && npm publish --access public
if %REPO%==both git add . && git commit -m "automatic update" && git push -u origin main && npm version patch && npm publish --access public
pause