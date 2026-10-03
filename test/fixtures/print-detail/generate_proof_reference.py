# SPDX-License-Identifier: Apache-2.0
"""Owned physical-layout reference; does not import engine calculations.

ReportLab preserves the archived JPEG streams. Fraction supplies exact inch,
millimeter and PDF-point conversions. This is a geometry reference, not a
qualified printer, viewer, paper, source acquisition or perceptual proof.
"""
from fractions import Fraction as F
from pathlib import Path
import hashlib
import json
import reportlab
from io import BytesIO
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

root = Path(__file__).resolve().parents[3]
source_dir = Path(__file__).with_name("jpeg")
manifest_bytes = (source_dir / "export-manifest.json").read_bytes()
manifest = json.loads(manifest_bytes)
cases = {v["name"]: v for v in manifest["cases"]}
pdf = root / "output/pdf/print-proof-reference.pdf"
pdf.parent.mkdir(parents=True, exist_ok=True)
points_per_mm = F(360,127)
width, height = F(210), F(297)
document = canvas.Canvas(str(pdf), pagesize=(float(width*points_per_mm),float(height*points_per_mm)),
    invariant=1, pageCompression=0)
document.setTitle("Photivra immutable crop and physical scale reference")
document.setAuthor("Photivra")
document.setSubject("Owned geometry reference only; substantive human review pending")
placements = []

def text(x,y,value,size=9):
    document.setFont("Helvetica",size)
    document.drawString(float(F(x)*points_per_mm),float(F(y)*points_per_mm),value)

def heading(title):
    text(20,277,title,16)
    text(20,267,"Owned post-encoding reference - human scientific/source review pending",9)

def place(name, full_width_inches, x,y,label):
    source = cases[name]
    jpeg = source_dir / (name+".jpg")
    assert hashlib.sha256(jpeg.read_bytes()).hexdigest()==source["jpegSha256"]
    pw,ph=source["raster"]["pixelWidth"],source["raster"]["pixelHeight"]
    roi=source["roi"]
    full_width=F(full_width_inches)*F(127,5)
    pitch=full_width/pw
    full_height=pitch*ph
    crop_width,crop_height=pitch*roi["width"],pitch*roi["height"]
    x,y=F(x),F(y)
    full_x=x-pitch*roi["x"]
    full_y=y-pitch*(ph-roi["y"]-roi["height"])
    document.saveState()
    clip=document.beginPath()
    clip.rect(float(x*points_per_mm),float(y*points_per_mm),
        float(crop_width*points_per_mm),float(crop_height*points_per_mm))
    document.clipPath(clip,stroke=0,fill=0)
    document.drawImage(ImageReader(BytesIO(jpeg.read_bytes())),float(full_x*points_per_mm),float(full_y*points_per_mm),
        width=float(full_width*points_per_mm),height=float(full_height*points_per_mm))
    document.restoreState()
    text(x,y+crop_height+5,label,10)
    text(x,y-6,f"Retained crop {roi['width']} x {roi['height']} pixels; {float(crop_width):g} x {float(crop_height):g} mm",8)
    placements.append(dict(page=document.getPageNumber(),
        sourceName=name,captureId=source["captureId"],jpegSha256=source["jpegSha256"],
        archivedCreatorVersion=source["engineCandidate"],sourceRaster=source["raster"],roi=roi,
        fullWidthInches=float(F(full_width_inches)),printedFullImageMm=[float(full_width),float(full_height)],
        printedCropMm=[float(crop_width),float(crop_height)],cropOriginMm=[float(x),float(y)],
        fullImageMatrixPoints=[float(full_width*points_per_mm),0,0,float(full_height*points_per_mm),
            float(full_x*points_per_mm),float(full_y*points_per_mm)]))

def footer():
    # Independent physical calibration mark; actual printed length remains a
    # user/device measurement, not something this file can certify.
    document.setLineWidth(.5)
    document.line(float(20*points_per_mm),float(31*points_per_mm),float(120*points_per_mm),float(31*points_per_mm))
    for x in (20,120): document.line(float(x*points_per_mm),float(29*points_per_mm),float(x*points_per_mm),float(33*points_per_mm))
    text(20,23,"100 mm calibration line - actual printed length must be measured",8)
    text(20,15,"Geometry only: no source quality, color/luminance, perception, printer or device qualification.",8)

heading("Same immutable crop, two physical enlargements")
place("landscape-q1",1,25,229,"Full source width 1 inch; same 16 x 8 selected crop")
place("landscape-q1",4,25,142,"Full source width 4 inches; identical JPEG bytes and crop")
text(25,114,"Physical enlargement changes millimeters per source pixel; it creates no new pixels.",9)
text(25,104,"Capture: "+cases["landscape-q1"]["captureId"],8)
text(25,96,"JPEG SHA-256: "+cases["landscape-q1"]["jpegSha256"],7)
footer()
document.showPage()
heading("Same-scale comparison of exact representations")
place("landscape-q1",2,25,191,"JPEG quantizer step 1")
place("landscape-q32",2,111,191,"JPEG quantizer step 32")
text(25,171,"Both representations: same capture, selected crop and physical image scale.",9)
text(25,160,"Quantizer settings do not imply a general quality grade or invisible compression.",9)
text(25,146,"Each image retains its exact archived post-encoding stream; no PDF resampling.",9)
text(25,136,"PDF DeviceRGB is uncalibrated; display/print appearance remains unqualified.",9)
footer()
document.save()

record=dict(schemaVersion="0.1.0",ownership="photivra-owned",humanReview="pending",
    generator="generate_proof_reference.py",reportlabVersion=reportlab.Version,
    sourceManifestSha256=hashlib.sha256(manifest_bytes).hexdigest(),
    pdfPath="output/pdf/print-proof-reference.pdf",pdfSha256=hashlib.sha256(pdf.read_bytes()).hexdigest(),
    pageSizeMm=[210,297],placements=placements,
    qualification="reference geometry and immutable byte/crop identity only; actual print/device/perception unqualified")
Path(__file__).with_name("proof-layout-reference.json").write_text(json.dumps(record,indent=2)+"\n")
