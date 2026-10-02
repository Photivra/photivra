import { expect, it } from "vitest";
import { createPhotographicExportPair } from "../src/index.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";

it("preserves the historical paired-export identity and complete file bytes", async () => {
  const pair = await createPhotographicExportPair(loadPhotographicExportInput());
  const identities = { simulationHash: pair.simulationHash, rawDataUniqueId: pair.rawDataUniqueId,
    dngSha256: pair.dng.sha256, jpegSha256: pair.jpeg.sha256 };
  // Captured from main 412da46 before the serializer consolidation.
  expect(identities).toEqual({"simulationHash":"6ccd9d17e121c11fe9593ced91f8d950ab1778e3d24677faf8f9834b0756beaa","rawDataUniqueId":"4c801d757c7b186763207e615920bfca","dngSha256":"ef94600b042adfad7783104a0d0f754b6b3013bfd060c61381dbb67f876ff5c7","jpegSha256":"b7b9af4cc32b28f2a4693759392ab1cba47560309bab4d47729c6cda53e648c2"});
});
