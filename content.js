let mouseX = 0;
let mouseY = 0;
let customApiKey = "";

function initializeApiKey() {
  chrome.storage.local.get(["customApiKey"], function (result) {
    if (result.customApiKey) {
      customApiKey = result.customApiKey;
    }
  });
}

function initializeEventListeners() {
  document.removeEventListener("mouseup", handleMouseUp);
  document.addEventListener("mouseup", handleMouseUp);
  document.removeEventListener("keydown", handleKeyDown);
  document.addEventListener("keydown", handleKeyDown);

  initializeApiKey();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "UPDATE_API_KEY" && message.apiKey) {
    customApiKey = message.apiKey;
  }
});

async function translateWithGemini(text) {
  if (!text || text.length === 0) {
    showPopup("No text selected", mouseX, mouseY);
    return null;
  }

  if (!customApiKey) {
    showPopup(
      "API Key not found. Please set it in the extension options.",
      mouseX,
      mouseY
    );
    return null;
  }

  const result = await new Promise((resolve) => {
    chrome.storage.local.get(["selectedLanguageName"], function (result) {
      resolve(result.selectedLanguageName || "Vietnamese");
    });
  });

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${customApiKey}`;
  const prompt = `
    Please translate the following text into ${result}:
    "${text}"

    Requirements:
    - Only display the meaning of the text in ${result}
    - For technical terms, keep the original word
  `;

  const body = JSON.stringify({
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
  });

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: body,
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error("API Error:", errorData);
    throw new Error(
      `API Error: ${errorData.error?.message || response.status}`
    );
  }

  const data = await response.json();
  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error("Invalid response format");
  }

  return data.candidates[0].content.parts[0].text;
}

function handleMouseUp() {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (selectedText) {
    localStorage.setItem("selectedText", selectedText);

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    mouseX = rect.left + window.scrollX;
    mouseY = rect.bottom + window.scrollY + 10;
  }
}

function showLoadingPopup(x, y) {
  showPopup("Translating...", x, y);
  const popup = document.querySelector("#translator-popup");
  if (popup) {
    popup.style.backgroundColor = "#f8f9fa";
    popup.style.fontStyle = "italic";
  }
}

async function handleKeyDown(event) {
  if (event.ctrlKey && event.shiftKey && checkSelection()) {
    let selectedText = localStorage.getItem("selectedText");
    if (selectedText) {
      try {
        const existingPopup = document.querySelector("#translator-popup");
        if (existingPopup) {
          existingPopup.remove();
        }

        showLoadingPopup(mouseX, mouseY);
        const translatedText = await translateWithGemini(selectedText);
        if (translatedText) {
          showPopup(translatedText, mouseX, mouseY);
          document.addEventListener("click", handleOutsideClick);
        }
      } catch (error) {
        console.error("Translation API failed:", error);
        showPopup("Translation API failed, please try again", mouseX, mouseY);
      }
    }
  }
}

function checkSelection() {
  const selection = window.getSelection().toString().trim();
  if (selection.length > 1500) {
    showPopup(
      "Selected text is too long. Please select a shorter text.(Max 1500 words)",
      mouseX,
      mouseY
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

function showPopup(text, x, y) {
  let popup = document.querySelector("#translator-popup");

  if (!popup) {
    popup = document.createElement("div");
    popup.id = "translator-popup";

    const styles = {
      position: "absolute",
      backgroundColor: "#ffffff",
      border: "1px solid #e0e0e0",
      color: "#333333",
      padding: "12px 16px",
      zIndex: 999999,
      boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
      borderRadius: "8px",
      maxWidth: "400px",
      minWidth: "200px",
      lineHeight: "1.6",
      fontSize: "14px",
      fontFamily: "'Montserrat', sans-serif",
      whiteSpace: "pre-line",
      transition: "opacity 0.2s ease",
      opacity: "0",
      transform: "translateY(10px)",
    };

    Object.assign(popup.style, styles);
    document.body.appendChild(popup);

    document.addEventListener("click", handleOutsideClick);

    setTimeout(() => {
      popup.style.opacity = "1";
      popup.style.transform = "translateY(0)";
    }, 50);
  }

  popup.innerText = text;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const popupRect = popup.getBoundingClientRect();

  if (x + popupRect.width > viewportWidth) {
    x = viewportWidth - popupRect.width - 20;
  }

  if (y + popupRect.height > viewportHeight) {
    y = y - popupRect.height - 20;
  }

  popup.style.left = `${Math.max(0, x)}px`;
  popup.style.top = `${Math.max(0, y)}px`;
}

function cleanup() {
  document.removeEventListener("mouseup", handleMouseUp);
  document.removeEventListener("keydown", handleKeyDown);
  const popup = document.querySelector("#translator-popup");
  if (popup) {
    popup.remove();
  }
  localStorage.removeItem("selectedText");
}

initializeEventListeners();
