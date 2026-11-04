#!/usr/bin/env python3
"""本地静态服务器（带 no-store 头）。

替代 `python -m http.server`：所有响应都带
  Cache-Control: no-store, no-cache, must-revalidate
  Pragma: no-cache
  Expires: 0
使浏览器与 Cloudflare 边缘（respect-origin 模式）都不缓存构建产物。
用法: python tools/serve_no_store.py [port] [root]
默认 port=8088, root=build/web-mobile
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8088
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', 'build', 'web-mobile'
)


class NoStoreHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):  # 精简日志
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))


if __name__ == '__main__':
    os.chdir(ROOT)
    http.server.ThreadingHTTPServer(('0.0.0.0', PORT), NoStoreHandler).serve_forever()
