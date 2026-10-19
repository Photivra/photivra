# facade/simulate-display-view.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## simulateDisplayView

The display view of a capture request: the image the real full-resolution capture (`simulateCapture(options)`) would
give after it is resized to `view.width` × `view.height` by area averaging in linear light, estimated at a cost that
follows the display pixels, not the capture's. Optics (lens diffraction, the anti-aliasing filter, the pixel aperture)
act at the real pixel pitch; the colour mosaic, demosaic and development are those of the real pixels; the noise is
that of the average of the real pixels, demosaic correlation included; exposure, white balance and tone are the
capture's. The result is labelled `kind: "display-view"`; it is not a capture.

```ts
export async function simulateDisplayView(options: SimulateCaptureOptions, view: SimulateDisplayViewOptions): Promise<DisplayViewResult>;
```

This call is asynchronous; byte hashing uses the caller runtime's Web Crypto.
