(function () {
  const currentScript = document.currentScript;

  const projectId =
    currentScript.getAttribute("data-project-id") || "demo_project";

  const TRACK_ENDPOINT = "/track";

  const startTime = Date.now();

  let exitEventSent = false;
  let maxScroll = 0;
  let recentClicks = [];

  const funnelSteps = {
    page_view: "visit",
    add_to_cart: "add_to_cart",
    checkout: "checkout",
    purchase: "purchase",
    contact: "contact"
  };

  function getTimeSpent() {
    return Math.round((Date.now() - startTime) / 1000);
  }

  function getPageMetrics() {
    return {
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,

      page_width: document.documentElement.scrollWidth,
      page_height: document.documentElement.scrollHeight,

      scroll_x: window.scrollX,
      scroll_y: window.scrollY
    };
  }

  function sendEvent(eventData) {
    fetch(TRACK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(eventData)
    }).catch((error) => {
      console.log("Tracking error:", error);
    });
  }

  function sendBeaconEvent(eventData) {
    const blob = new Blob([JSON.stringify(eventData)], {
      type: "application/json"
    });

    navigator.sendBeacon(TRACK_ENDPOINT, blob);
  }

  function baseEvent(eventType, extra = {}) {
    return {
      project_id: projectId,

      event_type: eventType,

      page_url: window.location.href,

      element_text: extra.element_text || null,

      time_spent: extra.time_spent || null,

      user_agent: navigator.userAgent,

      screen_width: window.innerWidth,
      screen_height: window.innerHeight,

      click_x: extra.click_x || null,
      click_y: extra.click_y || null,

      page_x: extra.page_x || null,
      page_y: extra.page_y || null,

      viewport_width: extra.viewport_width || window.innerWidth,
      viewport_height: extra.viewport_height || window.innerHeight,

      page_width:
        extra.page_width || document.documentElement.scrollWidth,

      page_height:
        extra.page_height || document.documentElement.scrollHeight,

      scroll_x: extra.scroll_x || window.scrollX,
      scroll_y: extra.scroll_y || window.scrollY,

      scroll_depth: extra.scroll_depth || maxScroll,

      funnel_step: extra.funnel_step || null,

      alert_type: extra.alert_type || null,
      alert_message: extra.alert_message || null
    };
  }

  function detectRageClick(clickText) {
    const now = Date.now();

    recentClicks.push({
      text: clickText,
      time: now
    });

    recentClicks = recentClicks.filter(
      (click) => now - click.time < 3000
    );

    const sameClicks = recentClicks.filter(
      (click) => click.text === clickText
    );

    return sameClicks.length >= 3;
  }

  function isClickableElement(target) {
    return (
      target.tagName === "BUTTON" ||
      target.tagName === "A" ||
      target.closest("button") ||
      target.closest("a") ||
      target.onclick
    );
  }

  function detectFunnelStep(text, url) {
    const lowerText = text.toLowerCase();
    const lowerUrl = url.toLowerCase();

    if (
      lowerText.includes("أضف") ||
      lowerText.includes("السلة") ||
      lowerText.includes("add to cart") ||
      lowerUrl.includes("cart")
    ) {
      return funnelSteps.add_to_cart;
    }

    if (
      lowerText.includes("اشتر") ||
      lowerText.includes("checkout") ||
      lowerText.includes("دفع") ||
      lowerUrl.includes("checkout")
    ) {
      return funnelSteps.checkout;
    }

    if (
      lowerText.includes("تواصل") ||
      lowerText.includes("contact") ||
      lowerUrl.includes("contact")
    ) {
      return funnelSteps.contact;
    }

    if (
      lowerText.includes("تم الشراء") ||
      lowerText.includes("purchase") ||
      lowerText.includes("success") ||
      lowerUrl.includes("success") ||
      lowerUrl.includes("thank")
    ) {
      return funnelSteps.purchase;
    }

    return null;
  }

  function sendSmartAlert(type, message) {
    sendEvent(
      baseEvent("smart_alert", {
        alert_type: type,
        alert_message: message,
        element_text: message
      })
    );
  }

  sendEvent(
    baseEvent("page_view", {
      funnel_step: funnelSteps.page_view
    })
  );

  window.addEventListener("scroll", function () {
    const scrollTop = window.scrollY;

    const documentHeight =
      document.documentElement.scrollHeight -
      window.innerHeight;

    if (documentHeight > 0) {
      const scrollPercent = Math.round(
        (scrollTop / documentHeight) * 100
      );

      maxScroll = Math.max(maxScroll, scrollPercent);
    }
  });

  document.addEventListener("click", function (event) {
    const target = event.target;

    const text =
      target.innerText ||
      target.value ||
      target.getAttribute("aria-label") ||
      target.tagName;

    const cleanText = text.substring(0, 100);

    const metrics = getPageMetrics();

    const clickX = event.clientX;
    const clickY = event.clientY;

    const pageX = event.pageX;
    const pageY = event.pageY;

    const funnelStep = detectFunnelStep(
      cleanText,
      window.location.href
    );

    const sharedData = {
      element_text: cleanText,

      click_x: clickX,
      click_y: clickY,

      page_x: pageX,
      page_y: pageY,

      viewport_width: metrics.viewport_width,
      viewport_height: metrics.viewport_height,

      page_width: metrics.page_width,
      page_height: metrics.page_height,

      scroll_x: metrics.scroll_x,
      scroll_y: metrics.scroll_y,

      funnel_step: funnelStep
    };

    sendEvent(baseEvent("click", sharedData));

    sendEvent(baseEvent("heatmap_click", sharedData));

    if (funnelStep) {
      sendEvent(
        baseEvent("funnel_step", sharedData)
      );
    }

    if (!isClickableElement(target)) {
      sendEvent(
        baseEvent("dead_click", sharedData)
      );

      sendSmartAlert(
        "dead_click",
        `المستخدم ضغط على عنصر غير تفاعلي: ${cleanText}`
      );
    }

    if (detectRageClick(cleanText)) {
      sendEvent(
        baseEvent("rage_click", sharedData)
      );

      sendSmartAlert(
        "rage_click",
        `نقرات متكررة بسرعة على العنصر: ${cleanText}`
      );
    }
  });

  function sendAISummarySignal() {
    const timeSpent = getTimeSpent();

    let summarySignal = "";

    if (timeSpent < 10) {
      summarySignal =
        "المستخدم غادر بسرعة. قد تكون الصفحة غير واضحة أو غير جذابة.";
    } else if (timeSpent > 60 && maxScroll < 30) {
      summarySignal =
        "المستخدم بقي طويلًا لكنه لم يتفاعل كثيرًا. قد تكون الصفحة مربكة.";
    } else if (maxScroll > 80) {
      summarySignal =
        "المستخدم قرأ معظم الصفحة. يوجد اهتمام بالمحتوى.";
    } else {
      summarySignal =
        "سلوك المستخدم متوسط ويحتاج تحليل إضافي.";
    }

    sendBeaconEvent(
      baseEvent("ai_summary_signal", {
        time_spent: timeSpent,
        scroll_depth: maxScroll,
        element_text: summarySignal
      })
    );
  }

  function sendExitEvent() {
    if (exitEventSent) return;

    exitEventSent = true;

    sendAISummarySignal();

    sendBeaconEvent(
      baseEvent("page_exit", {
        time_spent: getTimeSpent(),
        scroll_depth: maxScroll,
        element_text: `Max scroll: ${maxScroll}%`
      })
    );

    if (getTimeSpent() < 5) {
      sendBeaconEvent(
        baseEvent("smart_alert", {
          alert_type: "quick_exit",
          alert_message:
            "المستخدم غادر الصفحة خلال وقت قصير جدًا.",
          element_text: "Quick exit detected"
        })
      );
    }
  }

  document.addEventListener(
    "visibilitychange",
    function () {
      if (document.visibilityState === "hidden") {
        sendExitEvent();
      }
    }
  );

  window.addEventListener("pagehide", function () {
    sendExitEvent();
  });

  window.addEventListener("beforeunload", function () {
    sendExitEvent();
  });
})();