"""
[3 공개 라이브러리] make_qr.py — segno 로 앱 주소 QR 코드 만들기 (포스터용)

설치(한 번):  pip install segno
실행:         python make_qr.py
              python make_qr.py https://다른주소/

결과: qr.png (인쇄용 고해상도), qr.svg (벡터, 크기를 키워도 깨지지 않음)
"""
import sys  # 명령줄에서 받은 주소 읽기
from pathlib import Path

import segno  # QR 코드 만드는 라이브러리 (pip install segno)

ROOT = Path(__file__).resolve().parent  # 저장할 폴더 = 이 저장소 맨 위

URL = "https://jklee040515.github.io/cals200/"  # GitHub Pages 로 공개한 앱 주소


def main():
    # 주소를 따로 주면 그 주소로, 아니면 기본 주소로
    url = sys.argv[1] if len(sys.argv) > 1 else URL
    out = ROOT
    # 오류 정정 Q: 일부가 가려지거나 더러워져도 25% 정도까지 읽힘
    # micro=False: 휴대전화 카메라가 모두 읽는 일반 QR 로 (마이크로 QR 은 안 읽히는 앱이 있음)
    qr = segno.make(url, error="q", micro=False)
    # scale = 한 점(모듈)을 몇 픽셀로 그릴지
    qr.save(out / "qr.png", scale=40, border=4)  # 가장자리 흰 여백 4칸은 표준 권장값
    qr.save(out / "qr.svg", scale=10, border=4)
    print(f"{url}\n→ {out / 'qr.png'}, {out / 'qr.svg'} (버전 {qr.version}, 오류 정정 {qr.error})")


if __name__ == "__main__":
    main()
