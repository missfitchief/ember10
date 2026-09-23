import { writeFile } from 'node:fs/promises';

// Capture public read models only. Never read a signer, private key, or signed payload.
const origin = 'http://127.0.0.1:4311';
const read = async path => {
  const response = await fetch(`${origin}/api/${path}`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Demo API unavailable: ${path}`);
  return response.json();
};
const [status, project, basket, transparency, epochs, epoch] = await Promise.all(
  ['status', 'project', 'basket', 'transparency', 'epochs', 'epochs/demo-epoch-001'].map(read)
);
if (status.mode !== 'demo' || status.broadcastEnabled || epoch.mode !== 'demo' || !epoch.testOnly) {
  throw new Error('Only a non-broadcasting synthetic demo can be captured');
}
const wallets = await Promise.all(epoch.snapshot.owners.map(owner => read(`wallets/${owner.owner}/rewards`)));
const value = {
  schema: 'ember5.hosted-demo.v1', capturedAt: new Date().toISOString(),
  status: { ...status, hostedSnapshot: true, workerActive: false, paused: true,
    waitingReason: 'Recorded synthetic demo. Settlement worker is not running on this host.',
    discovery: null, discoveryStale: true, nextEvaluation: null },
  project: { ...project, buyUrl: null }, basket, transparency, epochs, epoch, wallets
};
const serialized = JSON.stringify(value, null, 2);
if (/"(?:signed_payload|signedPayload|secretKey|JUPITER_API_KEY|SIGNER_TOKEN)"/.test(serialized)) {
  throw new Error('Sensitive field found in public capture');
}
await writeFile('deploy/hosted-demo.json', serialized);
console.log('Recorded public synthetic demo: no signing or worker execution in hosted mode.');
