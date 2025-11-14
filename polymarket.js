const API_ENDPOINT = "https://gamma-api.polymarket.com/events/slug/";

const slugForm = document.getElementById("slugForm");
const slugInput = document.getElementById("slugInput");
const statusBox = document.getElementById("status");
const resultsRoot = document.getElementById("app");

function setStatus(message, type = "info") {
  statusBox.textContent = message ?? "";
  statusBox.dataset.type = type;
}

function clearResults() {
  resultsRoot.replaceChildren();
}

function parseClobTokenIds(rawValue) {
  if (!rawValue) {
    return [];
  }

  if (Array.isArray(rawValue)) {
    return rawValue.filter((item) => typeof item === "string" && item.trim().length > 0);
  }

  if (typeof rawValue === "string") {
    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === "string" && item.trim().length > 0);
      }
    } catch (_error) {
      // ignore and try treating it as a single value
      if (rawValue.trim().length > 0) {
        return [rawValue.trim()];
      }
    }
  }

  return [];
}

function parseOutcomes(rawValue) {
  if (!rawValue) {
    return [];
  }

  if (Array.isArray(rawValue)) {
    return rawValue
      .map((item) => (typeof item === "string" ? item.trim() : item))
      .filter((item) => typeof item === "string" && item.length > 0);
  }

  if (typeof rawValue === "string") {
    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === "string" ? item.trim() : item))
          .filter((item) => typeof item === "string" && item.length > 0);
      }
    } catch (_error) {
      if (rawValue.trim().length > 0) {
        return [rawValue.trim()];
      }
    }
  }

  return [];
}

function updateLocation(slug) {
  const url = new URL(window.location.href);
  if (slug) {
    url.searchParams.set("slug", slug);
  } else {
    url.searchParams.delete("slug");
  }
  history.replaceState({}, "", url.toString());
}

function createTokenPill({ tokenId, outcome }) {
  const li = document.createElement("li");
  li.className = "token-pill";

  const header = document.createElement("div");
  header.className = "token-pill-header";

  const outcomeSpan = document.createElement("span");
  outcomeSpan.className = "token-pill-outcome";
  const normalizedOutcome = outcome?.toLowerCase().trim();
  outcomeSpan.dataset.variant = normalizedOutcome === "no" ? "no" : "default";
  outcomeSpan.textContent = outcome || "Outcome";

  const span = document.createElement("span");
  span.className = "token-pill-value";
  const tokenValue = typeof tokenId === "string" ? tokenId.trim() : "";
  span.textContent = tokenValue || "-";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Copy";
  if (!tokenValue) {
    button.disabled = true;
    button.textContent = "No ID";
  } else {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(tokenValue);
        button.textContent = "Copied!";
        setTimeout(() => {
          button.textContent = "Copy";
        }, 1400);
      } catch (_error) {
        button.textContent = "Error";
        setTimeout(() => {
          button.textContent = "Copy";
        }, 1400);
      }
    });
  }

  header.append(outcomeSpan, button);
  li.append(header, span);
  return li;
}

function renderMarket(market) {
  const card = document.createElement("article");
  card.className = "market-card";

  const title = document.createElement("h3");
  title.className = "market-title";
  title.textContent = market.groupItemTitle || market.question || "Untitled";

  const tokens = parseClobTokenIds(market.clobTokenIds);
  const outcomes = parseOutcomes(market.outcomes);

  if (!tokens.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No tokens found.";
    card.append(title, tokensTitle, empty);
    return card;
  }

  const list = document.createElement("ul");
  list.className = "tokens-list";
  tokens.forEach((tokenId, index) => {
    const outcome = outcomes[index] ?? null;
    list.appendChild(createTokenPill({ tokenId, outcome }));
  });

  const extraOutcomes = outcomes.length - tokens.length;

  card.append(title, list);

  if (extraOutcomes > 0) {
    const warning = document.createElement("p");
    warning.className = "empty";
    warning.textContent = `Warning: outcomes (${outcomes.length}) exceed clobTokenIds (${tokens.length}). Check the event data.`;
    card.appendChild(warning);
  }

  return card;
}

function renderResults(eventData, slug) {
  clearResults();

  const header = document.createElement("section");
  header.className = "event-header";

  const h2 = document.createElement("h2");
  h2.textContent = eventData.title || slug;

  const meta = document.createElement("span");
  meta.className = "event-meta";
  meta.textContent = `Slug: ${slug}`;

  header.append(h2, meta);
  resultsRoot.appendChild(header);

  const markets = Array.isArray(eventData.markets) ? eventData.markets : [];

  if (!markets.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No markets found.";
    resultsRoot.appendChild(empty);
    return;
  }

  for (const market of markets) {
    resultsRoot.appendChild(renderMarket(market));
  }
}

async function fetchEvent(slug) {
  const response = await fetch(`${API_ENDPOINT}${encodeURIComponent(slug)}`, {
    credentials: "omit",
    cache: "no-cache"
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `API returned status ${response.status} ${response.statusText || ""} ${text}`.trim()
    );
  }

  return response.json();
}

async function loadSlug(slug) {
  const trimmed = slug.trim();
  updateLocation(trimmed);

  if (!trimmed) {
    setStatus("Enter an event slug to fetch token IDs.");
    clearResults();
    return;
  }

  setStatus("Loading Polymarket data...");
  clearResults();

  try {
    const rawData = await fetchEvent(trimmed);
    const eventData = rawData?.event ?? rawData;

    if (!eventData || typeof eventData !== "object") {
      throw new Error("Unexpected API response.");
    }

    document.title = eventData.title
      ? `${eventData.title} - Polymarket Token IDs`
      : `Polymarket Token IDs - ${trimmed}`;

    renderResults(eventData, trimmed);
    setStatus(`Markets found: ${Array.isArray(eventData.markets) ? eventData.markets.length : 0}`);
  } catch (error) {
    clearResults();
    setStatus(error instanceof Error ? error.message : "Error loading data.", "error");
  }
}

slugForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadSlug(slugInput.value || "");
});

function init() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug") ?? "";

  if (slug) {
    slugInput.value = slug;
    loadSlug(slug);
  } else {
    setStatus("Enter an event slug to fetch token IDs.");
    slugInput.focus();
  }
}

init();

