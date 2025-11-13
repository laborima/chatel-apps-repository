// Enregistrement du service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/chatel-apps-repository/sw.js')
      .then((registration) => {
        console.log('SW enregistré: ', registration);
      })
      .catch((registrationError) => {
        console.log('Échec de l\'enregistrement SW: ', registrationError);
      });
  });
}
