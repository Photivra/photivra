# SPDX-License-Identifier: Apache-2.0
"""Read-only independent PDF stream/physical-layout inspection with pypdf.

Does not import the generator or engine. Checks actual PDF graphics state and
decoded DCT streams against source manifests and independently derived units.
"""
from fractions import Fraction as F
from pathlib import Path
import hashlib
import json
import pypdf
from pypdf.generic import ContentStream

root=Path(__file__).resolve().parents[3]
record=json.loads(Path(__file__).with_name("proof-layout-reference.json").read_text())
pdf=root / record["pdfPath"]
assert hashlib.sha256(pdf.read_bytes()).hexdigest()==record["pdfSha256"]
manifest_bytes=(Path(__file__).with_name("jpeg") / "export-manifest.json").read_bytes()
assert hashlib.sha256(manifest_bytes).hexdigest()==record["sourceManifestSha256"]
sources={v["name"]:v for v in json.loads(manifest_bytes)["cases"]}
reader=pypdf.PdfReader(pdf)
assert len(reader.pages)==2

def multiply(a,b):
    return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
        a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
        a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]

def near(actual,expected):
    # ReportLab decimal operator serialization; tolerance is 0.0001 point,
    # under 0.04 micrometer, not a physical print/device tolerance.
    assert abs(float(actual)-float(expected))<.0001,(actual,expected)

verified=[]
for index,page in enumerate(reader.pages):
    near(page.mediabox.width,F(210)*F(360,127))
    near(page.mediabox.height,F(297)*F(360,127))
    for font in page['/Resources']['/Font'].values():
        font=font.get_object()
        descriptor=font.get('/FontDescriptor')
        if descriptor:
            descriptor=descriptor.get_object()
            assert not any(k in descriptor for k in ['/FontFile','/FontFile2','/FontFile3'])
    matrix=[1,0,0,1,0,0]
    clip=None
    rectangle=None
    stack=[]
    actual=[]
    lines=[]
    line_start=None
    for args,operator in ContentStream(page.get_contents(),reader).operations:
        if operator==b'q':stack.append((matrix[:],clip))
        elif operator==b'Q':matrix,clip=stack.pop()
        elif operator==b'cm':matrix=multiply(matrix,[float(x) for x in args])
        elif operator==b're':rectangle=[float(x) for x in args]
        elif operator in (b'W',b'W*'):clip=rectangle
        elif operator==b'm':line_start=[float(x) for x in args]
        elif operator==b'l' and line_start is not None:lines.append((line_start,[float(x) for x in args]))
        elif operator==b'Do':
            image=page['/Resources']['/XObject'][args[0]].get_object()
            assert image['/Subtype']=='/Image'
            assert not image.get('/Interpolate',False)
            assert image['/ColorSpace']=='/DeviceRGB'
            assert '/DCTDecode' in image['/Filter']
            actual.append((matrix[:],clip,image))
    # The actual content stream must include the nominal 100 mm ruler.
    ruler=[(a,b) for a,b in lines if abs(a[1]-b[1])<.0001 and abs((b[0]-a[0])-float(F(100)*F(360,127)))<.0001]
    assert len(ruler)==1
    declared=[v for v in record['placements'] if v['page']==index+1]
    assert len(actual)==len(declared)==2
    for (matrix,clip,image),placement in zip(actual,declared):
        source=sources[placement['sourceName']]
        assert source['captureId']==placement['captureId']
        assert source['roi']==placement['roi']
        assert source['engineCandidate']==placement['archivedCreatorVersion']
        jpeg_sha=hashlib.sha256(image.get_data()).hexdigest()
        assert jpeg_sha==source['jpegSha256']==placement['jpegSha256']
        pw,ph=source['raster']['pixelWidth'],source['raster']['pixelHeight']
        assert (image['/Width'],image['/Height'])==(pw,ph)
        full_width=F(str(placement['fullWidthInches']))*72
        pitch=full_width/pw
        roi=source['roi']
        x,y=[F(str(v))*F(360,127) for v in placement['cropOriginMm']]
        expected=[full_width,0,0,pitch*ph,x-pitch*roi['x'],y-pitch*(ph-roi['y']-roi['height'])]
        for a,b in zip(matrix,expected):near(a,b)
        for a,b in zip(clip,[x,y,pitch*roi['width'],pitch*roi['height']]):near(a,b)
        # Map native top-down ROI corners through the actual PDF image matrix.
        lower=[matrix[4]+matrix[0]*roi['x']/pw,
            matrix[5]+matrix[3]*(1-(roi['y']+roi['height'])/ph)]
        upper=[matrix[4]+matrix[0]*(roi['x']+roi['width'])/pw,
            matrix[5]+matrix[3]*(1-roi['y']/ph)]
        for a,b in zip(lower,[x,y]):near(a,b)
        for a,b in zip(upper,[x+pitch*roi['width'],y+pitch*roi['height']]):near(a,b)
        verified.append(dict(page=index+1,sourceName=placement['sourceName'],jpegSha256=jpeg_sha,
            actualImageMatrixPoints=matrix,actualClipPoints=clip,sourceRaster=[pw,ph],
            interpolationRequested=False,printedCropMm=[float(pitch*roi['width']*F(127,360)),float(pitch*roi['height']*F(127,360))]))

# Same-source enlargement and same-scale representation comparison invariants.
assert declared[0]['captureId']==declared[1]['captureId']
assert verified[0]['jpegSha256']==verified[1]['jpegSha256']==verified[2]['jpegSha256']
assert verified[2]['printedCropMm']==verified[3]['printedCropMm']
print(json.dumps(dict(schemaVersion='0.1.0',pypdfVersion=pypdf.__version__,pdfSha256=record['pdfSha256'],
    inspectedPages=2,placements=verified,qualification='actual PDF layout and DCT identity only; actual printer/device/color/perception unqualified'),indent=2))
