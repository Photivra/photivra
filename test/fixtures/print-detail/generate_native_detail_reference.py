# SPDX-License-Identifier: Apache-2.0
"""Independent high-precision truth for the owned angular grating capture.
No engine imports or observed samples. Reuse the independently derived SI flat
band photoelectron reference; derive spatial means by Decimal Taylor cosine.
"""
from decimal import Decimal as D, localcontext
from pathlib import Path
import json
root=Path(__file__).parent
with localcontext() as ctx:
    ctx.prec=80
    pi=D('3.1415926535897932384626433832795028841971693993751058209749445923078164062862089986')
    def cos(x):
        x=(x+pi)%(2*pi)-pi
        term=total=D(1)
        for k in range(1,180):
            term *= -x*x/D((2*k-1)*(2*k)); total+=term
        return total
    cases=[]
    for axis in ['x','y']:
        extent=D(36 if axis=='x' else 24); width=D('.8' if axis=='x' else '.6')
        for phase in [D(0),D('.37')]:
            for count in [1,2,4,8]:
                scales=[]
                for y in range(4):
                    for x in range(4):
                        center=(D((x if axis=='x' else y))+D('.5'))*extent/4-extent/2
                        if axis=='y': center=-center
                        scales.append(float(1+D('.5')*sum(cos(2*pi*(center+width*((D(j)+D('.5'))/count-D('.5')))/extent+phase) for j in range(count))/count))
                transfer=sum(cos(2*pi*width*((D(j)+D('.5'))/count-D('.5'))/extent) for j in range(count))/count
                cases.append(dict(axis=axis,phaseRadians=float(phase),spatialSampleCount=count,scales=scales,expectedModulation=float(D('.5')*transfer),continuousModulation=float(D('.5')*cos(pi/2-pi*width/extent)/(pi*width/extent)),maximumContinuousModulationError=float(D('.5')*(2*pi*width/extent)**2/(24*count*count))))
record=dict(version='0.1.0',ownership='photivra-owned',backend='simulateEnvironmentSensorRawFrame',nativeRaster=[4,4],source='declared angular neutral sinusoid; point optics; 540–560 nm; no private renderer or device calibration',cases=cases)
root.joinpath('native-detail-reference.json').write_text(json.dumps(record,indent=2)+'\n')
