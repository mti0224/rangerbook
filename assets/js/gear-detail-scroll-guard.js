(() => {
  const pathIsDetail = /^(?:\/rangerbook)?\/gear\/[^/]+\/?$/.test(window.location.pathname);
  const queryIsDetail = new URLSearchParams(window.location.search).has("detail");
  if (!pathIsDetail && !queryIsDetail) return;

  const originalScrollTo = window.scrollTo.bind(window);
  let initialTopScrollHandled = false;

  window.scrollTo = (...args) => {
    const first = args[0];
    const top = typeof first === "object" && first !== null ? first.top : first;

    if (top === 0) {
      if (initialTopScrollHandled) return;
      initialTopScrollHandled = true;
    }

    originalScrollTo(...args);
  };
})();
