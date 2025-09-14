#!/usr/bin/env python3
"""
Simple HTTP server for Amazon Connect AI Assistant
Run with: python3 server.py
"""

import http.server
import socketserver
import webbrowser
import os

PORT = 8080

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        
        # Add CSP headers for Amazon Connect
        csp_policy = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.amazonaws.com https://*.awsapps.com https://*.my.connect.aws https://github.com https://connect-streams.s3.amazonaws.com https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://*.amazonaws.com https://*.awsapps.com https://*.my.connect.aws; "
            "connect-src 'self' https: wss: https://*.amazonaws.com https://*.awsapps.com https://*.my.connect.aws; "
            "img-src 'self' data: https:; "
            "font-src 'self' https: data:; "
            "media-src 'self' https: data:; "
            "worker-src 'self' blob:; "
            "frame-src 'self' https://*.amazonaws.com https://*.awsapps.com https://*.my.connect.aws; "
            "child-src 'self' https://*.amazonaws.com https://*.awsapps.com https://*.my.connect.aws;"
        )
        self.send_header('Content-Security-Policy', csp_policy)
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        
        super().end_headers()

def main():
    # Change to the directory containing this script
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"🚀 Amazon Connect AI Assistant Server")
        print(f"📡 Serving at http://localhost:{PORT}")
        print(f"🌐 Opening browser...")
        
        # Open browser
        webbrowser.open(f'http://localhost:{PORT}')
        
        print(f"🛑 Press Ctrl+C to stop the server")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print(f"\n🛑 Server stopped")

if __name__ == "__main__":
    main()