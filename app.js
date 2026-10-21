/* DTMFusion - MIT (c) 2026 IPUSIRON. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), dictionaries = DTMFMessages;
  let language = 'ja', theme = 'dark';
  try {
    if (localStorage.getItem('dtmfusion.language') === 'en') language = 'en';
    if (localStorage.getItem('dtmfusion.theme') === 'light') theme = 'light';
  } catch (_) { /* Preferences are optional. */ }
  const t = key => dictionaries[language][key] || key;
  function save() {
    try { localStorage.setItem('dtmfusion.language', language); localStorage.setItem('dtmfusion.theme', theme); }
    catch (_) { /* Private browsing may disable storage. */ }
  }
  function translate() {
    document.documentElement.lang = language;
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-label]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.label)); });
    $('language').textContent = language === 'ja' ? 'EN' : '日';
  }
  $('theme').addEventListener('click', () => { theme = theme === 'dark' ? 'light' : 'dark'; translate(); save(); });
  $('language').addEventListener('click', () => { language = language === 'ja' ? 'en' : 'ja'; translate(); save(); });
  $('help').addEventListener('click', () => $('help-dialog').showModal());
  $('close-help').addEventListener('click', () => $('help-dialog').close());
  translate();
}());
