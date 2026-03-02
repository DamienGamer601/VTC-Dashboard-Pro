const io = require('socket.io-client');
// REMPLACE PAR TON URL RENDER UNE FOIS EN LIGNE
const socket = io('http://localhost:3000'); 

let px = 0, pz = 0, fuel = 800, dist = 0;
const driverName = "Chauffeur_1";

setInterval(() => {
    px += 1; pz += 0.5; fuel -= 0.05; dist += 0.1;
    socket.emit('truck_data', {
        driverId: driverName,
        drivers_distance: dist,
        truck: { speed: 85, fuel: fuel, wearSum: 0 },
        location: { city: "Secteur Cloud", x: px, z: pz }
    });
}, 1000);