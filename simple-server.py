#!/usr/bin/env python3
"""
Simple HTTP server without CSP headers - matches working Connect_Streams setup
Run with: python3 simple-server.py
"""

import http.server
import socketserver
import webbrowser
import os

PORT = 8080

def main():
    # Change to the directory containing this script
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("", PORT), http.server.SimpleHTTPRequestHandler) as httpd:
        print(f"🚀 Amazon Connect AI Assistant - Simple Server")
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