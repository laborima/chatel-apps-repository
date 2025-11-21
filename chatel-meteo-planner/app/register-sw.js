// Enregistrement du service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Désactiver le Service Worker en local pour éviter les problèmes de cache
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.log('Environnement de développement détecté : Désenregistrement des Service Workers...');
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          registration.unregister();
          console.log('Service Worker désenregistré');
        }
      });
      return; // Ne pas enregistrer en local
    }

    navigator.serviceWorker.register('/chatel-apps-repository/sw.js')
      .then((registration) => {
        console.log('SW enregistré: ', registration);
      })
      .catch((registrationError) => {
        console.log('Échec de l\'enregistrement SW: ', registrationError);
      });
  });
}
