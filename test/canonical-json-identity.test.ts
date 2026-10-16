import { expect, it } from "vitest";
import { createPhotographicExportPair, parseSimulatedCapture } from "../src/index.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";

it("preserves the historical paired-export identity and complete file bytes", async () => {
  const input = loadPhotographicExportInput();
  // Replay the historical capture version rather than stamp a newly created capture.
  input.reconstruction.rawFrame = { ...input.reconstruction.rawFrame,
    capture: parseSimulatedCapture({ ...input.reconstruction.rawFrame.capture, engineApiVersion: "0.106.0" }) };
  const pair = await createPhotographicExportPair(input);
  const identities = { simulationHash: pair.simulationHash, rawDataUniqueId: pair.rawDataUniqueId,
    dngSha256: pair.dng.sha256, jpegSha256: pair.jpeg.sha256 };
  // Captured from main 412da46 before the serializer consolidation; re-pinned for 2.0 pipeline 0.2.0 (new RAW sample
  // readout fields and highlight mode enter SimulationHash; DNG 1.4 tags, AsShotNeutral and XMP pipeline versions change
  // the file bytes). RawDataUniqueID is unchanged because the RAW codes are unchanged.
  expect(identities).toEqual({"simulationHash":"9861e862dc45ed79db0a3044750d90bd6b6667e4e05bffdb5dc8f60b6b427a0a","rawDataUniqueId":"4c801d757c7b186763207e615920bfca","dngSha256":"2d7cbb31d708bff38a1448eb781ec15fb6e6686cf01f96ed8493b5a7996a9678","jpegSha256":"614f0ecb2f6842b905c296230ff9bae853953500c24a2b40d011a61ef2946e2e"});
});
