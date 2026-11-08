import { defaultTbApi } from '../platform/tb-api';

defaultTbApi().connectScanPort().onEvent(event => console.debug('scan event', event));
