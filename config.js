// Public configuration. Never put a secret or GAS shared secret here.
window.BADMINTON_CONFIG = {
  gatewayUrl: 'https://badminton-gateway.oudehinken53-3cc.workers.dev',
  // Sample data without persistence. Must stay false in every published build.
  // Public half of the key pair for notifications. The private half is a Worker secret.
  vapidPublicKey: 'BGtwnU1UbJIaMStJ-7AAeheafqe0QqVUurxqe4UM7MW-scZCkWB1OBYnwuxwH0JMK3DWwOoFXy9rHvbv51LtgIg',
  demoMode: false
};
