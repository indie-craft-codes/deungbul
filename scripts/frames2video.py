"""record.mjs가 받은 장면들(시각표 붙은 jpg 목록)을 일정한 빠르기의 영상으로: frames2video.py <list.json> <출력.mp4> [fps]
.mp4(MPEG-4, 윈도에서 바로 재생)와 같은 이름의 .webm(VP8, 브라우저에서 재생)을 만들고, 확인용으로 1초마다 한 장씩 붙인 한 장(<출력>-sheet.jpg)도 만든다.
필요: pip install opencv-python"""
import json
import sys
import cv2
import numpy as np

lst, out = sys.argv[1], sys.argv[2]
fps = float(sys.argv[3]) if len(sys.argv) > 3 else 20.0
shots = json.load(open(lst, encoding='utf-8'))
first = cv2.imread(shots[0]['f'])
h, w = first.shape[:2]
t0, t1 = shots[0]['t'], shots[-1]['t']
n = max(2, int((t1 - t0) * fps) + 1)
base = out[:-4] if out.lower().endswith('.mp4') else out
writers = [cv2.VideoWriter(base + '.mp4', cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h)),
           cv2.VideoWriter(base + '.webm', cv2.VideoWriter_fourcc(*'VP80'), fps, (w, h))]
k, cur, sheet = 0, first, []
for i in range(n):
    t = t0 + i / fps
    while k + 1 < len(shots) and shots[k + 1]['t'] <= t:
        k += 1
        cur = cv2.imread(shots[k]['f'])
        if cur.shape[:2] != (h, w): cur = cv2.resize(cur, (w, h))
    for wr in writers: wr.write(cur)
    if i % int(fps) == 0: sheet.append(cur)
for wr in writers: wr.release()
# 1초마다 한 장: 한 줄에 4장
cols, tw = 4, 480
th = int(h * tw / w)
rows = (len(sheet) + cols - 1) // cols
img = np.zeros((rows * th, cols * tw, 3), np.uint8)
for j, f in enumerate(sheet):
    img[(j // cols) * th:(j // cols + 1) * th, (j % cols) * tw:(j % cols + 1) * tw] = cv2.resize(f, (tw, th))
    cv2.putText(img, f'{j}s', ((j % cols) * tw + 6, (j // cols) * th + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
cv2.imwrite(base + '-sheet.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 80])
print(f'{base}.mp4 / .webm  {w}x{h}  {n}장 ({n / fps:.1f}초, 받은 장면 {len(shots)}장)  확인용 {base}-sheet.jpg')
