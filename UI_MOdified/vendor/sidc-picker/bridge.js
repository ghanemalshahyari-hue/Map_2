(() => {
  var BRIDGE_LABELS = {
    en: { apply: "Apply Symbol", applied: "Applied ✓", notFound: "No SIDC found", simple: "← Back to simple mode" },
    ar: { apply: "تطبيق الرمز", applied: "تم التطبيق ✓", notFound: "لم يُعثر على SIDC", simple: "← العودة للوضع البسيط" }
  };

  function bridgeLocale() {
    var lang = document.documentElement.getAttribute("lang") || "en";
    return lang === "ar" ? "ar" : "en";
  }

  function bridgeLabels() {
    return BRIDGE_LABELS[bridgeLocale()] || BRIDGE_LABELS.en;
  }

  function extractSidcFromText(text) {
    if (!text || typeof text !== "string") return null;
    var m = text.match(/SIDC[\s:]*([0-9][0-9\-\s]{18,50})/i) ||
            text.match(/([0-9][0-9\-\s]{18,50})/) ||
            text.match(/(\d{20})/);
    if (!m) return null;
    var digits = String(m[1] || m[0]).replace(/\D/g, "");
    if (digits.length < 20) return null;
    return digits.slice(-20);
  }

  function getCurrentSidc() {
    function check(str) {
      if (!str || typeof str !== "string") return null;
      return extractSidcFromText(str) || extractSidcFromText("SIDC " + str);
    }
    var sidc;
    sidc = check(document.body ? document.body.innerText : "");
    if (sidc) return sidc;
    var inputs = document.querySelectorAll("input, textarea");
    for (var i = 0; i < inputs.length; i++) {
      sidc = check(inputs[i].value);
      if (sidc) return sidc;
    }
    var sidcEls = document.querySelectorAll(".sidc-field, [class*='sidc'], [id*='sidc']");
    for (var j = 0; j < sidcEls.length; j++) {
      sidc = check(sidcEls[j].value || sidcEls[j].innerText || sidcEls[j].textContent);
      if (sidc) return sidc;
    }
    var all = document.querySelectorAll("input, textarea, [class*='sidc'], [class*='SIDC'], .v-input, .v-text-field");
    for (var k = 0; k < all.length; k++) {
      var el = all[k];
      var txt = (el.value !== undefined && el.value != null ? String(el.value) : "") || (el.innerText || el.textContent || "");
      if (txt && txt.length > 15) {
        sidc = check(txt);
        if (sidc) return sidc;
      }
    }
    if (document.body) {
      sidc = check(document.body.textContent || document.body.innerText);
      if (sidc) return sidc;
    }
    return null;
  }

  function publishSidc(sidc) {
    var inFrame = window.parent && window.parent !== window;
    if (inFrame) {
      window.parent.postMessage({ type: "sidc-picker:sidc", sidc: String(sidc) }, "*");
    }
    try {
      if (window.parent && typeof window.parent.__APP_SIDC_PICKER_SET === "function") {
        window.parent.__APP_SIDC_PICKER_SET(sidc);
      }
    } catch (_) {
      /* cross-origin: parent can't be called; postMessage above is the only path */
    }
  }

  var bridgeApplyBtn = null;

  function setApplyTextFromLocale(locale) {
    var L = BRIDGE_LABELS[locale === "ar" ? "ar" : "en"];
    var simpleLink = document.getElementById("bridge-simple-link");
    if (simpleLink) simpleLink.textContent = L.simple;
    if (!bridgeApplyBtn || bridgeApplyBtn.disabled) return;
    if (bridgeApplyBtn.textContent === BRIDGE_LABELS.en.applied || bridgeApplyBtn.textContent === BRIDGE_LABELS.ar.applied) return;
    if (bridgeApplyBtn.textContent === BRIDGE_LABELS.en.notFound || bridgeApplyBtn.textContent === BRIDGE_LABELS.ar.notFound) return;
    bridgeApplyBtn.textContent = L.apply;
  }

  function injectApplyButton() {
    if (document.getElementById("bridge-apply-bar")) return;
    var bar = document.createElement("div");
    bar.id = "bridge-apply-bar";
    bar.style.cssText =
      "position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#212F3D;border-top:1px solid rgba(255,255,255,0.2);padding:10px 16px;display:flex;align-items:center;justify-content:center;gap:12px;";
    var btn = document.createElement("button");
    btn.id = "bridge-apply-btn";
    bridgeApplyBtn = btn;
    btn.textContent = bridgeLabels().apply;
    btn.style.cssText =
      "padding:10px 24px;background:#22c55e;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;text-transform:uppercase;letter-spacing:0.08em;";
    btn.onclick = function () {
      var sidc = getCurrentSidc();
      var L = bridgeLabels();
      if (sidc) {
        publishSidc(sidc);
        btn.textContent = L.applied;
        btn.disabled = true;
        setTimeout(function () {
          btn.textContent = L.apply;
          btn.disabled = false;
        }, 1200);
      } else {
        btn.textContent = L.notFound;
        setTimeout(function () {
          btn.textContent = L.apply;
        }, 1500);
      }
    };
    var simpleLink = document.createElement("button");
    simpleLink.id = "bridge-simple-link";
    simpleLink.textContent = bridgeLabels().simple;
    simpleLink.style.cssText =
      "padding:8px 14px;background:transparent;color:#cbd5e1;border:1px solid rgba(148,163,184,0.4);border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;";
    simpleLink.onclick = function () {
      var lang = (document.documentElement.getAttribute("lang") === "ar") ? "ar" : "en";
      try {
        var q = String(location.search || "").match(/lang=([a-z]{2})/i);
        if (q && q[1]) lang = q[1];
      } catch (_) { /* ignore */ }
      location.href = "simple.html?lang=" + lang;
    };
    bar.appendChild(simpleLink);
    bar.appendChild(btn);
    document.body.appendChild(bar);
  }

  function start() {
    window.addEventListener("message", function (event) {
      var d = event.data;
      if (!d || d.type !== "sidc-picker:setLocale") return;
      if (d.locale !== "ar" && d.locale !== "en") return;
      setApplyTextFromLocale(d.locale);
    });

    function tryInject() {
      if (document.body) {
        injectApplyButton();
        return true;
      }
      return false;
    }
    if (!tryInject()) {
      document.addEventListener("DOMContentLoaded", tryInject);
    }
    var root = document.documentElement || document.body;
    if (root) {
      var obs = new MutationObserver(function () {
        if (!document.getElementById("bridge-apply-bar")) tryInject();
      });
      obs.observe(root, { subtree: true, childList: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
