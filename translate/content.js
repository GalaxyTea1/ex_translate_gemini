let mouseX = 0;
let mouseY = 0;
let savedSelectedText = "";
let currentShortcut = { ctrlKey: true, shiftKey: true, altKey: false, key: "" };

// Provider configs - OpenAI-compatible format
const PROVIDERS = {
  openai: {
    name: "OpenAI",
    url: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
    needsKey: true,
  },
  openrouter: {
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "deepseek/deepseek-r1-0528:free",
    needsKey: true,
  },
  groq: {
    name: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: "llama-3.3-70b-versatile",
    needsKey: true,
  },
  megallm: {
    name: "MegaLLM",
    url: "https://ai.megallm.io/v1/chat/completions",
    defaultModel: "deepseek-ai/deepseek-v3.1",
    needsKey: true,
  },
  ollama: {
    name: "Ollama (Local)",
    url: "http://localhost:11434/v1/chat/completions",
    defaultModel: "llama3",
    needsKey: false,
  },
};

function initializeEventListeners() {
  document.removeEventListener("mouseup", handleMouseUp);
  document.addEventListener("mouseup", handleMouseUp);
  document.removeEventListener("keydown", handleKeyDown);
  document.addEventListener("keydown", handleKeyDown);

  chrome.storage.local.get(["shortcut"], function (result) {
    if (result.shortcut) currentShortcut = result.shortcut;
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "UPDATE_SHORTCUT" && message.shortcut) {
    currentShortcut = message.shortcut;
  }
});

function matchesShortcut(event, shortcut) {
  // Only filter lone modifier presses when a specific key is required
  if (shortcut.key && ["Control", "Shift", "Alt"].includes(event.key)) return false;
  if (!!shortcut.ctrlKey !== event.ctrlKey) return false;
  if (!!shortcut.shiftKey !== event.shiftKey) return false;
  if (!!shortcut.altKey !== event.altKey) return false;
  if (shortcut.key && event.key.toUpperCase() !== shortcut.key.toUpperCase()) return false;
  return true;
}

async function translateWithOpenAICompatible(text, provider, apiKey, model) {
  if (!text || text.length === 0) {
    showPopup("No text selected", mouseX, mouseY, {});
    return null;
  }

  const providerConfig = PROVIDERS[provider];

  if (providerConfig.needsKey && !apiKey) {
    showPopup(
      `API Key not found. Please set your ${providerConfig.name} API key in the extension options.`,
      mouseX,
      mouseY,
      {}
    );
    return null;
  }

  const targetLangName = await new Promise((resolve) => {
    chrome.storage.local.get(["selectedLanguageName"], function (result) {
      resolve(result.selectedLanguageName || "Vietnamese");
    });
  });

  const prompt = `Please translate the following text into ${targetLangName}:
"${text}"

Requirements:
- Only display the meaning of the text in ${targetLangName}
- For technical terms, keep the original word`;

  const usedModel = model || providerConfig.defaultModel;

  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(providerConfig.url, {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
      model: usedModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error("API Error:", errorData);
    throw new Error(
      `API Error: ${errorData.error?.message || response.status}`
    );
  }

  const data = await response.json();
  if (!data.choices?.[0]?.message?.content) {
    throw new Error("Invalid response format");
  }

  return data.choices[0].message.content;
}

const languageMap = {
  "Vietnamese": "vi",
  "English": "en",
  "French": "fr",
  "Spanish": "es",
  "German": "de",
  "Italian": "it",
  "Japanese": "ja",
  "Korean": "ko",
  "Portuguese": "pt",
  "Russian": "ru",
  "Chinese": "zh-CN",
  "Arabic": "ar",
  "Dutch": "nl",
  "Polish": "pl",
  "Swedish": "sv",
  "Turkish": "tr",
};

async function translateWithGoogleFree(text) {
  if (!text || text.length === 0) {
    showPopup("No text selected", mouseX, mouseY, {});
    return null;
  }

  const targetLangName = await new Promise((resolve) => {
    chrome.storage.local.get(["selectedLanguageName"], function (result) {
      resolve(result.selectedLanguageName || "Vietnamese");
    });
  });

  const targetLangCode = languageMap[targetLangName] || "vi";

  // Google Translate GTX API (Free, No Key)
  const apiUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLangCode}&dt=t&q=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`Google Translate Error: ${response.status}`);
    }

    const data = await response.json();

    if (data && data[0]) {
      return data[0].map(sentence => sentence[0]).join("");
    } else {
      throw new Error("Invalid response format from Google");
    }

  } catch (error) {
    console.error("Google Translate Error:", error);
    throw error;
  }
}


async function performTranslation() {
  const selectedText = savedSelectedText;
  if (!selectedText) return;

  try {
    const existingPopup = document.querySelector("#translator-popup");
    if (existingPopup) existingPopup.remove();

    showPopup("Translating...", mouseX, mouseY, { isLoading: true });

    const settings = await new Promise((resolve) => {
      chrome.storage.local.get(
        ["translationMode", "apiKeys", "models", "selectedLanguageName"],
        function (result) { resolve(result); }
      );
    });

    const mode = settings.translationMode || "free";
    const apiKeys = settings.apiKeys || {};
    const models = settings.models || {};
    const targetLanguage = settings.selectedLanguageName || "Vietnamese";
    const providerName = mode === "free"
      ? "Google Translate"
      : (PROVIDERS[mode]?.name || mode);

    let translatedText;
    if (mode === "free") {
      translatedText = await translateWithGoogleFree(selectedText);
    } else {
      translatedText = await translateWithOpenAICompatible(
        selectedText,
        mode,
        apiKeys[mode] || "",
        models[mode] || ""
      );
    }

    if (translatedText) {
      const loadingPopup = document.querySelector("#translator-popup");
      if (loadingPopup) loadingPopup.remove();

      showPopup(translatedText, mouseX, mouseY, { providerName });
      saveToHistory(selectedText, translatedText, providerName, targetLanguage);
    }
  } catch (error) {
    console.error("Translation API failed:", error);
    const existing = document.querySelector("#translator-popup");
    if (existing) existing.remove();
    showPopup("Translation failed, please try again", mouseX, mouseY, {});
  }
}

// ============================================================
// Mouse & keyboard handlers
// ============================================================

function handleMouseUp() {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (selectedText) {
    savedSelectedText = selectedText;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    mouseX = rect.left + window.scrollX;
    mouseY = rect.bottom + window.scrollY + 10;
  }
}

function handleKeyDown(event) {
  if (matchesShortcut(event, currentShortcut) && checkSelection()) {
    performTranslation();
  }
}

// ============================================================
// Helpers
// ============================================================

function saveToHistory(original, translated, providerName, targetLanguage) {
  chrome.storage.local.get(["translationHistory"], function (result) {
    const history = result.translationHistory || [];
    history.unshift({
      id: Date.now(),
      original: original.substring(0, 300),
      translated: translated.substring(0, 600),
      providerName: providerName,
      targetLanguage: targetLanguage,
      timestamp: Date.now(),
    });
    if (history.length > 30) history.length = 30;
    chrome.storage.local.set({ translationHistory: history });
  });
}

function checkSelection() {
  const selection = window.getSelection().toString().trim();
  if (selection.length > 1500) {
    showPopup(
      "Selected text is too long. Please select a shorter text.(Max 1500 words)",
      mouseX,
      mouseY,
      {}
    );
    return false;
  }
  return selection.length > 0;
}

function handleOutsideClick(event) {
  const popupElement = document.querySelector("#translator-popup");
  if (popupElement && !popupElement.contains(event.target)) {
    popupElement.remove();
    document.removeEventListener("click", handleOutsideClick);
  }
}

function showPopup(text, x, y, options) {
  let popup = document.querySelector("#translator-popup");
  if (popup) popup.remove();

  popup = document.createElement("div");
  popup.id = "translator-popup";

  Object.assign(popup.style, {
    position: "absolute",
    backgroundColor: "#ffffff",
    border: "1px solid #e0e0e0",
    color: "#333333",
    zIndex: "999999",
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
    borderRadius: "10px",
    maxWidth: "420px",
    minWidth: "200px",
    fontFamily: "'Montserrat', sans-serif",
    fontSize: "14px",
    overflow: "hidden",
    opacity: "0",
    transform: "translateY(8px)",
    transition: "opacity 0.2s ease, transform 0.2s ease",
  });

  // --- Header ---
  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "7px 12px",
    backgroundColor: options.isLoading ? "#f8f9fa" : "#f0f7ff",
    borderBottom: options.isLoading ? "none" : "1px solid #e8eef5",
  });

  const providerLabel = document.createElement("span");
  Object.assign(providerLabel.style, {
    fontSize: "12px",
    fontWeight: "600",
    color: options.isLoading ? "#999" : "#4a90d9",
    fontStyle: options.isLoading ? "italic" : "normal",
  });
  providerLabel.innerText = options.isLoading
    ? "Translating..."
    : (options.providerName || "Translator");

  header.appendChild(providerLabel);

  // Action buttons (only for result state)
  if (!options.isLoading) {
    const actions = document.createElement("div");
    Object.assign(actions.style, { display: "flex", gap: "4px", alignItems: "center" });

    // Copy button
    const copyBtn = document.createElement("button");
    copyBtn.innerText = "Copy";
    Object.assign(copyBtn.style, {
      fontSize: "11px",
      padding: "2px 8px",
      border: "1px solid #d0d9e8",
      borderRadius: "4px",
      backgroundColor: "#fff",
      cursor: "pointer",
      color: "#555",
      fontFamily: "inherit",
    });
    copyBtn.addEventListener("mouseover", function () { copyBtn.style.backgroundColor = "#f0f7ff"; });
    copyBtn.addEventListener("mouseout", function () { copyBtn.style.backgroundColor = "#fff"; });
    copyBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      navigator.clipboard.writeText(text).then(function () {
        copyBtn.innerText = "✓ Copied!";
        copyBtn.style.color = "#4caf50";
        copyBtn.style.borderColor = "#4caf50";
        setTimeout(function () {
          copyBtn.innerText = "Copy";
          copyBtn.style.color = "#555";
          copyBtn.style.borderColor = "#d0d9e8";
        }, 1500);
      });
    });

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.innerText = "✕";
    Object.assign(closeBtn.style, {
      fontSize: "12px",
      padding: "2px 6px",
      border: "none",
      borderRadius: "4px",
      backgroundColor: "transparent",
      cursor: "pointer",
      color: "#aaa",
      fontFamily: "inherit",
    });
    closeBtn.addEventListener("mouseover", function () { closeBtn.style.color = "#555"; });
    closeBtn.addEventListener("mouseout", function () { closeBtn.style.color = "#aaa"; });
    closeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      popup.remove();
      document.removeEventListener("click", handleOutsideClick);
    });

    actions.appendChild(copyBtn);
    actions.appendChild(closeBtn);
    header.appendChild(actions);
  }

  popup.appendChild(header);

  // --- Body (only for non-loading) ---
  if (!options.isLoading) {
    const body = document.createElement("div");
    body.innerText = text;
    Object.assign(body.style, {
      padding: "12px 14px",
      lineHeight: "1.6",
      whiteSpace: "pre-line",
    });
    popup.appendChild(body);
  }

  document.body.appendChild(popup);
  document.addEventListener("click", handleOutsideClick);

  // Initial position
  popup.style.left = Math.max(0, x) + "px";
  popup.style.top = Math.max(0, y) + "px";

  // Animate in + adjust position after render
  requestAnimationFrame(function () {
    const popupRect = popup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let newLeft = parseFloat(popup.style.left);
    let newTop = parseFloat(popup.style.top);

    if (popupRect.right > viewportWidth) {
      newLeft -= (popupRect.right - viewportWidth + 20);
    }
    if (popupRect.bottom > viewportHeight) {
      newTop -= (popupRect.height + 20);
    }

    popup.style.left = Math.max(0, newLeft) + "px";
    popup.style.top = Math.max(0, newTop) + "px";
    popup.style.opacity = "1";
    popup.style.transform = "translateY(0)";
  });
}

function cleanup() {
  document.removeEventListener("mouseup", handleMouseUp);
  document.removeEventListener("keydown", handleKeyDown);
  const popup = document.querySelector("#translator-popup");
  if (popup) popup.remove();
  savedSelectedText = "";
}

initializeEventListeners();
