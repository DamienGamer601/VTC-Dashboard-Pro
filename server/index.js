const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- CONFIGURATION MONGODB ---
const MONGO_URI = process.env.MONGO_URI; 

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Base de données Cloud MongoDB connectée"))
    .catch(err => console.error("❌ Erreur de connexion MongoDB:", err));

// --- MODÈLE DE DONNÉES ---
const driverSchema = new mongoose.Schema({
    name: { type: String, unique: true },
    points: { type: Number, default: 12 },
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

app.use(express.static(path.join(__dirname, '../dashboard')));

// --- API ROUTES ---
app.get('/api/news', (req, res) => {
    res.json([
        { date: "02/03", text: "🚚 Grand convoi prévu samedi à 21h !" },
        { date: "01/03", text: "🏆 Félicitations aux nouveaux promus." }
    ]);
});

app.get('/api/leaderboard', async (req, res) => {
    const drivers = await Driver.find().sort({ distance: -1 }).limit(10);
    res.json(drivers);
});

app.get('/api/driver/:name', async (req, res) => {
    let driver = await Driver.findOne({ name: req.params.name });
    if (!driver) driver = await Driver.create({ name: req.params.name });
    
    const rankInfo = getRank(driver.distance);
    const badges = [];
    if (driver.perfect_streak >= 5) badges.push({ name: "🛡️ BOUCLIER D'OR", desc: "5 missions parfaites" });
    if (driver.distance >= 1000) badges.push({ name: "🌍 GRAND VOYAGEUR", desc: "1000km parcourus" });

    res.json({ ...driver._doc, rank: rankInfo.name, rankColor: rankInfo.color, badges });
});

// --- TEMPS RÉEL ---
let startFuel = null;
let startDist = null;

io.on('connection', (socket) => {
    socket.on('truck_data', (data) => {
        if (startFuel === null) startFuel = data.truck.fuel;
        if (startDist === null) startDist = data.drivers_distance || 0;

        const fuelConsumed = startFuel - data.truck.fuel;
        const distMoved = (data.drivers_distance || 0) - startDist;
        let avgCons = (distMoved > 0.1) ? (fuelConsumed / distMoved) * 100 : 0;

        io.emit('update_dashboard', { ...data, avgConsumption: avgCons.toFixed(1) });
    });

    socket.on('mission_finished', async (data) => {
        const bonus = data.damage === 0 ? 1000 : 500;
        await Driver.findOneAndUpdate(
            { name: data.driverName },
            { 
                $inc: { distance: data.distance, wallet: bonus },
                $set: { perfect_streak: data.damage === 0 ? 1 : 0 }
            }
        );
        startFuel = null; startDist = null;
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Serveur actif sur port ${PORT}`));