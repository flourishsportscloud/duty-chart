#!/usr/bin/env python3
"""Builds diary/index.html from these parts and bumps the hub link (fis/index.html) so phones reload.
Run from anywhere:  python3 diary/src/make.py"""
import time, re, os
H = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(os.path.dirname(H))
B = time.strftime('%Y%m%d%H%M', time.gmtime())
parts = [open(os.path.join(H, f)).read() for f in ['head.html', 'js1.js', 'js2.js', 'js3.js', 'js4.js', 'js5.js']]
t = "\n".join(parts).replace('__LOGO__', open(os.path.join(H, 'logo.txt')).read().strip()).replace('__BUILD__', B)
open(os.path.join(R, 'diary', 'index.html'), 'w').write(t)
L = os.path.join(R, 'fis', 'index.html'); f = open(L).read()
open(L, 'w').write(re.sub(r'"url": "\.\./diary/[^"]*"', '"url": "../diary/?v=%s"' % B, f))
print('build', B, len(t))
