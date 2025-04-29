import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; // Import necessary function

// --- Get current directory in ES module scope ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// --- --- ---

const PORT: number = 8080;
// Serve files relative to the project root, not the dist directory after compilation
const PROJECT_ROOT: string = path.resolve(__dirname, '..'); 
const PUBLIC_DIR: string = PROJECT_ROOT;

const MIME_TYPES: { [key: string]: string } = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm' // Needed for MediaPipe
};

const server = http.createServer((req, res) => {
    // Simple security: Prevent directory traversal
    if (req.url?.includes('..')) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad Request');
        return;
    }

    let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url || 'index.html');

    // If requesting a directory, default to index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // File not found - try serving index.html for SPA routing (optional)
                fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (errIndex, contentIndex) => {
                    if (errIndex) {
                        res.writeHead(404, { 'Content-Type': 'text/plain' });
                        res.end(`404 Not Found: ${req.url}`);
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(contentIndex, 'utf-8');
                    }
                });
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Server Error: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`Serving files from: ${PUBLIC_DIR}`);
});

server.on('error', (err) => {
    console.error('Server error:', err);
}); 