"""Servidor estático de desarrollo para el frontend, sin caché.

`python -m http.server` deja que el navegador guarde CSS/JS y a veces se ven versiones viejas
tras un cambio. Este servidor responde con Cache-Control: no-store.

Uso: python .claude/dev_server.py [puerto] [carpeta]
"""
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
    root = sys.argv[2] if len(sys.argv) > 2 else 'frontend'
    handler = partial(NoCacheHandler, directory=os.path.abspath(root))
    print(f'Frontend en http://localhost:{port} (sin caché) — carpeta: {root}')
    ThreadingHTTPServer(('', port), handler).serve_forever()
