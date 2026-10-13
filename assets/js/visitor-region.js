/* Country-based defaults. Saved language always wins; payment uses current IP country. */
(() => {
  "use strict";
  if (window.RangerbookVisitor) return;
  const LANGUAGE_KEY = "rangerbook-language";
  const supported = ["zh-Hant", "en", "th", "jp"];
  const aliases = { zh_TW: "zh-Hant", ja: "jp" };
  const PAYPAL_URL = "https://www.paypal.com/ncp/payment/SPHZE8H6CQYXW";
  const ECPAY_URL = "https://payment.ecpay.com.tw/QuickCollect/PayData?Fd%2bEMYTkwnRiExHKdQxQGH9fNPwDXXGr5xI6v5pYOuo%3d";
  const sponsorPage = /(?:^|\/)sponsor(?:\/|$)/.test(location.pathname);

  function readLanguage() {
    let value;
    try { value = localStorage.getItem(LANGUAGE_KEY); } catch (_) {}
    value = aliases[value] || value;
    if (supported.includes(value)) return value;
    try {
      value = decodeURIComponent(document.cookie.split("; ").find(row => row.startsWith(LANGUAGE_KEY + "="))?.split("=")[1] || "");
    } catch (_) { value = ""; }
    value = aliases[value] || value;
    return supported.includes(value) ? value : null;
  }
  function rememberLanguage(value) {
    try { localStorage.setItem(LANGUAGE_KEY, value); } catch (_) {}
    try { document.cookie = LANGUAGE_KEY + "=" + value + "; Path=/; Max-Age=31536000; SameSite=Lax"; } catch (_) {}
  }
  function languageForCountry(country) {
    if (["TW", "HK", "MO"].includes(country)) return "zh-Hant";
    return { TH: "th", JP: "jp" }[country] || "en";
  }
  async function lookupCountry() {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timer;
    const deadline = new Promise(resolve => {
      timer = setTimeout(() => { controller?.abort(); resolve(null); }, 2000);
    });
    const lookup = Promise.resolve().then(() => fetch("https://api.country.is/", {
      cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: controller?.signal
    })).then(response => response.ok ? response.json() : null).then(data => {
      const country = typeof data?.country === "string" ? data.country.toUpperCase() : "";
      return /^[A-Z]{2}$/.test(country) ? country : null;
    }).catch(() => null);
    try { return await Promise.race([lookup, deadline]); }
    finally { clearTimeout(timer); }
  }

  const saved = readLanguage();
  let locale = saved || "en";
  let country = null;
  let countryResolved = false;
  let sponsorObserver = null;
  document.documentElement.lang = locale === "jp" ? "ja" : locale;
  if (!saved || locale !== "zh-Hant") document.documentElement.dataset.rbLocalizing = "true";

  function updateSponsorLinks() {
    const links = document.querySelectorAll("[data-region-sponsor]");
    for (const link of links) {
      if (!countryResolved) {
        link.setAttribute("aria-disabled", "true");
        link.tabIndex = -1;
      } else {
        link.href = country === "TW" ? ECPAY_URL : PAYPAL_URL;
        link.removeAttribute("aria-disabled");
        link.removeAttribute("tabindex");
      }
    }
    if (countryResolved && links.length) sponsorObserver?.disconnect();
  }
  const countryReady = (!saved || sponsorPage ? lookupCountry() : Promise.resolve(null)).then(value => {
    country = value;
    countryResolved = true;
    updateSponsorLinks();
    return country;
  });
  const ready = saved ? Promise.resolve(locale) : countryReady.then(value => {
    // A setting saved in another tab while lookup was pending also takes priority.
    const existing = readLanguage();
    locale = existing || languageForCountry(value);
    if (!existing) rememberLanguage(locale);
    document.documentElement.lang = locale === "jp" ? "ja" : locale;
    return locale;
  });
  window.RangerbookVisitor = {
    ready, countryReady, hasSavedLanguage: Boolean(saved),
    get locale() { return locale; }, get country() { return country; }
  };

  if (sponsorPage) {
    const style = document.createElement("style");
    style.textContent = '[data-region-sponsor][aria-disabled="true"]{pointer-events:none;opacity:.6}';
    document.head.append(style);
    sponsorObserver = new MutationObserver(updateSponsorLinks);
    sponsorObserver.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", updateSponsorLinks, { once: true });
    document.addEventListener("click", event => {
      if (!countryResolved && event.target.closest?.("[data-region-sponsor]")) event.preventDefault();
    }, true);
    updateSponsorLinks();
  }
})();
