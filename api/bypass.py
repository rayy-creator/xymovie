import json
import re
import ipaddress
import socket
from urllib.parse import urlparse
from http.server import BaseHTTPRequestHandler

MAX_BODY = 4096

def validate_url(url):
    if not isinstance(url, str) or len(url) > 2048:
        raise ValueError("URL tidak valid atau terlalu panjang.")
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise ValueError("Hanya URL http:// atau https:// yang didukung.")
    host = p.hostname.lower().rstrip(".")
    if host in ("localhost", "localhost.localdomain") or host.endswith(".local"):
        raise ValueError("Alamat lokal tidak diizinkan.")
    try:
        ip = ipaddress.ip_address(host)
        if not ip.is_global:
            raise ValueError("Alamat IP privat tidak diizinkan.")
    except ValueError as e:
        if "tidak diizinkan" in str(e):
            raise
    # Resolve and reject hostnames that point to private, loopback or reserved networks.
    try:
        for item in socket.getaddrinfo(host, p.port or (443 if p.scheme == "https" else 80), type=socket.SOCK_STREAM):
            addr = ipaddress.ip_address(item[4][0])
            if not addr.is_global:
                raise ValueError("Host mengarah ke alamat jaringan privat.")
    except socket.gaierror:
        raise ValueError("Domain tidak dapat ditemukan.")
    return url

class handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "same-origin")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        return self._send(200, {"success": True, "service": "XYBYPASS API", "status": "online", "method": "POST"})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Allow", "POST, OPTIONS")
        self.end_headers()

    def do_POST(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 2 or size > MAX_BODY:
                return self._send(413, {"success": False, "error": "Ukuran permintaan tidak valid."})
            data = json.loads(self.rfile.read(size))
            url = validate_url(data.get("url", ""))
            # The upstream package is free/open-source and runs locally in this serverless function.
            from shortlink_bypass import bypass
            destination = bypass(url)
            if not destination or not isinstance(destination, str):
                return self._send(422, {"success": False, "error": "Provider tidak didukung atau proses bypass gagal."})
            out = urlparse(destination)
            if out.scheme not in ("http", "https") or not out.hostname:
                return self._send(422, {"success": False, "error": "Provider mengembalikan tujuan yang tidak valid."})
            return self._send(200, {"success": True, "destination": destination})
        except ValueError as e:
            return self._send(400, {"success": False, "error": str(e)})
        except Exception:
            return self._send(502, {"success": False, "error": "Bypass gagal. Provider mungkin membutuhkan captcha, login, atau metode yang belum didukung."})
