// --- CONFIGURATION INITIALE ---
const MAINTENANCE_MODE = false; // Passe à true pour bloquer l'accès au site

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// --- PROTECTION MODE MAINTENANCE ---
app.use((req, res, next) => {
    if (MAINTENANCE_MODE && req.path !== '/maintenance.html' && !req.path.includes('/socket.io')) {
        return res.redirect('/maintenance.html');
    }
    next();
});

// --- FICHIERS STATIQUES ---
app.use(express.static(path.join(__dirname, '../dashboard')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- CONNEXION MONGODB ---
const MONGO_URI = process.env.MONGO_URI; 
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Connecté"))
    .catch(err => console.error("❌ Erreur MongoDB:", err));

// --- MODÈLE CHAUFFEUR ---
const DriverSchema = new mongoose.Schema({
    name: { type: String, unique: true },
    distance: { type: Number, default: 0 },
    experience: { type: Number, default: 0 },
    wallet: { type: Number, default: 1500 },
    lastJob: { type: String, default: "En attente de mission..." }
});
const Driver = mongoose.model('Driver', DriverSchema);

// --- ROUTES ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../dashboard/login.html'));
});

// --- LOGIQUE TEMPS RÉEL (SOCKET.IO) ---
io.on('connection', (socket) => {
    console.log("🌐 Nouveau chauffeur en ligne");

    socket.on('truck_data', async (data) => {
        const { driverName } = data;
        if (!driverName) return;

        let driver = await Driver.findOne({ name: driverName });
        if (!driver) {
            driver = new Driver({ name: driverName });
            await driver.save();
        }

        // 1. Calcul Distance et XP (Gain de 1.00€/km)
        if (socket.lastKM && data.truck.odometer > socket.lastKM) {
            let diff = data.truck.odometer - socket.lastKM;
            driver.distance += diff;
            driver.experience += Math.round(diff);
            driver.wallet += diff * 1.00; 
        }
        socket.lastKM = data.truck.odometer;

        // 2. Calcul Carburant (Diesel à 1.80€ / Litre)
        if (socket.lastFuel && data.truck.fuel < socket.lastFuel) {
            let consumed = socket.lastFuel - data.truck.fuel;
            driver.wallet -= consumed * 1.80;
        }
        socket.lastFuel = data.truck.fuel;

        // 3. SYSTÈME DE MALUS (Amende pour dégâts)
        // Se déclenche si les dégâts augmentent de plus de 2% d'un coup
        if (socket.lastDamage && data.truck.wearSum > socket.lastDamage + 2) {
            const penalty = 500;
            driver.wallet -= penalty;
            // On envoie une alerte spécifique au chauffeur
            socket.emit('receive_flash', `⚠️ AMENDE : -${penalty}€ pour conduite dangereuse !`);
        }
        socket.lastDamage = data.truck.wearSum;

        // 4. Détection fin de mission avec BONUS DE RANG
        if (socket.inJob && !data.job.cargoLoaded) {
            let prime = 2500; 
            if (driver.experience >= 5000) {
                prime = 6000; // Rang Légende
            } else if (driver.experience >= 2000) {
                prime = 4000; // Rang Expert
            }

            const detail = `${data.job.cargo} vers ${data.job.destinationCity}`;
            driver.wallet += prime;
            driver.lastJob = detail;
            io.emit('receive_flash', `🚚 MISSION RÉUSSIE : ${driver.name} (+${prime}€) - ${detail}`);
        }
        socket.inJob = data.job.cargoLoaded;

        await driver.save();

        // Envoi des données au Dashboard du chauffeur
        socket.emit('update_dashboard', {
            truck: data.truck,
            job: data.job,
            wallet: driver.wallet,
            experience: driver.experience,
            totalKM: Math.round(driver.distance)
        });

        // Mise à jour du Leaderboard pour tout le monde
        const allDrivers = await Driver.find().sort({ experience: -1 });
        io.emit('update_leaderboard', allDrivers);
    });

    // --- COMMANDES ADMINISTRATEUR ---
    const SECRET = "DAMIAN_VTC_2024";

    socket.on('admin_flash', (msg) => {
        io.emit('receive_flash', msg);
    });

    socket.on('admin_give_bonus', async (res) => {
        if (res.secret === SECRET) {
            let target = await Driver.findOne({ name: res.driverName });
            if (target) {
                target.wallet += parseFloat(res.amount);
                await target.save();
                io.emit('receive_flash', `💰 PRIME : ${res.driverName} a reçu un bonus de ${res.amount}€ !`);
            }
        }
    });

    socket.on('admin_repair_truck', (res) => {
        if (res.secret === SECRET) {
            io.emit('remote_repair', { targetDriver: res.driverName });
        }
    });

    socket.on('disconnect', () => {
        console.log("👋 Chauffeur déconnecté");
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Serveur actif sur le port ${PORT}`);
});