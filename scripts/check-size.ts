import { stat } from 'node:fs/promises';
import pkg from '../package.json' with { type: 'json' };

const BUDGET_BYTES = 6 * 1024 * 1024;
const xpi = `dist/qr-scanner-${pkg.version}.xpi`;

const { size } = await stat(xpi);
const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);
console.log(`${xpi}: ${mb(size)} MB (budget ${mb(BUDGET_BYTES)} MB)`);
if (size > BUDGET_BYTES) console.warn(`warning: ${xpi} exceeds the size budget`);
