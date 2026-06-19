#!/usr/bin/env python3
"""Generate simple PNG icons for MusicFlow PWA using only stdlib."""
import struct
import zlib
import os

def create_png(width, height, color_fn):
    """Create a PNG file. color_fn(x, y) -> (r, g, b, a)"""
    raw = []
    for y in range(height):
        row = [0]  # filter byte
        for x in range(width):
            r, g, b, a = color_fn(x, y)
            row.extend([r, g, b, a])
        raw.extend(row)
    
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    compressed = zlib.compress(bytes(raw), 9)
    
    return sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', compressed) + chunk(b'IEND', b'')

def make_icon(size):
    """Create a music note icon with gradient background."""
    cx, cy = size // 2, size // 2
    r = int(size * 0.38)
    
    def color_fn(x, y):
        # Distance from center for circle
        dx, dy = x - cx, y - cy
        dist = (dx*dx + dy*dy) ** 0.5
        
        if dist <= r:
            # Gradient from #6c5ce7 to #a29bfe
            t = dist / r
            red = int(108 + (162 - 108) * t)
            green = int(92 + (191 - 92) * t)
            blue = int(231 + (254 - 231) * t)
            
            # Draw music note shape (simplified)
            nx, ny = x / size, y / size
            
            # Note body (ellipse at bottom-left)
            note_cx, note_cy = 0.38, 0.62
            note_dx = (nx - note_cx) / 0.10
            note_dy = (ny - note_cy) / 0.07
            in_body = note_dx*note_dx + note_dy*note_dy <= 1
            
            # Note stem
            stem_x1, stem_x2 = 0.48, 0.48
            stem_y1, stem_y2 = 0.25, 0.55
            on_stem = abs(nx - 0.48) < 0.025 and 0.25 <= ny <= 0.55
            
            # Note flag
            flag_t = (ny - 0.25) / 0.15
            flag_x = 0.48 + flag_t * 0.15
            on_flag = (0.25 <= ny <= 0.40) and (nx <= flag_x) and (nx >= 0.48) and (ny >= 0.25 - (nx - 0.48) * 0.5)
            
            if in_body or on_stem or on_flag:
                return (255, 255, 255, 230)
            else:
                return (red, green, blue, 255)
        else:
            # Outside circle - transparent
            return (0, 0, 0, 0)
    
    return create_png(size, size, color_fn)

output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icons')
os.makedirs(output_dir, exist_ok=True)

for size in [192, 512]:
    data = make_icon(size)
    path = os.path.join(output_dir, f'icon-{size}.png')
    with open(path, 'wb') as f:
        f.write(data)
    print(f'Created {path} ({len(data)} bytes)')
