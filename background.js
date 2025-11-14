const STORAGE_KEY = "opinionTopicHelperEnabled";

const ICON_COLORS = {
  enabled: [33, 196, 130],
  disabled: [120, 130, 140]
};

function extractPolymarketSlug(urlString) {
  if (!urlString) {
    return null;
  }

  try {
    const url = new URL(urlString);
    const host = url.hostname.toLowerCase();
    if (host !== "polymarket.com" && host !== "www.polymarket.com") {
      return null;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2 || segments[0] !== "event") {
      return null;
    }

    const slug = segments[1];
    return slug ? decodeURIComponent(slug) : null;
  } catch (error) {
    return null;
  }
}

async function openPolymarketViewer(slug) {
  const baseUrl = chrome.runtime.getURL("polymarket.html");
  const url = new URL(baseUrl);
  url.searchParams.set("slug", slug);
  await chrome.tabs.create({ url: url.toString() });
}

async function readState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (typeof stored[STORAGE_KEY] === "boolean") {
    return stored[STORAGE_KEY];
  }
  return true;
}

async function writeState(enabled) {
  await chrome.storage.local.set({ [STORAGE_KEY]: enabled });
}

function buildIcon(color) {
  const sizes = [16, 32];
  const imageData = {};

  for (const size of sizes) {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }

    imageData[size] = new ImageData(data, size, size);
  }

  return imageData;
}

async function updateActionPresentation(enabled) {
  const color = enabled ? ICON_COLORS.enabled : ICON_COLORS.disabled;
  await chrome.action.setIcon({ imageData: buildIcon(color) });
  const title = enabled
    ? "Opinion & Polymarket Helper - enabled (click a Polymarket event to open token IDs)"
    : "Opinion & Polymarket Helper - disabled";
  await chrome.action.setTitle({ title });
}

async function notifyTabs(enabled) {
  const tabs = await chrome.tabs.query({ url: "https://app.opinion.trade/detail*" });
  await Promise.all(
    tabs.map((tab) =>
      chrome.tabs
        .sendMessage(tab.id, { type: "OPINION_TOPIC_HELPER_TOGGLE", enabled })
        .catch(() => undefined)
    )
  );
}

async function applyState(enabled) {
  await writeState(enabled);
  await updateActionPresentation(enabled);
  await notifyTabs(enabled);
}

chrome.runtime.onInstalled.addListener(async () => {
  const enabled = await readState();
  await applyState(enabled);
});

chrome.runtime.onStartup.addListener(async () => {
  const enabled = await readState();
  await applyState(enabled);
});

chrome.action.onClicked.addListener(async (tab) => {
  const polymarketSlug = extractPolymarketSlug(tab?.url);
  if (polymarketSlug) {
    await openPolymarketViewer(polymarketSlug);
    return;
  }

  const current = await readState();
  await applyState(!current);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OPINION_TOPIC_HELPER_GET_STATE") {
    readState().then((enabled) => {
      sendResponse({ enabled });
    });
    return true;
  }
  return undefined;
});

