(() => {
  const STYLE_ID = "opinion-topic-helper-style";
  const BADGE_CLASS = "opinion-topic-helper-badge";
  const HEADING_BADGE_CLASS = "opinion-topic-helper-badge--heading";
  const INLINE_BADGE_CLASS = "opinion-topic-helper-badge--inline";

  let enabled = false;
  let domObserver = null;
  let lastLocation = location.href;
  let singleBadge = null;
  let singleHeading = null;
  const multiBadges = new Map();
  let multiFetchToken = 0;
  const multiCache = new Map();
  let badgeCheckInterval = null;
  const topicIdToChildListMap = new Map(); // Сохраняем данные для восстановления

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${BADGE_CLASS} {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 2px 10px;
        font-size: 0.6em;
        font-weight: 600;
        letter-spacing: 0.02em;
        border: 1px solid rgba(33, 196, 130, 0.35);
        color: #21c482;
        background: rgba(33, 196, 130, 0.12);
        white-space: nowrap;
      }
      .${HEADING_BADGE_CLASS} {
        margin-left: 12px;
      }
      .${INLINE_BADGE_CLASS} {
        margin-left: 6px;
      }
    `;
    document.head.appendChild(style);
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function normalize(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function cleanupSingle() {
    if (singleBadge && singleBadge.parentElement) {
      singleBadge.remove();
    }
    if (singleHeading) {
      delete singleHeading.dataset.opinionTopicHelperHasBadge;
    }
    singleBadge = null;
    singleHeading = null;
  }
  function isElementVisible(element) {
    if (!element || !element.isConnected) {
      return false;
    }
    if (element.getClientRects().length === 0) {
      return false;
    }
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function isValidHeading(element) {
    if (!isElementVisible(element)) {
      return false;
    }
    const text = normalize(element.textContent);
    if (!text) {
      return false;
    }
    return true;
  }

  function findSingleHeading() {
    const preferredSelectors = [
      "[data-testid='topic-title']",
      "[data-test='topic-title']",
      "[data-qa='topic-title']",
      "main h1",
      "main h2",
      ".topic-page h1",
      ".topic-page h2",
      ".topic-header h1",
      ".topic-header h2",
      "h1"
    ];

    for (const selector of preferredSelectors) {
      const element = document.querySelector(selector);
      if (isValidHeading(element)) {
        return element;
      }
    }

    const fallback = Array.from(document.querySelectorAll("h1, h2")).find(isValidHeading);
    return fallback ?? null;
  }


  function cleanupMulti() {
    for (const [element, badge] of Array.from(multiBadges.entries())) {
      if (badge.isConnected) {
        badge.remove();
      }
      delete element.dataset.opinionTopicHelperBase;
      multiBadges.delete(element);
    }
    topicIdToChildListMap.clear();
  }

  function cleanupAll() {
    cleanupSingle();
    cleanupMulti();
  }

  function getUrlContext() {
    const url = new URL(location.href);
    const topicId = url.searchParams.get("topicId");
    const type = url.searchParams.get("type");
    return {
      topicId: topicId ? topicId.trim() : null,
      isMulti: type?.toLowerCase() === "multi"
    };
  }

  function isBadgeNode(node) {
    if (!node) {
      return false;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return node.parentElement?.classList?.contains(BADGE_CLASS) ?? false;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node;
      if (element.classList?.contains(BADGE_CLASS)) {
        return true;
      }
      return Boolean(element.closest(`.${BADGE_CLASS}`));
    }
    return false;
  }

  function containsBadgeNode(node) {
    if (!node) {
      return false;
    }
    if (isBadgeNode(node)) {
      return true;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      return Boolean(node.querySelector?.(`.${BADGE_CLASS}`));
    }
    return false;
  }

  function mutationIsRelevant(mutation) {
    if (mutation.type === "characterData") {
      return !isBadgeNode(mutation.target);
    }
    if (mutation.type === "childList") {
      // Проверяем, не были ли удалены наши badge
      for (const node of mutation.removedNodes) {
        if (isBadgeNode(node)) {
          // Если удален наш badge, нужно пересоздать
          return true;
        }
        // Проверяем, не был ли удален элемент, к которому привязан badge
        if (node.nodeType === Node.ELEMENT_NODE) {
          for (const [element] of multiBadges.entries()) {
            if (node === element || node.contains(element)) {
              return true;
            }
          }
        }
      }
      
      for (const node of mutation.addedNodes) {
        if (!containsBadgeNode(node)) {
          return true;
        }
      }
      
      // Игнорируем удаления, если это не наши badge и не наши элементы
      for (const node of mutation.removedNodes) {
        if (!containsBadgeNode(node)) {
          return true;
        }
      }
      return false;
    }
    return true;
  }

  function ensureDomObserver() {
    if (!enabled || domObserver) {
      return;
    }
    domObserver = new MutationObserver((mutations) => {
      if (mutations.some(mutationIsRelevant)) {
        debouncedProcess();
      }
    });
    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });
  }

  function disconnectDomObserver() {
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
  }

  function getOrCreateInlineBadge(element) {
    let badge = multiBadges.get(element);
    if (!badge) {
      badge = document.createElement("span");
      badge.className = `${BADGE_CLASS} ${INLINE_BADGE_CLASS}`;
      badge.dataset.opinionTopicHelperBadge = "true";
      multiBadges.set(element, badge);
      element.appendChild(badge);
    } else if (!badge.isConnected || !element.contains(badge)) {
      // Если badge был удален из DOM или больше не является дочерним элементом, перевставляем его
      if (element.isConnected) {
        element.appendChild(badge);
      }
    }
    return badge;
  }

  function applySingle(topicId) {
    cleanupMulti();
    if (!topicId) {
      cleanupSingle();
      return;
    }

    const heading = findSingleHeading();
    if (!heading) {
      cleanupSingle();
      return;
    }

    if (singleHeading && singleHeading !== heading) {
      cleanupSingle();
    }

    if (!singleBadge) {
      singleBadge = document.createElement("span");
      singleBadge.className = `${BADGE_CLASS} ${HEADING_BADGE_CLASS}`;
    }

    if (singleBadge.parentElement !== heading) {
      singleBadge.remove();
      heading.appendChild(singleBadge);
    }

    singleHeading = heading;
    heading.dataset.opinionTopicHelperHasBadge = "true";
    singleBadge.textContent = `TopicID: ${topicId}`;
  }

  function getCandidateTitleElements() {
    // Ищем элементы, которые еще не имеют badge или имеют badge, но он был удален
    const allElements = Array.from(document.querySelectorAll("p.text-bodyL"));
    return allElements.filter(el => {
      // Проверяем, что элемент видим и подключен к DOM
      if (!el.isConnected || !isElementVisible(el)) {
        return false;
      }
      // Если у элемента уже есть badge в нашей карте, проверяем его состояние
      const existingBadge = multiBadges.get(el);
      if (existingBadge && existingBadge.isConnected && el.contains(existingBadge)) {
        return true; // Элемент уже обработан, но может потребоваться обновление
      }
      return true;
    });
  }

  function findElementForTitle(title) {
    const normalizedTitle = normalize(title);
    const elements = getCandidateTitleElements();
    for (const element of elements) {
      // Получаем текст без badge, если он уже есть
      let liveText = normalize(element.textContent);
      const existingBadge = multiBadges.get(element);
      if (existingBadge && existingBadge.textContent) {
        // Удаляем текст badge из текста элемента для сравнения
        liveText = liveText.replace(normalize(existingBadge.textContent), '').trim();
      }
      
      if (element.dataset.opinionTopicHelperBase !== liveText) {
        element.dataset.opinionTopicHelperBase = liveText;
      }
      if (liveText === normalizedTitle) {
        return element;
      }
    }
    return null;
  }

  async function fetchMultiTopics(topicId, token) {
    if (multiCache.has(topicId)) {
      return multiCache.get(topicId);
    }

    const endpoints = [
      `https://proxy.opinion.trade:8443/api/bsc/api/v2/topic/multi/${topicId}`,
      `https://proxy.opinion.trade:8443/api/bsc/api/v2/topic/mutil/${topicId}`
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { credentials: "include" });
        if (!response.ok) {
          continue;
        }
        const payload = await response.json();
        if (token !== multiFetchToken) {
          return null;
        }
        const childList = payload?.result?.data?.childList;
        if (Array.isArray(childList)) {
          multiCache.set(topicId, childList);
          return childList;
        }
      } catch (error) {
        // ignore and try the next endpoint
      }
    }

    return null;
  }

  function restoreBadgesForMulti() {
    if (!enabled || multiBadges.size === 0) {
      return;
    }

    const { topicId, isMulti } = getUrlContext();
    if (!topicId || !isMulti) {
      return;
    }

    const childList = topicIdToChildListMap.get(topicId);
    if (!childList) {
      return;
    }

    // Проверяем и восстанавливаем badge для всех элементов
    for (const child of childList) {
      if (!child?.title || !child?.topicId) {
        continue;
      }

      const element = findElementForTitle(child.title);
      if (!element || !element.isConnected) {
        continue;
      }

      const badge = multiBadges.get(element);
      if (badge) {
        // Если badge существует, но не подключен к DOM, перевставляем
        if (!badge.isConnected || !element.contains(badge)) {
          if (element.isConnected) {
            element.appendChild(badge);
            badge.textContent = `(topicID: ${child.topicId})`;
          }
        }
      }
    }
  }

  async function applyMulti(topicId) {
    cleanupSingle();
    if (!topicId) {
      cleanupMulti();
      topicIdToChildListMap.delete(topicId);
      return;
    }

    const token = ++multiFetchToken;
    const childList = await fetchMultiTopics(topicId, token);
    if (!childList || token !== multiFetchToken) {
      return;
    }

    // Сохраняем данные для возможного восстановления
    topicIdToChildListMap.set(topicId, childList);

    const matchedElements = new Set();
    const topicIdMap = new Map(); // Сохраняем соответствие element -> topicId

    for (const child of childList) {
      if (!child?.title || !child?.topicId) {
        continue;
      }

      const element = findElementForTitle(child.title);
      if (!element || !element.isConnected) {
        continue;
      }

      matchedElements.add(element);
      topicIdMap.set(element, child.topicId);
      const badge = getOrCreateInlineBadge(element);
      
      // Обновляем badge только если topicId изменился
      const expectedText = `(topicID: ${child.topicId})`;
      if (badge.textContent !== expectedText) {
        badge.textContent = expectedText;
      }
      
      // Убеждаемся, что badge видим и правильно вставлен
      if (badge.style.display === 'none') {
        badge.style.display = '';
      }
      if (!element.contains(badge) && element.isConnected) {
        element.appendChild(badge);
      }
    }

    // Удаляем badge только для элементов, которые больше не соответствуют
    for (const [element, badge] of Array.from(multiBadges.entries())) {
      if (!matchedElements.has(element)) {
        if (badge.isConnected) {
          badge.remove();
        }
        delete element.dataset.opinionTopicHelperBase;
        multiBadges.delete(element);
      } else if (!badge.isConnected || (element.isConnected && !element.contains(badge))) {
        // Если badge был удален или отсоединен, но элемент все еще в списке, перевставляем
        if (element.isConnected) {
          const topicIdValue = topicIdMap.get(element);
          if (topicIdValue) {
            element.appendChild(badge);
            badge.textContent = `(topicID: ${topicIdValue})`;
          }
        }
      }
    }
  }

  async function process() {
    if (!enabled) {
      return;
    }

    ensureStyles();

    const { topicId, isMulti } = getUrlContext();
    if (!topicId) {
      cleanupAll();
      return;
    }

    if (isMulti) {
      await applyMulti(topicId);
    } else {
      applySingle(topicId);
    }
  }

  const debouncedProcess = debounce(process, 150);

  function handleLocationChange() {
    if (lastLocation !== location.href) {
      lastLocation = location.href;
      cleanupAll();
      debouncedProcess();
    }
  }

  function setupLocationObservers() {
    const originalPushState = history.pushState;
    history.pushState = function pushState(...args) {
      originalPushState.apply(this, args);
      window.dispatchEvent(new Event("locationchange"));
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function replaceState(...args) {
      originalReplaceState.apply(this, args);
      window.dispatchEvent(new Event("locationchange"));
    };

    window.addEventListener("popstate", () => window.dispatchEvent(new Event("locationchange")));
    window.addEventListener("locationchange", handleLocationChange);
  }

  function startBadgeCheckInterval() {
    if (badgeCheckInterval) {
      return;
    }
    // Проверяем состояние badge каждые 500ms
    badgeCheckInterval = setInterval(() => {
      if (enabled) {
        restoreBadgesForMulti();
      }
    }, 500);
  }

  function stopBadgeCheckInterval() {
    if (badgeCheckInterval) {
      clearInterval(badgeCheckInterval);
      badgeCheckInterval = null;
    }
  }

  function setEnabled(nextEnabled) {
    if (enabled === nextEnabled) {
      return;
    }
    enabled = nextEnabled;

    if (enabled) {
      ensureStyles();
      ensureDomObserver();
      startBadgeCheckInterval();
      debouncedProcess();
    } else {
      disconnectDomObserver();
      stopBadgeCheckInterval();
      cleanupAll();
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "OPINION_TOPIC_HELPER_TOGGLE") {
      setEnabled(Boolean(message.enabled));
    }
  });

  function requestInitialState() {
    chrome.runtime.sendMessage({ type: "OPINION_TOPIC_HELPER_GET_STATE" }, (response) => {
      const isEnabled = response?.enabled ?? true;
      setEnabled(isEnabled);
    });
  }

  function init() {
    setupLocationObservers();
    ensureDomObserver();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", debouncedProcess);
    } else {
      debouncedProcess();
    }
    requestInitialState();
    startBadgeCheckInterval();
  }

  init();
})();

