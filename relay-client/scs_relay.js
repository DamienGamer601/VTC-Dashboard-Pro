const io = require('socket.io-client');
const axios = require('axios');

// --- CONFIGURATION ---
const SERVER_URL = "https://vtc-dashboard-pro.onrender.com"; // Remplace par ton URL Render
const TELEMETRY_URL = "http://localhost:25555/api/ets2/telemetry"; // URL par défaut du plugin SCS SDK
const UPDATE_INTERVAL = 1000; // Envoi des données toutes les 1 seconde

// Récupération du nom du chauffeur configuré dans le dashboard
// Note: Si tu lances ce script manuellement, remplace 'Damian' par ton pseudo
const DRIVER_NAME = "Damian"; 

const socket = io(SERVER_URL);

console.log("🚛 Relais VTC Pro - Démarrage...");

socket.on('connect', () => {
    console.log("✅ Connecté au serveur VTC Cloud !");
});

socket.on('disconnect', () => {
    console.log("❌ Déconnecté du serveur.");
});

// Boucle de récupération des données
setInterval(async () => {
    try {
        const response = await axios.get(TELEMETRY_URL);
        const telemetry = response.data;

        // On ne transmet les données que si le camion est détecté
        if (telemetry.truck && telemetry.truck.brand) {
            
            // On structure les données pour le serveur
            const payload = {
                driverName: DRIVER_NAME,
                truck: {
                    speed: Math.round(telemetry.truck.speed),
                    displayedGear: telemetry.truck.displayedGear,
                    fuel: telemetry.truck.fuel,
                    fuelCapacity: telemetry.truck.fuelCapacity,
                    wearSum: (telemetry.truck.wearEngine + telemetry.truck.wearWheels + telemetry.truck.wearTransmission) / 3 * 100, // Moyenne des dégâts
                    odometer: telemetry.truck.odometer,
                    parkBrakeOn: telemetry.truck.parkBrakeOn,
                    cruiseControlOn: telemetry.truck.cruiseControlOn,
                    cruiseControlSpeed: telemetry.truck.cruiseControlSpeed
                },
                job: {
                    cargoLoaded: telemetry.job.cargoLoaded,
                    cargo: telemetry.job.cargo,
                    destinationCity: telemetry.job.destinationCity
                }
            };

            socket.emit('truck_data', payload);
            process.stdout.write(`\r[ENVOI] Vitesse: ${payload.truck.speed} km/h | Fuel: ${Math.round(payload.truck.fuel)}L   `);
        } else {
            process.stdout.write(`\r[ATTENTE] ETS2 détecté, mais aucun camion en route...   `);
        }
    } catch (error) {
        process.stdout.write(`\r[ERREUR] Impossible de joindre le plugin Telemetry (Vérifiez si le jeu est lancé)   `);
    }
}, UPDATE_INTERVAL);