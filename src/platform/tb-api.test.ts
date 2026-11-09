import { describe, expect, it } from 'vitest';
import { createFakeMessenger } from '../../tests/fakes/fake-messenger';
import { createTbApi } from './tb-api';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('keeping the display script registered', () => {
  it('registers the display script when the background starts', async () => {
    const mail = createFakeMessenger();

    createTbApi(mail.messenger).keepDisplayScriptRegistered({ js: ['display.js'] });
    await settle();

    expect(mail.registeredDisplayScripts()).toEqual([{ id: 'qr-scanner-display', js: ['display.js'] }]);
  });

  it('registers it again after Thunderbird restarts', async () => {
    const mail = createFakeMessenger();
    createTbApi(mail.messenger).keepDisplayScriptRegistered({ js: ['display.js'] });
    await settle();

    mail.restartThunderbird();
    await settle();

    expect(mail.registeredDisplayScripts()).toEqual([{ id: 'qr-scanner-display', js: ['display.js'] }]);
  });

  it('registers once when the startup event and the top-level registration overlap', async () => {
    const mail = createFakeMessenger();
    const errors: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { errors.push(args); };

    createTbApi(mail.messenger).keepDisplayScriptRegistered({ js: ['display.js'] });
    mail.restartThunderbird();
    await settle();
    console.error = originalError;

    expect(mail.registeredDisplayScripts()).toHaveLength(1);
    expect(errors).toEqual([]);
  });
});
