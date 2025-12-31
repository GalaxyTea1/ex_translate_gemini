document.addEventListener("DOMContentLoaded", function () {
  const nameInput = document.getElementById("name");
  const apiKeyInput = document.getElementById("apiKey");
  const nameInputGroup = document.getElementById("name-input-group");
  const welcomeMessage = document.getElementById("welcome-message");
  const userNameSpan = document.getElementById("user-name");
  const saveButton = document.getElementById("saveButton");
  const settingsIcon = document.getElementById("settingsIcon");
  const languageSelect = document.getElementById("languageSelect");
  const translationModeSelect = document.getElementById("translationMode");
  const apiKeyGroup = document.getElementById("api-key-group");

  function toggleApiKeyGroup(mode) {
    if (mode === "megallm") {
      apiKeyGroup.classList.add("show");
    } else {
      apiKeyGroup.classList.remove("show");
    }
  }

  // Load settings từ storage
  chrome.storage.local.get(["userName", "customApiKey", "translationMode"], function (result) {
    if (result.userName) {
      nameInputGroup.style.display = "none";
      welcomeMessage.style.display = "block";
      userNameSpan.textContent = "Hello " + result.userName + "!";
    }
    if (result.customApiKey) {
      apiKeyInput.value = result.customApiKey;
    }
    // Load translation mode (default: free)
    const mode = result.translationMode || "free";
    translationModeSelect.value = mode;
    toggleApiKeyGroup(mode);
  });

  // Translation Mode change handler
  translationModeSelect.addEventListener("change", function () {
    const mode = translationModeSelect.value;
    toggleApiKeyGroup(mode);
    chrome.storage.local.set({ translationMode: mode });
  });

  saveButton.addEventListener("click", function () {
    const name = nameInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const translationMode = translationModeSelect.value;

    const dataToSave = {
      translationMode: translationMode
    };

    if (name) {
      dataToSave.userName = name;
    }

    if (translationMode === "megallm" && apiKey) {
      dataToSave.customApiKey = apiKey;
    }

    chrome.storage.local.set(dataToSave, function () {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "UPDATE_API_KEY",
          apiKey: apiKey,
        });
      });
      window.close();
    });
  });

  settingsIcon.addEventListener("click", function () {
    languageSelect.classList.toggle("show");
    chrome.storage.local.get("selectedLanguage", function (result) {
      languageSelect.value = result.selectedLanguage || "vi";
    });
  });

  languageSelect.addEventListener("change", function () {
    const selectedLanguage = languageSelect.value;
    const selectedLanguageName =
      languageSelect.options[languageSelect.selectedIndex].textContent;
    chrome.storage.local.set({
      selectedLanguage: selectedLanguage,
      selectedLanguageName: selectedLanguageName,
    });
  });

  const languages = [
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

  languages.forEach((lang) => {
    const option = document.createElement("option");
    option.value = lang.value;
    option.textContent = lang.name;
    languageSelect.appendChild(option);
  });
});
