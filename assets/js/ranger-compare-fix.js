(() => {
  const ROOT = window.location.pathname.includes("/rangerbook/") ? "/rangerbook/" : "/";
  const RANGER_IMAGE = (id) => `https://rangers.lerico.net/res/${encodeURIComponent(id)}/${encodeURIComponent(id)}-thum.png`;

  const leftInput = document.getElementById("compareLeftInput");
  const rightInput = document.getElementById("compareRightInput");
  const leftSuggestions = document.getElementById("compareLeftSuggestions");
  const rightSuggestions = document.getElementById("compareRightSuggestions");

  if (!leftInput || !rightInput || !leftSuggestions || !rightSuggestions) return;

  function enhanceSuggestion(button) {
    if (!button || button.dataset.enhanced === "1") return;

    const id = button.dataset.id || "";
    const content = button.querySelector(":scope > div:last-child") || button.querySelector("div");
    const meta = button.querySelector(".compare-suggestion-meta");

    if (!id || !content) return;

    if (!button.querySelector(".compare-suggestion-thumb")) {
      const thumb = document.createElement("span");
      thumb.className = "compare-suggestion-thumb";
      thumb.innerHTML = `<img src="${RANGER_IMAGE(id)}" alt="" loading="lazy" onerror="this.closest('.compare-suggestion-thumb').classList.add('missing-icon'); this.remove();">`;
      button.insertBefore(thumb, content);
    }

    if (meta) {
      const parts = meta.textContent.split("/").map((part) => part.trim()).filter(Boolean);
      const withoutId = parts.filter((part) => part !== id);
      meta.textContent = withoutId.join(" / ");
      if (!meta.textContent.trim()) meta.remove();
    }

    button.dataset.enhanced = "1";
  }

  function enhanceSuggestions(target) {
    target.querySelectorAll(".compare-suggestion").forEach(enhanceSuggestion);
  }

  function clearSuggestions(side) {
    const target = side === "left" ? leftSuggestions : rightSuggestions;
    target.innerHTML = "";
  }

  function setSelectedInput(button) {
    const side = button.dataset.side;
    const name = button.querySelector(".compare-suggestion-name")?.textContent.trim();
    const input = side === "left" ? leftInput : rightInput;
    if (name && input) input.value = name;
    if (side === "left" || side === "right") {
      clearSuggestions(side);
      window.setTimeout(() => clearSuggestions(side), 120);
      window.setTimeout(() => clearSuggestions(side), 600);
      window.setTimeout(() => clearSuggestions(side), 1200);
      input?.blur();
    }
  }

  [leftSuggestions, rightSuggestions].forEach((target) => {
    enhanceSuggestions(target);

    const observer = new MutationObserver(() => enhanceSuggestions(target));
    observer.observe(target, { childList: true, subtree: true });

    target.addEventListener("pointerdown", (event) => {
      const button = event.target instanceof Element ? event.target.closest(".compare-suggestion") : null;
      if (button) setSelectedInput(button);
    }, true);

    target.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest(".compare-suggestion") : null;
      if (button) setSelectedInput(button);
    }, true);
  });
})();
