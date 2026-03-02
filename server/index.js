const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// --- CONFIGURATION DES FICHIERS STATIQUES ---
app.use(express.static(path.join(__dirname, '../dashboard')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- CONFIGURATION MONGODB ---
const MONGO_URI = process.env.MONGO_URI; 

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Base de données connectée"))
    .catch(err => console.error("❌ Erreur de connexion MongoDB:", err));

// --- MODÈLE DE DONNÉES ---
const DriverSchema = new mongoose.Schema({
    name: { type: String, unique: true },
    distance: { type: Number, default: 0 },
    experience: { type: Number, default: 0 },
    wallet: { type: Number, default: 1500 },
    lastJob: { type: String, default: "Aucune mission récente" }
});
const Driver = mongoose.model('Driver', DriverSchema);

// --- ROUTE PAR DÉFAUT ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../dashboard/login.html'));
});

// --- LOGIQUE SOCKET.IO ---
io.on('connection', (socket) => {
    console.log("🌐 Nouveau chauffeur connecté");

    socket.on('truck_data', async (data) => {
        const { driverName } = data;
        if (!driverName) return;

        let driver = await Driver.findOne({ name: driverName });
        if (!driver) {
            driver = new Driver({ name: driverName });
            await driver.save();
        }

        // 1. Calcul Distance et XP (1km = 1xp + 0.50€)
        if (socket.lastKM && data.truck.odometer > socket.lastKM) {
            let dist = data.truck.odometer - socket.lastKM;
            driver.distance += dist;
            driver.experience += Math.round(dist);
            driver.wallet += dist * 0.50;
        }
        socket.lastKM = data.truck.odometer;

        // 2. Gestion des dépenses (Carburant)
        if (socket.lastFuel && data.truck.fuel < socket.lastFuel) {
            let fuelSpent = (socket.lastFuel - data.truck.fuel) * 1.50; // 1.50€ le litre
            driver.wallet -= fuelSpent;
        }
        socket.lastFuel = data.truck.fuel;

        // 3. Détection fin de mission et mise à jour Historique
        if (socket.inJob && !data.job.cargoLoaded) {
            const reward = 2000;
            const cargo = data.job.cargo || "Fret";
            const dest = data.job.destinationCity || "Ville inconnue";
            
            driver.wallet += reward;
            driver.lastJob = `${cargo} vers ${dest}`; // Mise à jour pour le profil et leaderboard
            
            io.emit('receive_flash', `✅ LIVRAISON : ${driver.name} a livré ${driver.lastJob} (+${reward}€)`);
        }
        socket.inJob = data.job.cargoLoaded;

        await driver.save();

        // Mise à jour Dashboard personnel
        socket.emit('update_dashboard', {
            truck: data.truck,
            job: data.job,
            wallet: driver.wallet,
            experience: driver.experience,
            totalKM: Math.round(driver.distance)
        });

        // Mise à jour Leaderboard global
        const allDrivers = await Driver.find();
        io.emit('update_leaderboard', allDrivers);
    });

    // --- COMMANDES ADMIN ---
    const ADMIN_SECRET = "DAMIAN_VTC_2024";

    socket.on('admin_flash', (msg) => {
        io.emit('receive_flash', msg);
    });

    socket.on('admin_give_bonus', async (data) => {
        if (data.secret === ADMIN_SECRET) {
            let d = await Driver.findOne({ name: data.driverName });
            if (d) {
                d.wallet += parseFloat(data.amount);
                await d.save();
                io.emit('receive_flash', `💰 BONUS : ${data.driverName} a reçu une prime de ${data.amount}€ !`);
            }
        }
    });

    socket.on('admin_repair_truck', (data) => {
        if (data.secret === ADMIN_SECRET) {
            // Envoi d'un signal spécial au dashboard du chauffeur visé
            io.emit('remote_repair', { targetDriver: data.driverName });
        }
    });

    socket.on('disconnect', () => {
        console.log("👋 Déconnexion d'un chauffeur");
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Serveur en ligne sur le port ${PORT}`);
});