#!/usr/bin/env node
/**
 * Simple HTTP server for Amazon Connect AI Assistant with proper CSP headers
 * Run with: node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 8080;

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    const extname = path.extname(filePath);
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Add CSP headers for Amazon Connect
    const cspPolicy = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.amazonaws.com https://*.awsapps.com https://*.my.connect.aws https://github.com https://connect-streams.s3.amazonaws.com https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://*.amazonaws.com https://*.awsapps.com https://*.my.connect.aws",
        "connect-src 'self' https: wss: https://*.amazonaws.com https://*.awsapps.com https://*.my.connect.aws",
        "img-src 'self' data: https:",
        "font-src 'self' https: data:",
        "media-src 'self' https: data:",
        "worker-src 'self' blob:",
        "frame-src 'self' https://*.amazonaws.com https://*.awsapps.com https://*.my.connect.aws",
        "child-src 'self' https://*.amazonaws.com https://*.awsapps.com https://*.my.connect.aws"
    ].join('; ');

    res.setHeader('Content-Security-Policy', cspPolicy);
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`, 'utf-8');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log('🚀 Amazon Connect AI Assistant Server');
    console.log(`📡 Serving at http://localhost:${PORT}`);
    console.log('🌐 Opening browser...');
    
    // Open browser
    const start = process.platform === 'darwin' ? 'open' : 
                  process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${start} http://localhost:${PORT}`);
    
    console.log('🛑 Press Ctrl+C to stop the server');
});

process.on('SIGINT', () => {
    console.log('\n🛑 Server stopped');
    process.exit(0);
});