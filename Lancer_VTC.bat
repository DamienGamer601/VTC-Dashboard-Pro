@echo off
title VTC Pro - Relais de Telemetrie
mode con: cols=80 lines=20
color 0b

:: --- CONFIGURATION ---
set DRIVER_NAME=DamienGamer60
:: ---------------------

echo ##########################################
echo #       LANCEUR RELAIS VTC PRO           #
echo ##########################################
echo.
echo Chauffeur : %DRIVER_NAME%
echo Tentative de connexion au serveur...
echo.

:: Lancement du script Node.js
node scs_relay.js

echo.
echo [!] Le relais s'est arrete.
pause