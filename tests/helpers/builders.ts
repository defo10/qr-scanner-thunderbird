import { ALL_CODE_FORMATS } from '../../src/features/decode';
import { createWorkerClient, startScanService, type ScanSettings } from '../../src/features/scan-pipeline';
import { createTbApi } from '../../src/platform/tb-api';
import { createFakeMessenger, type FakeAttachment, type FakeMessage } from '../fakes/fake-messenger';
import { createFakeWorkerHost } from '../fakes/fake-worker';
import { fixtureBytes, nodeZxingWasm } from './load-fixture';

export function aMessageWith(...attachments: FakeAttachment[]): FakeMessage {
  return { attachments };
}

export function anImageAttachment(name: string, bytes: Uint8Array, contentType = 'image/png'): FakeAttachment {
  return { name, contentType, bytes };
}

export function aFileAttachment(name: string, contentType: string, bytes = new TextEncoder().encode('not an image')): FakeAttachment {
  return { name, contentType, bytes };
}

export function fixture(name: string): Uint8Array {
  return fixtureBytes(name);
}

/** A PNG signature followed by bytes that are not a valid PNG header. */
export function corruptPng(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new TextEncoder().encode('definitely not IHDR')]);
}

/** A background scan service wired to a fake messenger and an in-process worker. */
export function aRunningScanService(settings: ScanSettings = { formats: ALL_CODE_FORMATS }) {
  const mail = createFakeMessenger();
  const workers = createFakeWorkerHost();
  const worker = createWorkerClient({ spawn: workers.spawn, loadWasm: nodeZxingWasm });
  startScanService({ tb: createTbApi(mail.messenger), worker, settings: () => settings });
  return { mail, workers };
}
