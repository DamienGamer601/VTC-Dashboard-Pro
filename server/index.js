const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path'); // Nécessaire pour les chemins de fichiers

const app = express();
app.use(cors());

// --- GESTION DES FICHIERS STATIQUES ---
// Cette ligne dit à Express de servir tes pages HTML situées dans le dossier 'dashboard'
app.use(express.static(path.join(__dirname, '../dashboard')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- CONFIGURATION MONGODB ---
// On utilise la variable d'environnement définie sur Render pour la sécurité
const MONGO_URI = process.env.MONGO_URI; 

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Connecté à MongoDB Atlas"))
    .catch(err => console.error("❌ Erreur MongoDB:", err));

// --- MODÈLES DE DONNÉES ---
const DriverSchema = new mongoose.Schema({
    name: { type: String, unique: true },
    distance: { type: Number, default: 0 },
    wallet: { type: Number, default: 1500 },
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

// --- ROUTE PRINCIPALE ---
// Quand tu arrives sur ton-site.onrender.com, on affiche le login
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../dashboard/login.html'));
});

// --- LOGIQUE SOCKET.IO ---
io.on('connection', (socket) => {
    console.log("🌐 Un utilisateur s'est connecté");

    socket.on('truck_data', async (data) => {
        const { driverName } = data;
        if (!driverName) return;

        let driver = await Driver.findOne({ name: driverName });
        if (!driver) {
            driver = new Driver({ name: driverName });
            await driver.save();
        }

        // --- CALCULS ÉCONOMIQUES (Carburant, Dégâts, Distance) ---
        if (socket.lastFuel && data.truck.fuel < socket.lastFuel) {
            let cost = (socket.lastFuel - data.truck.fuel) * 1.50;
            driver.wallet -= cost;
            driver.totalFuelSpends += cost;
        }
        socket.lastFuel = data.truck.fuel;

        if (socket.lastWear && data.truck.wearSum > socket.lastWear) {
            let repairCost = (data.truck.wearSum - socket.lastWear) * 100;
            driver.wallet -= repairCost;
            driver.totalRepairSpends += repairCost;
        }
        socket.lastWear = data.truck.wearSum;

        if (socket.lastKM && data.truck.odometer > socket.lastKM) {
            let dist = data.truck.odometer - socket.lastKM;
            driver.distance += dist;
            driver.wallet += dist * 0.50;
        }
        socket.lastKM = data.truck.odometer;

        // Fin de mission
        if (socket.inJob && !data.job.cargoLoaded) {
            const reward = 2000;
            driver.wallet += reward;
            const newDel = new Delivery({ driverName: driver.name, destination: data.job.destinationCity, cargo: data.job.cargo, reward: reward });
            await newDel.save();
            io.emit('receive_flash', `✅ ${driver.name} a livré ${data.job.cargo} ! (+${reward}€)`);
        }
        socket.inJob = data.job.cargoLoaded;

        await driver.save();

        socket.emit('update_dashboard', { truck: data.truck, job: data.job, wallet: driver.wallet, totalKM: Math.round(driver.distance) });
        const allDrivers = await Driver.find();
        io.emit('update_leaderboard', allDrivers);
        const history = await Delivery.find().sort({ date: -1 }).limit(10);
        io.emit('update_history', history);
    });

    // --- COMMANDES ADMIN ---
    const ADMIN_SECRET = "DAMIAN_VTC_2024";
    socket.on('admin_flash', (msg) => io.emit('receive_flash', msg));
    socket.on('admin_give_bonus', async (data) => {
        if (data.secret === ADMIN_SECRET) {
            let d = await Driver.findOne({ name: data.driverName });
            if (d) { d.wallet += parseFloat(data.amount); await d.save(); }
        }
    });

    socket.on('disconnect', () => console.log("👋 Déconnexion"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Serveur en ligne sur le port ${PORT}`);
});