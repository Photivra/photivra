# facade/simulate-display-view.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## PreparedDisplayView

2.7: a display-view request resolved once (`prepareDisplayView`). `render(view)` gives the same result as
`simulateDisplayView(options, view)` for the prepared options, byte for byte (samples, view, exposure, scene, diagnostics
and assumptions; only `diagnostics.timingsMs` differ, and they cover the render only), without repeating the request's
setup: use it to render one view in many regions, for example on each worker of a progressive display.

```ts
export interface PreparedDisplayView {
  /** Renders a view of the prepared request. Renders may run concurrently; they share no state except read-only setup. */
  render(view: SimulateDisplayViewOptions, renderOptions?: PreparedDisplayViewRenderOptions): Promise<DisplayViewResult>;
}
```

## PreparedDisplayViewRenderOptions

Options of one {@link PreparedDisplayView} render.

```ts
export interface PreparedDisplayViewRenderOptions {
  /** Aborting cancels this render only; the promise rejects with a domain error. The request's own `signal` applies to preparing only. */
  signal?: AbortSignal;
}
```

## prepareDisplayView

2.7 (#387): resolves a {@link simulateDisplayView} request once, without a view, and returns a handle whose `render(view)`
renders its views. The setup it does once (request validation, the camera, lens, scene, chart and illuminant, the channel
responses through the environment chain, the diffraction kernels, readout moments, demosaic tables and colour matrix) costs
about 0.3–1.3 s per call on a 24 MP request; a region costs only its own pixels. Errors in the request are raised here;
errors in the view by `render`.

```ts
export async function prepareDisplayView(options: SimulateCaptureOptions): Promise<PreparedDisplayView>;
```

This call is asynchronous; byte hashing uses the caller runtime's Web Crypto.

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
