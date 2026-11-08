import { connectScanPort } from '../platform/tb-api';

const port = connectScanPort();
console.debug('scan port connected', port.name);
