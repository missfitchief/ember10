import { hostedRead } from '../apps/api/hosted.js';

// This deployment has no signer, financial worker, operator routes, or local database.
export default {
  fetch(request: Request) { return hostedRead(request); }
};
