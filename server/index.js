const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connecté"))
    .catch(err => console.error("❌ Erreur Mongo:", err));

const driverSchema = new mongoose.Schema({
    name: { type: String, unique: true },
    distance: { type: Number, default: 0 },
    wallet: { type: Number, default: 0 },
    perfect_streak: { type: Number, default: 0 }
});
const Driver = mongoose.model('Driver', driverSchema);

app.use(express.static(path.join(__dirname, '../dashboard')));

app.get('/api/leaderboard', async (req, res) => {
    const drivers = await Driver.find().sort({ distance: -1 }).limit(10);
    res.json(drivers);
});

app.get('/api/driver/:name', async (req, res) => {
    let driver = await Driver.findOne({ name: req.params.name });
    if (!driver) driver = await Driver.create({ name: req.params.name });
    res.json(driver);
});

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
        await Driver.findOneAndUpdate({ name: data.driverName }, { 
            $inc: { distance: data.distance, wallet: bonus }
        });
        startFuel = null; startDist = null;
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Port: ${PORT}`));