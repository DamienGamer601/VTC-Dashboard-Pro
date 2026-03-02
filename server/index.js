const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- CONFIGURATION MONGODB ---
const MONGO_URI = "TON_LIEN_MONGODB_ICI"; // Remplace par ton lien Atlas
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Connecté à MongoDB Atlas"))
    .catch(err => console.error("❌ Erreur MongoDB:", err));

// --- MODÈLES DE DONNÉES ---
const DriverSchema = new mongoose.Schema({
    name: { type: String, unique: true },
    distance: { type: Number, default: 0 },
    wallet: { type: Number, default: 1500 }, // Capital de départ
    totalFuelSpends: { type: Number, default: 0 },
    totalRepairSpends: { type: Number, default: 0 }
});
const Driver = mongoose.model('Driver', DriverSchema);

const DeliverySchema = new mongoose.Schema({
    driverName: String,
    destination: String,
    cargo: String,
    reward: Number,
    date: { type: Date, default: Date.now }
});
const Delivery = mongoose.model('Delivery', DeliverySchema);

// --- LOGIQUE SOCKET.IO ---
io.on('connection', (socket) => {
    console.log("🌐 Un utilisateur s'est connecté");

    // 1. RÉCEPTION DES DONNÉES DU CAMION (Télémétrie)
    socket.on('truck_data', async (data) => {
        const { driverName } = data;
        if (!driverName) return;

        let driver = await Driver.findOne({ name: driverName });
        if (!driver) {
            driver = new Driver({ name: driverName });
            await driver.save();
        }

        // --- CALCULS ÉCONOMIQUES ---
        
        // A. Carburant (Estimation: 1.50€ le litre consommé)
        if (socket.lastFuel && data.truck.fuel < socket.lastFuel) {
            let consumed = socket.lastFuel - data.truck.fuel;
            let cost = consumed * 1.50;
            driver.wallet -= cost;
            driver.totalFuelSpends += cost;
        }
        socket.lastFuel = data.truck.fuel;

        // B. Dégâts (Estimation: 100€ par 1% de dégât supplémentaire)
        if (socket.lastWear && data.truck.wearSum > socket.lastWear) {
            let damageDiff = data.truck.wearSum - socket.lastWear;
            let repairCost = damageDiff * 100;
            driver.wallet -= repairCost;
            driver.totalRepairSpends += repairCost;
        }
        socket.lastWear = data.truck.wearSum;

        // C. Distance & Gain (0.50€ par KM parcouru)
        if (socket.lastKM && data.truck.odometer > socket.lastKM) {
            let distanceTravelled = data.truck.odometer - socket.lastKM;
            driver.distance += distanceTravelled;
            driver.wallet += distanceTravelled * 0.50;
        }
        socket.lastKM = data.truck.odometer;

        // D. Détection Fin de Mission
        if (socket.inJob && !data.job.cargoLoaded) {
            // Le chauffeur vient de livrer !
            const reward = 2000; // Prime fixe de livraison
            driver.wallet += reward;
            
            const newDelivery = new Delivery({
                driverName: driver.name,
                destination: data.job.destinationCity,
                cargo: data.job.cargo,
                reward: reward
            });
            await newDelivery.save();
            
            // Notification globale
            io.emit('receive_flash', `✅ ${driver.name} a livré ${data.job.cargo} à ${data.job.destinationCity} ! (+${reward}€)`);
            
            // Mise à jour de l'historique pour tout le monde
            const history = await Delivery.find().sort({ date: -1 }).limit(5);
            io.emit('update_history', history);
        }
        socket.inJob = data.job.cargoLoaded;

        await driver.save();

        // Envoyer les infos privées au chauffeur
        socket.emit('update_dashboard', {
            truck: data.truck,
            job: data.job,
            wallet: driver.wallet,
            totalKM: Math.round(driver.distance)
        });

        // Mettre à jour le leaderboard public
        const allDrivers = await Driver.find();
        io.emit('update_leaderboard', allDrivers);
    });

    // 2. COMMANDES ADMIN (Flash, Bonus, Repair, Dispatch)
    const ADMIN_SECRET = "DAMIAN_VTC_2024";

    socket.on('admin_flash', (msg) => {
        io.emit('receive_flash', msg);
    });

    socket.on('admin_give_bonus', async (data) => {
        if (data.secret === ADMIN_SECRET) {
            let driver = await Driver.findOne({ name: data.driverName });
            if (driver) {
                driver.wallet += parseFloat(data.amount);
                await driver.save();
                io.emit('receive_flash', `💰 FINANCE : ${data.driverName} a reçu un virement de ${data.amount}€ !`);
                const allDrivers = await Driver.find();
                io.emit('update_leaderboard', allDrivers);
            }
        }
    });

    socket.on('admin_repair_truck', (data) => {
        if (data.secret === ADMIN_SECRET) {
            io.emit('remote_repair', { targetDriver: data.driverName });
            io.emit('receive_flash', `🛠️ ASSISTANCE : Le camion de ${data.driverName} a été remis à neuf !`);
        }
    });

    socket.on('admin_dispatch_job', (data) => {
        if (data.secret === ADMIN_SECRET) {
            io.emit('receive_dispatch', {
                target: data.target,
                city: data.city,
                cargo: data.cargo
            });
            io.emit('receive_flash', `🛰️ DISPATCH : ${data.target}, rendez-vous à ${data.city} pour charger !`);
        }
    });

    socket.on('disconnect', () => {
        console.log("👋 Un utilisateur s'est déconnecté");
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Serveur actif sur le port ${PORT}`);
});