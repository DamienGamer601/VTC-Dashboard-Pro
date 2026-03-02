const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- CONFIGURATION MONGODB CLOUD ---
// Utilise la variable d'environnement MONGO_URI configurée sur Render
const MONGO_URI = process.env.MONGO_URI; 

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Base de données Cloud MongoDB connectée"))
    .catch(err => console.error("❌ Erreur de connexion MongoDB:", err));

// --- MODÈLE DE DONNÉES DES CHAUFFEURS ---
const driverSchema = new mongoose.Schema({
    name: { type: String, unique: true },
    distance: { type: Number, default: 0 },
    wallet: { type: Number, default: 0 },
    perfect_streak: { type: Number, default: 0 }
});
const Driver = mongoose.model('Driver', driverSchema);

// --- LOGIQUE DES RANGS ---
function getRank(distance) {
    if (distance < 500) return { name: "NOVICE", color: "#888" };
    if (distance < 2000) return { name: "ROUTIER CONFIRMÉ", color: "#00d1ff" };
    if (distance < 5000) return { name: "VÉTÉRAN DES ASPHALTES", color: "#ffcc00" };
    return { name: "LÉGENDE DU CONVOI", color: "#39ff14" };
}

// Servir les fichiers statiques du dossier dashboard
app.use(express.static(path.join(__dirname, '../dashboard')));

// --- API : GAZETTE / NEWS ---
app.get('/api/news', (req, res) => {
    res.json([
        { date: "02/03", text: "🚀 Bienvenue sur le nouveau Dashboard de la VTC !" },
        { date: "02/03", text: "🚛 DamienGamer601 a été nommé Directeur Général." },
        { date: "03/03", text: "🏆 Objectif de la semaine : Atteindre les 5000 KM cumulés !" },
        { date: "INFO", text: "⚠️ N'oubliez pas de lancer votre relais avant de prendre la route." }
    ]);
});

// --- API : CLASSEMENT ---
app.get('/api/leaderboard', async (req, res) => {
    try {
        const drivers = await Driver.find().sort({ distance: -1 }).limit(10);
        res.json(drivers);
    } catch (err) {
        res.status(500).send(err);
    }
});

// --- API : PROFIL INDIVIDUEL ---
app.get('/api/driver/:name', async (req, res) => {
    try {
        let driver = await Driver.findOne({ name: req.params.name });
        if (!driver) {
            driver = await Driver.create({ name: req.params.name });
        }
        
        const rankInfo = getRank(driver.distance);
        res.json({ 
            ...driver._doc, 
            rank: rankInfo.name, 
            rankColor: rankInfo.color 
        });
    } catch (err) {
        res.status(500).send(err);
    }
});

// --- GESTION DU TEMPS RÉEL (SOCKET.IO) ---
let startFuel = null;
let startDist = null;

io.on('connection', (socket) => {
    console.log("📡 Nouvelle connexion établie");

    // Réception des données du camion depuis le relais PC
    socket.on('truck_data', (data) => {
        if (startFuel === null) startFuel = data.truck.fuel;
        if (startDist === null) startDist = data.drivers_distance || 0;

        const fuelConsumed = startFuel - data.truck.fuel;
        const distMoved = (data.drivers_distance || 0) - startDist;
        
        // Calcul de la consommation moyenne (L/100km)
        let avgCons = (distMoved > 0.1) ? (fuelConsumed / distMoved) * 100 : 0;

        // Diffusion vers le dashboard web
        io.emit('update_dashboard', { 
            ...data, 
            avgConsumption: avgCons.toFixed(1) 
        });
    });

    // Enregistrement des statistiques en fin de mission
    socket.on('mission_finished', async (data) => {
        console.log(`🏆 Mission terminée pour ${data.driverName}`);
        const bonus = data.damage === 0 ? 1000 : 500;
        
        try {
            await Driver.findOneAndUpdate(
                { name: data.driverName },
                { 
                    $inc: { distance: data.distance, wallet: bonus },
                    $set: { perfect_streak: data.damage === 0 ? 1 : 0 }
                }
            );
            // Réinitialisation des compteurs pour la prochaine mission
            startFuel = null; 
            startDist = null;
        } catch (err) {
            console.error("❌ Erreur sauvegarde mission:", err);
        }
    });
});

// --- LANCEMENT DU SERVEUR ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Serveur VTC actif sur le port ${PORT}`);
});