// Public configuration. Never put a secret or GAS shared secret here.
// Change these placeholders before deploying the pilot.
window.BADMINTON_CONFIG = {
  googleClientId: 'REPLACE_WITH_GOOGLE_OAUTH_WEB_CLIENT_ID',
  gatewayUrl: 'https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev',
  // Sample data without persistence. Must stay false in every published build.
  demoMode: false
};
