#!/usr/bin/env python3
"""Loopback-only static service. No ROS write, subprocess or arbitrary file API."""
import argparse
import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit
import xml.etree.ElementTree as ET

DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"


class Handler(BaseHTTPRequestHandler):
    def respond(self, code, data, content_type, head=False):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' ws://localhost:* ws://127.0.0.1:* wss://localhost:* wss://127.0.0.1:*; object-src 'none'; frame-ancestors 'none'")
        self.end_headers()
        if not head:
            self.wfile.write(data)

    def serve(self, head=False):
        # Reject DNS-rebinding hostnames even when they resolve to loopback.
        valid_hosts = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
        if self.headers.get("Host", "") not in valid_hosts:
            self.respond(403, b"Invalid local Host", "text/plain", head)
            return
        request = urlsplit(self.path)
        path = unquote(request.path)
        if path == "/api/resource":
            uri = parse_qs(request.query).get("uri", [""])[0]
            parsed = urlsplit(uri)
            allowed = self.server.resource_roots.get(parsed.netloc)
            relative = unquote(parsed.path).lstrip("/")
            if parsed.scheme != "package" or not allowed or not relative or "\\" in relative or "\x00" in relative or any(part == ".." for part in Path(relative).parts):
                self.respond(403, b"Resource URI outside allowlist", "text/plain", head)
                return
            share, roots = allowed
            target = (share / relative).resolve()
            suffixes = {".stl", ".dae", ".urdf", ".png", ".jpg", ".jpeg", ".webp", ".mtl", ".obj"}
            if target.suffix.lower() not in suffixes or not any(target.is_relative_to(root) for root in roots):
                self.respond(403, b"Resource path outside package roots", "text/plain", head)
                return
            if not target.is_file():
                self.respond(404, b"Package resource missing", "text/plain", head)
                return
            if target.stat().st_size > 64 * 1024 * 1024:
                self.respond(413, b"Resource too large", "text/plain", head)
                return
            mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            self.respond(200, target.read_bytes(), mime, head)
            return
        if path == "/api/health":
            payload = json.dumps({"service": "ros2-web-visualizer", "read_only": True}).encode()
            self.respond(200, payload, "application/json", head)
            return
        if "\x00" in path or "\\" in path:
            self.respond(400, b"Invalid path", "text/plain", head)
            return
        target = (DIST / ("index.html" if path == "/" else path.lstrip("/"))).resolve()
        if not target.is_relative_to(DIST.resolve()):
            self.respond(403, b"Outside public root", "text/plain", head)
            return
        if not target.is_file():
            self.respond(404, b"Not found", "text/plain", head)
            return
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.respond(200, target.read_bytes(), mime, head)

    def do_GET(self):
        self.serve()

    def do_HEAD(self):
        self.serve(head=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5173)
    parser.add_argument("--allow-package", action="append", default=[], help="ROS package whose model resources may be served")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("port must be between 1024 and 65535")
    if not (DIST / "index.html").is_file():
        parser.error("frontend/dist missing; run scripts/build.sh first")
    roots = {}
    if args.allow_package:
        try:
            from ament_index_python.packages import get_package_share_directory
        except ImportError:
            parser.error("source /opt/ros/humble/setup.bash before serving package resources")
        for package in args.allow_package:
            try:
                share = Path(get_package_share_directory(package))
                allowed = [share.resolve()]
                manifest = (share / "package.xml").resolve()
                if ET.parse(manifest).getroot().findtext("name") == package:
                    allowed.append(manifest.parent)
                # colcon --symlink-install may copy package.xml while linking
                # models/urdf to a source package. Trust only an ancestor with
                # this exact package's manifest, never an arbitrary symlink root.
                for asset_dir in ("models", "meshes", "urdf", "textures", "materials"):
                    resolved = (share / asset_dir).resolve()
                    for parent in [resolved, *list(resolved.parents)[:6]]:
                        candidate = parent / "package.xml"
                        if candidate.is_file():
                            try:
                                if ET.parse(candidate).getroot().findtext("name") == package:
                                    allowed.append(parent)
                            except ET.ParseError:
                                pass
                            break
                roots[package] = (share, allowed)
            except Exception as exc:
                print(f"Resource package unavailable: {package}: {exc}", flush=True)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.resource_roots = roots
    print(f"Web UI: http://localhost:{args.port} · resource packages: {', '.join(roots) or 'none'}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
