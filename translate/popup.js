document.addEventListener("DOMContentLoaded", function () {
  // Settings elements
  const apiKeyInput = document.getElementById("apiKey");
  const apiKeyLabel = document.getElementById("apiKeyLabel");
  const apiKeyHint = document.getElementById("apiKeyHint");
  const modelInput = document.getElementById("modelInput");
  const modelHint = document.getElementById("modelHint");
  const saveButton = document.getElementById("saveButton");
  const settingsIcon = document.getElementById("settingsIcon");
  const languageSelect = document.getElementById("languageSelect");
  const translationModeSelect = document.getElementById("translationMode");
  const apiKeyGroup = document.getElementById("api-key-group");
  const modelGroup = document.getElementById("model-group");
  const shortcutInput = document.getElementById("shortcutInput");

  // History elements
  const historyList = document.getElementById("history-list");
  const clearHistoryBtn = document.getElementById("clearHistory");

  let pendingShortcut = null;

  // === Tab switching ===
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      const tab = btn.dataset.tab;
      tabBtns.forEach(function (b) { b.classList.remove("active"); });
      tabContents.forEach(function (c) { c.classList.remove("active"); });
      btn.classList.add("active");
      document.getElementById("tab-" + tab).classList.add("active");
      if (tab === "history") loadHistory();
    });
  });

  // === Provider info ===
  const PROVIDER_INFO = {
    free: { needsKey: false },
    openai: {
      needsKey: true,
      label: "API Key OpenAI:",
      hint: "Get key: platform.openai.com/api-keys",
      defaultModel: "gpt-4o-mini",
    },
    openrouter: {
      needsKey: true,
      label: "API Key OpenRouter:",
      hint: "Get key: openrouter.ai/keys",
      defaultModel: "deepseek/deepseek-r1-0528:free",
    },
    groq: {
      needsKey: true,
      label: "API Key Groq:",
      hint: "Get key: console.groq.com/keys",
      defaultModel: "llama-3.3-70b-versatile",
    },
    megallm: {
      needsKey: true,
      label: "API Key MegaLLM:",
      hint: "Get key: ai.megallm.io",
      defaultModel: "deepseek-ai/deepseek-v3.1",
    },
    ollama: {
      needsKey: false,
      defaultModel: "llama3",
    },
  };

  function updateProviderUI(mode, apiKeys, models) {
    const info = PROVIDER_INFO[mode];

    if (!info || !info.needsKey) {
      apiKeyGroup.classList.remove("show");
    } else {
      apiKeyGroup.classList.add("show");
      apiKeyLabel.textContent = info.label || "API Key:";
      apiKeyHint.textContent = info.hint || "";
      apiKeyInput.value = (apiKeys && apiKeys[mode]) ? apiKeys[mode] : "";
    }

    if (mode === "free") {
      modelGroup.classList.remove("show");
    } else {
      modelGroup.classList.add("show");
      modelHint.textContent = "Default: " + (info.defaultModel || "");
      modelInput.value = (models && models[mode]) ? models[mode] : "";
    }
  }

  // === Shortcut recorder ===
  function formatShortcut(shortcut) {
    if (!shortcut) return "";
    var parts = [];
    if (shortcut.ctrlKey) parts.push("Ctrl");
    if (shortcut.shiftKey) parts.push("Shift");
    if (shortcut.altKey) parts.push("Alt");
    if (shortcut.key) parts.push(shortcut.key);
    return parts.join("+") || "";
  }

  shortcutInput.addEventListener("keydown", function (e) {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      shortcutInput.blur();
      return;
    }

    // Ignore lone modifier keys — wait for a non-modifier key
    if (["Control", "Shift", "Alt"].includes(e.key)) {
      shortcutInput.value = formatShortcut({
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        key: "",
      });
      return;
    }

    var shortcut = {
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      key: e.key.toUpperCase(),
    };

    shortcutInput.value = formatShortcut(shortcut);
    pendingShortcut = shortcut;
  });

  // === Load settings ===
  chrome.storage.local.get(
    ["apiKeys", "models", "translationMode", "shortcut"],
    function (result) {
      var mode = result.translationMode || "free";
      translationModeSelect.value = mode;
      updateProviderUI(mode, result.apiKeys || {}, result.models || {});

      if (result.shortcut) {
        shortcutInput.value = formatShortcut(result.shortcut);
        pendingShortcut = result.shortcut;
      } else {
        // Default shortcut: Ctrl+Shift (any key)
        shortcutInput.value = "Ctrl+Shift";
        pendingShortcut = { ctrlKey: true, shiftKey: true, altKey: false, key: "" };
      }
    }
  );

  // === Mode change handler ===
  translationModeSelect.addEventListener("change", function () {
    var mode = translationModeSelect.value;
    chrome.storage.local.get(["apiKeys", "models"], function (result) {
      updateProviderUI(mode, result.apiKeys || {}, result.models || {});
    });
    chrome.storage.local.set({ translationMode: mode });
  });

  // === Save button ===
  saveButton.addEventListener("click", function () {
    var apiKey = apiKeyInput.value.trim();
    var model = modelInput.value.trim();
    var translationMode = translationModeSelect.value;

    var dataToSave = { translationMode: translationMode };

    if (pendingShortcut) {
      dataToSave.shortcut = pendingShortcut;
    }

    chrome.storage.local.get(["apiKeys", "models"], function (result) {
      var apiKeys = result.apiKeys || {};
      var models = result.models || {};

      var info = PROVIDER_INFO[translationMode];
      if (info && info.needsKey && apiKey) {
        apiKeys[translationMode] = apiKey;
      }

      if (translationMode !== "free" && model) {
        models[translationMode] = model;
      } else if (translationMode !== "free" && !model) {
        delete models[translationMode];
      }

      dataToSave.apiKeys = apiKeys;
      dataToSave.models = models;

      chrome.storage.local.set(dataToSave, function () {
        // Notify active tab about shortcut update
        if (pendingShortcut) {
          chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
              chrome.tabs.sendMessage(tabs[0].id, {
                type: "UPDATE_SHORTCUT",
                shortcut: pendingShortcut,
              });
            }
          });
        }
        window.close();
      });
    });
  });

  // === Settings icon (language select) ===
  settingsIcon.addEventListener("click", function () {
    languageSelect.classList.toggle("show");
    chrome.storage.local.get("selectedLanguage", function (result) {
      languageSelect.value = result.selectedLanguage || "vi";
    });
  });

  languageSelect.addEventListener("change", function () {
    var selectedLanguage = languageSelect.value;
    var selectedLanguageName =
      languageSelect.options[languageSelect.selectedIndex].textContent;
    chrome.storage.local.set({
      selectedLanguage: selectedLanguage,
      selectedLanguageName: selectedLanguageName,
    });
  });

  var languages = [
    { value: "vi", name: "Vietnamese" },
    { value: "en", name: "English" },
    { value: "fr", name: "French" },
    { value: "es", name: "Spanish" },
    { value: "de", name: "German" },
    { value: "it", name: "Italian" },
    { value: "ja", name: "Japanese" },
    { value: "ko", name: "Korean" },
    { value: "pt", name: "Portuguese" },
    { value: "ru", name: "Russian" },
    { value: "zh", name: "Chinese" },
    { value: "ar", name: "Arabic" },
    { value: "nl", name: "Dutch" },
    { value: "pl", name: "Polish" },
    { value: "sv", name: "Swedish" },
    { value: "tr", name: "Turkish" },
  ];

  languages.forEach(function (lang) {
    var option = document.createElement("option");
    option.value = lang.value;
    option.textContent = lang.name;
    languageSelect.appendChild(option);
  });

  // === History ===
  function formatTimeAgo(timestamp) {
    var diff = Date.now() - timestamp;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return mins + "m ago";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    return Math.floor(hrs / 24) + "d ago";
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function loadHistory() {
    chrome.storage.local.get(["translationHistory"], function (result) {
      renderHistory(result.translationHistory || []);
    });
  }

  function renderHistory(history) {
    if (!history || history.length === 0) {
      historyList.innerHTML = '<p class="no-history">No translation history yet.</p>';
      return;
    }

    historyList.innerHTML = "";
    history.forEach(function (item) {
      var el = document.createElement("div");
      el.className = "history-item";
      el.title = "Click to copy translation";

      var originalTruncated = item.original.length > 80
        ? item.original.substring(0, 80) + "..."
        : item.original;

      var translatedTruncated = item.translated.length > 150
        ? item.translated.substring(0, 150) + "..."
        : item.translated;

      el.innerHTML =
        '<div class="history-meta">' +
          '<span class="history-provider">' + escapeHtml(item.providerName || "Unknown") + "</span>" +
          '<span class="history-time">' + formatTimeAgo(item.timestamp) + "</span>" +
        "</div>" +
        '<div class="history-original">' + escapeHtml(originalTruncated) + "</div>" +
        '<div class="history-translated">' + escapeHtml(translatedTruncated) + "</div>";

      // Click to copy full translated text
      el.addEventListener("click", function () {
        navigator.clipboard.writeText(item.translated).then(function () {
          el.classList.add("copied");
          setTimeout(function () { el.classList.remove("copied"); }, 1000);
        });
      });

      historyList.appendChild(el);
    });
  }

  clearHistoryBtn.addEventListener("click", function () {
    chrome.storage.local.set({ translationHistory: [] }, function () {
      renderHistory([]);
    });
  });
});
