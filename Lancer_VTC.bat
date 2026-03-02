@echo off
title VTC Ops - Connecteur de Télémétrie
color 0B
cls

echo ==========================================================
echo           BIENVENUE CHEZ VTC OPS INTERNATIONAL
echo ==========================================================
echo.

:: Vérification de la présence de Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas installe sur cet ordinateur.
    echo Veuillez l'installer sur : https://nodejs.org/
    pause
    exit
)

:: Demander le pseudo si non configuré
set /p DRIVER_NAME="Entrez votre nom de chauffeur : "

cls
echo ==========================================================
echo    CONNEXION ETABLIE : %DRIVER_NAME%
echo    STATUT : EN SERVICE
echo ==========================================================
echo.
echo [INFO] Liaison avec Euro Truck Simulator 2 / ATS...
echo [INFO] Synchronisation avec le Dashboard en cours...
echo.
echo Gardez cette fenetre ouverte pendant que vous roulez.
echo Appuyez sur CTRL+C pour couper le service.
echo.

:: Lancement du relais avec le pseudo en paramètre
node scs_relay.js %DRIVER_NAME%

pause