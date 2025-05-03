const express = require('express');
const bodyParser = require('body-parser');
const uuid = require('uuid');
const path = require('path');
const useragent = require('express-useragent'); // Add this package for user agent parsing
const cors = require('cors'); // Add CORS support

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

// Handle tracking redirects
app.get('/track/:uniqueId', (req, res) => {
    const uniqueId = req.params.uniqueId;
    
    if (urls[uniqueId]) {
        const targetUrl = urls[uniqueId].targetUrl;
        
        // Gather detailed device information
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
            ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            timestamp: new Date().toISOString()
        };
        
        // Store the click data
        urls[uniqueId].clicks.push(deviceInfo);
        
        // Redirect to the target URL
        res.redirect(targetUrl);
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
        });
        
        // Add statistics to response
        stats.platformStats = platforms;
        stats.browserStats = browsers;
        stats.deviceStats = devices;
        
        res.json(stats);
    } else {
        res.status(404).json({ error: "Invalid tracking ID" });
    }
});

// List all tracking IDs for the admin panel (optional)
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
