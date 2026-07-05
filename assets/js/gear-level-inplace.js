(() => {
  const style = document.createElement("style");
  style.textContent = `
    .gear-advanced-switchable-summary,
    .gear-condition-label {
      color: var(--primary-dark) !important;
    }
  `;
  document.head.appendChild(style);

  const apply = () => {
    const sections = document.querySelectorAll("#gearModalContent > .detail-section");
    const advanced = [...sections].find((section) => section.querySelector(":scope > h3")?.textContent.includes("高級效果"));
    if (!advanced) return;

    const condition = advanced.querySelector(".gear-condition");
    if (condition && !condition.querySelector(".gear-condition-label")) {
      const raw = condition.textContent || "";
      const separator = raw.includes("：") ? "：" : ":";
      const index = raw.indexOf(separator);
      if (index >= 0) {
        const label = raw.slice(0, index + 1);
        const value = raw.slice(index + 1);
        condition.textContent = "";
        const labelSpan = document.createElement("span");
        labelSpan.className = "gear-condition-label";
        labelSpan.textContent = label;
        const valueSpan = document.createElement("span");
        valueSpan.textContent = value;
        condition.append(labelSpan, valueSpan);
      }
    }

    const target = advanced.querySelector(".gear-advanced-switchable-section");
    if (!target || target.parentElement?.classList.contains("gear-advanced-switchable-details")) return;

    const title = target.querySelector(":scope > h4");
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    details.className = "gear-advanced-switchable-details";
    summary.className = "gear-advanced-switchable-summary";
    summary.textContent = `► ${title?.textContent.trim() || "可切換效果"}`;
    Object.assign(summary.style, {
      cursor: "pointer",
      fontWeight: "800",
      padding: "0.8rem 0"
    });
    Object.assign(details.style, { margin: "0", border: "0" });
    target.style.paddingTop = "0";
    title?.remove();
    target.before(details);
    details.append(summary, target);
    details.addEventListener("toggle", () => {
      summary.textContent = `${details.open ? "▼" : "►"} 可切換效果`;
    });
  };

  const schedule = () => [0, 50, 150, 400].forEach((delay) => window.setTimeout(apply, delay));
  document.addEventListener("click", (event) => {
    if (event.target.closest?.(".gear-card, .gear-detail-link")) schedule();
  }, true);
  schedule();
})();
