const io = require('socket.io-client');
const axios = require('axios');

// --- CONFIGURATION ---
// Remplace par l'URL de ton site Render (ex: https://mon-vtc.onrender.com)
const SERVER_URL = "https://vtc-dashboard-pro.onrender.com"; 

// URL locale du plugin telemetry (ne pas changer sauf si port différent)
const TELEMETRY_URL = "http://localhost:25555/api/ets2/telemetry";

const socket = io(SERVER_URL);

// Récupération du nom du chauffeur configuré sur ton ordi
const DRIVER_NAME = process.env.DRIVER_NAME || "Chauffeur_Anonyme";

console.log(`🚛 Relais VTC démarré pour : ${DRIVER_NAME}`);
console.log(`🔗 Connexion au serveur : ${SERVER_URL}`);

socket.on('connect', () => {
    console.log("✅ Connecté au serveur Render !");
});

socket.on('disconnect', () => {
    console.log("❌ Déconnecté du serveur.");
});

// Écoute des ordres de réparation à distance de l'admin
socket.on('remote_repair', (data) => {
    if (data.targetDriver.toLowerCase() === DRIVER_NAME.toLowerCase()) {
        console.log("🛠️ ORDRE ADMIN : Réparation du camion en cours...");
        // Ici, on pourrait ajouter une logique pour réinitialiser les dégâts 
        // si le plugin telemetry le permettait en écriture.
    }
});

// Boucle de lecture des données (toutes les 500ms pour ne pas ramer)
setInterval(async () => {
    try {
        const response = await axios.get(TELEMETRY_URL);
        const data = response.data;

        // On prépare l'objet à envoyer avec le nom du chauffeur
        const payload = {
            driverName: DRIVER_NAME,
            truck: {
                speed: Math.round(data.truck.speed > 0 ? data.truck.speed : 0),
                odometer: data.truck.odometer,
                fuel: data.truck.fuel,
                fuelCapacity: data.truck.fuelCapacity,
                wearSum: Math.round((data.truck.wearEngine + data.truck.wearWheels + data.truck.wearChassis) / 3 * 100),
                gear: data.truck.displayedGear
            },
            job: {
                cargoLoaded: data.job.cargoLoaded,
                cargo: data.job.cargo,
                destinationCity: data.job.destinationCity
            }
        };

        // Envoi au serveur
        socket.emit('truck_data', payload);

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log("⏳ En attente de SCS Telemetry (lance le jeu !)");
        } else {
            console.error("⚠️ Erreur relais :", error.message);
        }
    }
}, 500);