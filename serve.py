"""เปิดโปรแกรม Management Report ในเครื่อง
ใช้: python serve.py [--port 8852] [--sample "<โฟลเดอร์ไฟล์ดิบของเดือน>"]
--sample ทำให้ปุ่ม "โหลดจากโฟลเดอร์ตัวอย่าง" ในโปรแกรมอ่านไฟล์จากโฟลเดอร์นั้นได้ (ไฟล์ดิบไม่ถูกคัดลอกเข้ามาในโปรแกรม)
"""
import argparse, json, os, sys, urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, default=8852)
ap.add_argument("--sample", default="")
ap.add_argument("--out", default="")  # ใช้ทดสอบ: รับไฟล์ที่หน้าเว็บสร้างมาเก็บในโฟลเดอร์นี้
args = ap.parse_args()
ROOT = os.path.dirname(os.path.abspath(__file__))
SAMPLE = os.path.abspath(args.sample) if args.sample else ""


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = urllib.parse.unquote(urllib.parse.urlparse(self.path).path)
        if path.startswith("/sample/"):
            if not SAMPLE or not os.path.isdir(SAMPLE):
                return self.send_error(404)
            name = path[len("/sample/"):]
            if name == "index.json":
                files = [f for f in sorted(os.listdir(SAMPLE)) if os.path.isfile(os.path.join(SAMPLE, f))]
                for d in sorted(os.listdir(SAMPLE)):  # โฟลเดอร์รายเดือน 1 ชั้น (ไม่ลงไปถึง Final / Report)
                    sub = os.path.join(SAMPLE, d)
                    if os.path.isdir(sub):
                        files += [d + "/" + f for f in sorted(os.listdir(sub)) if os.path.isfile(os.path.join(sub, f))]
                        # โฟลเดอร์ย่อย 1 ชั้น: Report ของสำนักงาน และไฟล์ที่ลูกค้าส่ง (AC ...) ไม่รวมชุด Final / New folder ของงานเก่า
                        for d2 in sorted(os.listdir(sub)):
                            s2 = os.path.join(sub, d2)
                            if os.path.isdir(s2) and (d2 == "Report" or d2.upper().startswith("AC")):
                                files += [d + "/" + d2 + "/" + f for f in sorted(os.listdir(s2)) if os.path.isfile(os.path.join(s2, f))]
                files = [f for f in files if not os.path.basename(f).startswith("~$")]  # ไฟล์ล็อกของ Excel ที่เปิดค้างอยู่
                body = json.dumps({"folder": SAMPLE, "files": files}, ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                return self.wfile.write(body)
            full = os.path.abspath(os.path.join(SAMPLE, name))
            if os.path.commonpath([full, SAMPLE]) != SAMPLE or not os.path.isfile(full):
                return self.send_error(404)
            try:
                with open(full, "rb") as f:
                    body = f.read()
            except OSError:
                return self.send_error(423)
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)
        return super().do_GET()

    def do_PUT(self):
        if not args.out or not self.path.startswith("/out/"):
            return self.send_error(404)
        name = os.path.basename(urllib.parse.unquote(self.path[5:])) or "out.bin"
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        with open(os.path.join(os.path.abspath(args.out), name), "wb") as f:
            f.write(body)
        self.send_response(204)
        self.end_headers()

    def log_message(self, *a):
        pass


print(f"Management Report: http://localhost:{args.port}  sample={SAMPLE or '-'}", flush=True)
ThreadingHTTPServer(("127.0.0.1", args.port), H).serve_forever()
