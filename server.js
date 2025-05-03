const express = require('express');
const bodyParser = require('body-parser');
const uuid = require('uuid');
const path = require('path');
const useragent = require('express-useragent'); // For user agent parsing
const cors = require('cors'); // For CORS support
const geoip = require('geoip-lite'); // Add this for IP-based geolocation

const app = express();
const urls = {};

// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(useragent.express()); // Initialize user agent middleware
app.use(cors()); // Enable CORS
app.use(express.static(path.join(__dirname, 'public')));

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Generate tracking URL
app.post('/generate', (req, res) => {
    const uniqueId = uuid.v4();
    const targetUrl = req.body.target_url;
    
    // Initialize tracking data
    urls[uniqueId] = { 
        targetUrl: targetUrl, 
        createdAt: new Date().toISOString(),
        clicks: [] 
    };
    
    // Create tracking URL
    const trackingUrl = `${req.protocol}://${req.get('host')}/track/${uniqueId}`;
    
    // Return both the tracking URL and ID
    res.json({ 
        trackingUrl: trackingUrl,
        trackingId: uniqueId 
    });
});

// Track click events separately from the redirect
app.post('/track-event/:uniqueId', (req, res) => {
    const uniqueId = req.params.uniqueId;
    
    if (urls[uniqueId]) {
        // Get IP-based geolocation
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const geo = geoip.lookup(ip) || {};
        
        // Gather all tracking data
        const deviceInfo = {
            userAgent: req.headers['user-agent'],
            platform: req.useragent.platform,
            browser: req.useragent.browser,
            version: req.useragent.version,
            os: req.useragent.os,
            isMobile: req.useragent.isMobile,
            isDesktop: req.useragent.isDesktop,
            isBot: req.useragent.isBot,
            referer: req.headers.referer || 'Direct',
            language: req.headers['accept-language'] ? req.headers['accept-language'].split(',')[0] : 'Unknown',
            ip: ip,
            timestamp: new Date().toISOString(),
            
            // IP-based geolocation
            country: geo.country || 'Unknown',
            region: geo.region || 'Unknown',
            city: geo.city || 'Unknown',
            timezone: geo.timezone || 'Unknown',
            
            // Client-provided data
            batteryPercentage: req.body.batteryPercentage || null,
            batteryCharging: req.body.batteryCharging || null,
            preciseLocation: req.body.location || null,
            screenResolution: req.body.screenResolution || null,
            connectionType: req.body.connectionType || 'Unknown',
            memoryUsage: req.body.memoryUsage || null,
            timeOnPage: req.body.timeOnPage || null,
            deviceOrientation: req.body.deviceOrientation || null
        };
        
        // Store the click data
        urls[uniqueId].clicks.push(deviceInfo);
        
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Invalid tracking ID" });
    }
});

// Handle tracking redirects
app.get('/track/:uniqueId', (req, res) => {
    const uniqueId = req.params.uniqueId;
    
    if (urls[uniqueId]) {
        const targetUrl = urls[uniqueId].targetUrl;
        
        // Get IP-based geolocation
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const geo = geoip.lookup(ip) || {};
        
        // Basic tracking data (in case client-side tracking fails)
        const deviceInfo = {
            userAgent: req.headers['user-agent'],
            platform: req.useragent.platform,
            browser: req.useragent.browser,
            version: req.useragent.version,
            os: req.useragent.os,
            isMobile: req.useragent.isMobile,
            isDesktop: req.useragent.isDesktop,
            isBot: req.useragent.isBot,
            referer: req.headers.referer || 'Direct',
            language: req.headers['accept-language'] ? req.headers['accept-language'].split(',')[0] : 'Unknown',
            ip: ip,
            timestamp: new Date().toISOString(),
            
            // IP-based geolocation
            country: geo.country || 'Unknown',
            region: geo.region || 'Unknown',
            city: geo.city || 'Unknown',
            timezone: geo.timezone || 'Unknown'
        };
        
        // Store the click data
        urls[uniqueId].clicks.push(deviceInfo);
        
        // Send HTML with tracking script and redirect
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Redirecting...</title>
                <script>
                    // Collect additional data and send it to the server
                    (function() {
                        const trackingId = "${uniqueId}";
                        const data = {};
                        
                        // Screen resolution
                        data.screenResolution = window.screen.width + 'x' + window.screen.height;
                        
                        // Device orientation
                        data.deviceOrientation = screen.orientation ? screen.orientation.type : (window.orientation === 0 ? 'portrait' : 'landscape');
                        
                        // Connection type
                        if (navigator.connection) {
                            data.connectionType = navigator.connection.effectiveType || navigator.connection.type || 'Unknown';
                        }
                        
                        // Memory info
                        if (performance && performance.memory) {
                            data.memoryUsage = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024)) + 'MB';
                        }
                        
                        // Battery info
                        if (navigator.getBattery) {
                            navigator.getBattery().then(function(battery) {
                                data.batteryPercentage = Math.round(battery.level * 100) + '%';
                                data.batteryCharging = battery.charging ? 'Yes' : 'No';
                                sendData();
                            }).catch(function() {
                                sendData();
                            });
                        } else {
                            sendData();
                        }
                        
                        // Get geolocation if available
                        if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(
                                function(position) {
                                    data.location = {
                                        latitude: position.coords.latitude,
                                        longitude: position.coords.longitude,
                                        accuracy: position.coords.accuracy
                                    };
                                    sendData();
                                },
                                function(error) {
                                    // Geolocation permission denied or error
                                    sendData();
                                },
                                { timeout: 2000, maximumAge: 60000 }
                            );
                        } else {
                            sendData();
                        }
                        
                        let dataSent = false;
                        
                        function sendData() {
                            if (dataSent) return; // Prevent multiple submissions
                            dataSent = true;
                            
                            fetch('/track-event/' + trackingId, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify(data)
                            }).finally(function() {
                                // Redirect to the target URL after sending data
                                window.location.href = "${targetUrl}";
                            });
                        }
                        
                        // Set a timeout to ensure redirection happens even if some data collection fails
                        setTimeout(function() {
                            sendData();
                        }, 2000);
                    })();
                </script>
            </head>
            <body>
                <h1>Redirecting you to the destination...</h1>
            </body>
            </html>
        `);
    } else {
        res.status(404).send("Invalid URL");
    }
});

// Get tracking statistics
app.get('/tracking-data/:uniqueId', (req, res) => {
    const uniqueId = req.params.uniqueId;
    
    if (urls[uniqueId]) {
        // Get basic stats
        const stats = {
            pageId: uniqueId,
            targetUrl: urls[uniqueId].targetUrl,
            createdAt: urls[uniqueId].createdAt,
            totalClicks: urls[uniqueId].clicks.length,
            lastClickAt: urls[uniqueId].clicks.length > 0 ? 
                urls[uniqueId].clicks[urls[uniqueId].clicks.length - 1].timestamp : null,
            clickDetails: urls[uniqueId].clicks
        };
        
        // Calculate platform statistics
        const platforms = {};
        const browsers = {};
        const devices = { mobile: 0, desktop: 0, bot: 0, other: 0 };
        const countries = {};
        const batteryStats = { 
            charging: 0, 
            notCharging: 0, 
            unknown: 0, 
            levels: { low: 0, medium: 0, high: 0, unknown: 0 } 
        };
        
        urls[uniqueId].clicks.forEach(click => {
            // Count platforms
            platforms[click.platform] = (platforms[click.platform] || 0) + 1;
            
            // Count browsers
            browsers[click.browser] = (browsers[click.browser] || 0) + 1;
            
            // Count device types
            if (click.isMobile) devices.mobile++;
            else if (click.isDesktop) devices.desktop++;
            else if (click.isBot) devices.bot++;
            else devices.other++;
            
            // Count countries
            countries[click.country] = (countries[click.country] || 0) + 1;
            
            // Battery statistics
            if (click.batteryCharging === 'Yes') batteryStats.charging++;
            else if (click.batteryCharging === 'No') batteryStats.notCharging++;
            else batteryStats.unknown++;
            
            if (click.batteryPercentage) {
                const percentage = parseInt(click.batteryPercentage);
                if (!isNaN(percentage)) {
                    if (percentage < 20) batteryStats.levels.low++;
                    else if (percentage < 50) batteryStats.levels.medium++;
                    else batteryStats.levels.high++;
                } else {
                    batteryStats.levels.unknown++;
                }
            } else {
                batteryStats.levels.unknown++;
            }
        });
        
        // Add statistics to response
        stats.platformStats = platforms;
        stats.browserStats = browsers;
        stats.deviceStats = devices;
        stats.countryStats = countries;
        stats.batteryStats = batteryStats;
        
        res.json(stats);
    } else {
        res.status(404).json({ error: "Invalid tracking ID" });
    }
});

// List all tracking IDs for the admin panel
app.get('/all-tracking-ids', (req, res) => {
    const trackingIds = Object.keys(urls).map(id => ({
        id: id,
        targetUrl: urls[id].targetUrl,
        createdAt: urls[id].createdAt,
        clickCount: urls[id].clicks.length
    }));
    
    res.json(trackingIds);
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
