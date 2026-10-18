"""Versionado automático de los archivos estáticos del frontend.

Los navegadores guardan en caché los CSS y JS; tras una actualización muchos usuarios (y el
navegador integrado de desarrollo) siguen viendo la versión vieja, con estilos rotos o
funciones que no responden. Este script agrega a cada referencia local un parámetro con la
huella del contenido del archivo:

    styles/design-system.css  →  styles/design-system.css?v=3f9a1c2e
    ui.js                     →  ui.js?v=77b0d4aa

Si el archivo cambia, la huella cambia y el navegador lo descarga de nuevo; si no cambia, sigue
usando la copia en caché. Hay que ejecutarlo después de modificar un CSS o JS (y antes de publicar):

    python scripts/cache_bust.py            # aplica los cambios
    python scripts/cache_bust.py --check    # solo verifica (sale con error si hay algo desactualizado)
"""
import hashlib
import pathlib
import re
import sys

FRONTEND = pathlib.Path(__file__).resolve().parent.parent / 'frontend'

# href="styles/x.css"  ·  src="config.js"  (solo archivos locales, no URLs externas)
REF = re.compile(r'((?:href|src)=")((?:styles/[\w.-]+\.css)|(?:[\w.-]+\.js))(?:\?v=[0-9a-f]+)?(")')


def fingerprint(path: pathlib.Path) -> str:
    # Los saltos de línea se normalizan para que la huella sea igual en Windows y Linux
    data = path.read_bytes().replace(b'\r\n', b'\n')
    return hashlib.sha1(data).hexdigest()[:8]


def main() -> int:
    check_only = '--check' in sys.argv
    stale, changed_files = 0, []

    for html in sorted(FRONTEND.glob('*.html')):
        raw = html.read_bytes().decode('utf-8')

        def repl(m):
            target = FRONTEND / m.group(2)
            if not target.exists():
                print(f'  ! {html.name}: no existe {m.group(2)}')
                return m.group(0)
            return f'{m.group(1)}{m.group(2)}?v={fingerprint(target)}{m.group(3)}'

        new = REF.sub(repl, raw)
        if new != raw:
            stale += 1
            changed_files.append(html.name)
            if not check_only:
                html.write_bytes(new.encode('utf-8'))

    if check_only:
        if stale:
            print('Desactualizados:', ', '.join(changed_files))
            print('Ejecuta: python scripts/cache_bust.py')
            return 1
        print('Versiones al día.')
        return 0

    print(f'{len(changed_files)} página(s) actualizada(s)' + (': ' + ', '.join(changed_files) if changed_files else ' (todo estaba al día)'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
