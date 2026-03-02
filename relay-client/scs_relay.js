const io = require('socket.io-client');
const axios = require('axios');

// --- CONFIGURATION ---
const SERVER_URL = "https://vtc-dashboard-pro.onrender.com"; 
const TELEMETRY_URL = "http://localhost:25555/api/ets2/telemetry";

// On force un nom par défaut si l'env n'est pas définie pour éviter le "Chauffeur_Anonyme"
const DRIVER_NAME = process.env.DRIVER_NAME || "CHAUFFEUR_ALPHA";

const socket = io(SERVER_URL, {
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000
});

console.log(`\n🚀 [VTC OPS] RELAY INITIALISÉ`);
console.log(`👤 AGENT : ${DRIVER_NAME}`);
console.log(`🔗 SERVEUR : ${SERVER_URL}\n`);

// Statut de connexion au serveur Cloud
socket.on('connect', () => {
    console.log("✅ [CLOUD] Connexion établie. Flux de données actif.");
});

socket.on('disconnect', () => {
    console.log("❌ [CLOUD] Déconnecté. Tentative de reconnexion...");
});

// Écoute des flashs ou alertes envoyés par le Dispatcher
socket.on('receive_flash', (data) => {
    console.log(`\n🔔 [ALERTE DISPATCH] : ${data.message}\n`);
    // Ici, on pourrait déclencher un son système pour prévenir le chauffeur
});

// Boucle principale de capture
setInterval(async () => {
    try {
        const response = await axios.get(TELEMETRY_URL, { timeout: 400 });
        const d = response.data;

        // Calcul intelligent de l'usure (Moyenne pondérée : moteur/châssis/roues)
        const wearLevel = (d.truck.wearEngine * 0.4 + d.truck.wearChassis * 0.4 + d.truck.wearWheels * 0.2) * 100;

        const payload = {
            driverName: DRIVER_NAME,
            timestamp: new Date().toISOString(),
            truck: {
                brand: d.truck.brand,
                model: d.truck.model,
                speed: Math.max(0, Math.round(d.truck.speed * 3.6)), // Conversion m/s en km/h si nécessaire
                odometer: Math.round(d.truck.odometer),
                fuel: Math.round(d.truck.fuel),
                fuelCapacity: d.truck.fuelCapacity,
                fuelPct: Math.round((d.truck.fuel / d.truck.fuelCapacity) * 100),
                wearSum: wearLevel.toFixed(1),
                gear: d.truck.displayedGear,
                engineOn: d.truck.engineOn,
                cruiseControl: d.truck.cruiseControlOn
            },
            job: {
                active: d.job.cargoLoaded,
                cargo: d.job.cargo || "Aucune cargaison",
                destinationCity: d.job.destinationCity || "En attente",
                remainingDistance: Math.round(d.job.remainingDistanceKm || 0),
                plannedDistance: Math.round(d.job.plannedDistanceKm || 0),
                income: d.job.income
            },
            navigation: {
                nextRest: d.navigation.nextRestStopInMinutes || 0,
                speedLimit: d.navigation.speedLimit || 0
            }
        };

        // Envoi des données au serveur
        socket.emit('truck_data', payload);

    } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            process.stdout.write("⏳ [SCS] En attente du simulateur... \r");
        } else {
            console.error("\n⚠️ [ERREUR RELAY] :", error.message);
        }
    }
}, 500); // 500ms est le "sweet spot" entre réactivité et performance