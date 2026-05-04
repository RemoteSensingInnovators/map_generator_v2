@echo off
cd /d "c:\Users\Predator\Downloads\Telegram Desktop\raster_zarafshon_v1\2025\map_generator_v2-20260420T182018Z-3-001\map_generator_v2"
echo === Git Status ===
git status
echo.
echo === Adding all changes ===
git add -A
echo.
echo === Committing ===
git commit -m "fix: add missing imports (motion, Move, Printer, Navigation2, FileDown), add kompanovka state+functions, fix server binding to 0.0.0.0 for deployment"
echo.
echo === Pushing to GitHub ===
git push origin main
echo.
echo === Done! ===
pause
