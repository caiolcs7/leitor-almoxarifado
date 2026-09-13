/** Activate only after the operator requests an update and local writes finish. */
export async function activateWaitingUpdate(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const waiting = registration?.waiting;
  if (waiting) {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener(
          'controllerchange',
          changed,
        );
      };
      const changed = () => {
        cleanup();
        resolve();
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            'A atualização demorou mais que o esperado. Tente novamente. Seus dados continuam salvos.',
          ),
        );
      }, 15000);
      navigator.serviceWorker.addEventListener('controllerchange', changed);
      waiting.postMessage({ type: 'SKIP_WAITING' });
    });
  }
  // Preserve the current hash route. Do not depend on Workbox's isUpdate flag:
  // an update from another tab can be classified as an external installation.
  window.location.reload();
}
