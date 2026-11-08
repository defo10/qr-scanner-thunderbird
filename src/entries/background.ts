import { onScanPortConnected, registerDisplayScript } from '../platform/tb-api';

onScanPortConnected(port => console.debug('scan port', port.sender?.tab?.id));
void registerDisplayScript({ js: ['display.js'] });
