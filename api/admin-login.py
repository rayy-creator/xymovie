import json
import os
import hmac
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 2 or size > 2048:
                return self.send_json(413, {"success": False, "error": "Permintaan tidak valid."})
            data = json.loads(self.rfile.read(size))
            expected = os.environ.get("XYBYPASS_ADMIN_PASSWORD", "")
            supplied = str(data.get("password", ""))
            if not expected:
                return self.send_json(503, {"success": False, "error": "Admin belum dikonfigurasi. Tambahkan XYBYPASS_ADMIN_PASSWORD di Vercel Environment Variables."})
            if not hmac.compare_digest(supplied, expected):
                return self.send_json(401, {"success": False, "error": "Password salah."})
            return self.send_json(200, {"success": True})
        except Exception:
            return self.send_json(400, {"success": False, "error": "Permintaan login tidak dapat diproses."})

    def send_json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
