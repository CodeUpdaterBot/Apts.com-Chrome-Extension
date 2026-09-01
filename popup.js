// chrome-extension/popup.js

let scrapedItems = [];

document.addEventListener("DOMContentLoaded", async () => {
  const listEl      = document.getElementById("list");
  const themeBtn    = document.getElementById("theme-toggle");
  const downloadBtn = document.getElementById("download-csv");
  const shareBtn    = document.getElementById("share-btn");          // ← NEW

  /* ---------------------------  THEME TOGGLE  --------------------------- */
  let theme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", theme);
  themeBtn.textContent = theme === "light" ? "🌙" : "☀️";

  themeBtn.addEventListener("click", () => {
    theme = theme === "light" ? "dark" : "light";
    localStorage.setItem("theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
    themeBtn.textContent = theme === "light" ? "🌙" : "☀️";
    themeBtn.classList.add("rotating");
    setTimeout(() => themeBtn.classList.remove("rotating"), 120);
  });

  /* ---------------------------  CSV HELPERS  ---------------------------- */
  const buildCsv = (items) => {
    const headers = [
      "Property",
      "Unit",
      "Tenants",
      "Total Balance",
      "Months Behind",
      "Monthly Rent",
      "In-Progress Payment"
    ];
    const escapeCell = (str) => {
      const s = String(str).replace(/"/g, '""');
      return /,|"/.test(s) ? `"${s}"` : s;
    };
    const rows = items.map((item) => [
      item.property,
      item.unit,
      item.tenants,
      item.amount,
      item.monthsBehind,
      item.monthlyRent || "",
      item.inProgressAmount || ""
    ]);
    return [headers, ...rows].map((r) => r.map(escapeCell).join(",")).join("\r\n");
  };

  /* ---------------------------  CSV DOWNLOAD  --------------------------- */
  downloadBtn.addEventListener("click", () => {
    if (!scrapedItems.length) return;

    const csvContent = buildCsv(scrapedItems);
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "outstanding-balances.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  /* ---------------------------  SHARE (📧)  ------------------------------ */
  shareBtn.addEventListener("click", async () => {
    if (!scrapedItems.length) return;

    shareBtn.classList.add("rotating");
    setTimeout(() => shareBtn.classList.remove("rotating"), 120);

    const csvContent = buildCsv(scrapedItems);
    const file       = new File([csvContent], "outstanding-balances.csv",
                                { type: "text/csv" });

    try {
      /* 1. Best case – full Web-Share with attachment */
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Outstanding Balances",
          text : "Outstanding balances report attached.",
          files: [file]
        });
        return;
      }

      /* 2. Fallback – Web-Share (text only) */
      if ("share" in navigator) {
        await navigator.share({
          title: "Outstanding Balances",
          text : csvContent
        });
        return;
      }

      /* 3. Last resort – open default mail client */
      const mailto = `mailto:?subject=${encodeURIComponent(
        "Outstanding Balances Report"
      )}&body=${encodeURIComponent(csvContent)}`;
      window.open(mailto, "_blank");
    } catch (err) {
      console.error("Share failed:", err);
    }
  });

  /* ---------------------------  SCRAPE TAB  ----------------------------- */
  // 1. Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    listEl.textContent = "No active tab found.";
    return;
  }

  // 2. Inject scraper
  chrome.scripting.executeScript(
    { target: { tabId: tab.id }, func: extractDueBalances },
    ([res]) => {
      if (chrome.runtime.lastError) {
        listEl.textContent = "Injection error: " + chrome.runtime.lastError.message;
        return;
      }
      const items = res?.result || [];
      scrapedItems = items;

      // 3. Render
      listEl.innerHTML = "";
      if (!items.length) {
        listEl.textContent = "No outstanding balances found.";
        return;
      }
      items.forEach((item) => addTile(item, tab.id));
    }
  );

  /* ---------------------------  UI TILES  ------------------------------- */
  function addTile(item, tabId) {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `
      <div class="lhs">
        <div class="balance-block">
          ${item.emoji}
          <span class="balance">${item.amount}</span>
        </div>
        <div class="months">${item.monthsBehind} behind</div>
        ${item.monthlyRent ? `<div class="monthly-rent">${item.monthlyRent}/mo</div>` : ""}
      </div>
      <div class="rhs">
        <div class="address">${item.property}</div>
        <div class="unit">${item.unit}</div>
        ${item.tenants ? `<div class="tenants">${item.tenants}</div>` : ""}
        ${item.inProgressAmount
          ? `<div class="in-progress">
               <span class="in-progress-emoji">💸</span>
               <span class="in-progress-text">In-progress payment: ${item.inProgressAmount}</span>
             </div>`
          : ""}
      </div>`;
      tile.addEventListener("click", () => {
        chrome.scripting.executeScript({
          target: { tabId },
          func : scrollToUnitOnPage,
          args : [item.property, item.unit],
          world: "MAIN"                 // ← NEW
        });
      });
      //-----------------------------------------------------------------
      listEl.appendChild(tile);
    }
  });

/* -----------------------------------------
   The following functions run in the page
-------------------------------------------- */

function extractDueBalances() {
  const $ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const $$prev = (el, sel) => {
    for (let node = el; node; node = node.parentElement) {
      for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
        if (sib.matches(sel)) return sib;
        const nested = sib.querySelector(sel);
        if (nested) return nested;
      }
    }
    return null;
  };
  const $num = s => parseFloat(s.replace(/\$|,/g, ""));

  const out = [];
  $("span").forEach(span => {
    if (span.textContent.trim() !== "Payment is due.") return;

    // total balance
    let amount = null;
    for (let sib = span.previousElementSibling; sib; sib = sib.previousElementSibling) {
      if (sib.tagName === "SPAN" && sib.classList.contains("text-semibold")) {
        amount = sib.textContent.trim();
        break;
      }
    }
    if (!amount) {
      const m = span.parentElement.textContent.match(/\$[\d,]+\.\d{2}/);
      if (!m) return;
      amount = m[0];
    }
    const numericBalance = $num(amount);

    // unit & tenants
    let unit = "Unknown Unit", tenants = "";
    const uc = span.closest("div.colored-left-border");
    const h3 = uc?.querySelector("h3") || $$prev(uc || span, "h3");
    if (h3) {
      const parts = h3.textContent
        .split(/\r?\n/)
        .map(t => t.trim())
        .filter(Boolean);
      unit = parts.shift() || unit;
      tenants = parts.join(", ")
        .replace(/\(Invited\)/gi, "")
        .split(",")
        .map(n => n.trim())
        .filter(Boolean)
        .map(full =>
          full
            .split(" ")
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(" ")
        )
        .join(", ");
    }

    // property address
    const h2 = $$prev(span, "h2.card__title");
    const prop = h2 ? h2.textContent.trim() : "Unknown Property";

    // monthly rent & months behind
    let monthsBehind = "?", monthlyRentText = null, behindRatio = null;
    if (uc) {
      const firstCol = uc.closest("div.columns");
      const rentSpan = firstCol?.nextElementSibling
        ?.querySelector('span[data-bind*="summaryRentRequest().amount().dollars"]');
      if (rentSpan) {
        const rentNum = $num(rentSpan.textContent.trim());
        if (rentNum) {
          behindRatio = numericBalance / rentNum;
          let mFmt = behindRatio.toFixed(1);
          if (mFmt.endsWith(".0")) mFmt = mFmt.slice(0, -2);
          monthsBehind = `${mFmt} months`;
          monthlyRentText = `$${Math.round(rentNum).toLocaleString()}`;
        }
      }
    }

    // in-progress payments
    let inProgressAmount = null;
    if (uc) {
      const leaseCard = uc.closest("div.card-body");
      const ol = leaseCard?.querySelector("ol.list-container");
      if (ol) {
        let totalInProg = 0;
        ol.querySelectorAll("li").forEach(li => {
          const statusEl = li.querySelector('[data-bind*="paymentStatus().state"]');
          if (statusEl?.textContent.trim() === "In Progress") {
            const amtEl = li.querySelector('[data-bind*="displayAmount"]');
            if (amtEl) totalInProg += Math.abs($num(amtEl.textContent));
          }
        });
        if (totalInProg > 0) {
          inProgressAmount = `$${Math.round(totalInProg).toLocaleString()}`;
        }
      }
    }

    // emoji (red if >1 month behind)
    const emoji = (behindRatio !== null && behindRatio > 1) ? "🔴" : "🟢";

    out.push({
      amount,
      numeric: numericBalance,
      emoji,
      property: prop,
      unit,
      tenants,
      monthsBehind,
      monthlyRent: monthlyRentText,
      inProgressAmount
    });
  });

  return out.sort((a, b) => b.numeric - a.numeric);
}

function scrollToUnitOnPage(propertyText, unitText) {
    const norm = s => s.replace(/\s+/g, " ").trim().toLowerCase();
  
    const propNorm = norm(propertyText);
    const unitNorm = norm(unitText);
  
    const flash = el => {
      if (!el) return;
      el.classList.add("flash-scroll-target");
      setTimeout(() => el.classList.remove("flash-scroll-target"), 1500);
    };
  
    /* 1. Try unit (more specific) ----------------------------------- */
    for (const h3 of document.querySelectorAll("h3")) {
      if (norm(h3.textContent).includes(unitNorm)) {
        const card = h3.closest(".card-body") || h3;
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        flash(card);
        return;
      }
    }
  
    /* 2. Fall back to property title -------------------------------- */
    for (const h2 of document.querySelectorAll("h2.card__title")) {
      if (norm(h2.textContent) === propNorm) {
        const card = h2.closest(".card-body") || h2;
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        flash(card);
        return;
      }
    }
  }