const STORAGE_KEY = "gold-ledger.entries";
const SETTINGS_KEY = "gold-ledger.settings";

const seedEntries = [
  { id: crypto.randomUUID(), date: "2026-07-07", grams: 5, pricePerGram: 9730, notes: "Sailaka Chit", syncState: "local" },
  { id: crypto.randomUUID(), date: "2026-04-03", grams: 7, pricePerGram: 15000, notes: "Gold Scheme", syncState: "local" },
  { id: crypto.randomUUID(), date: "2026-04-04", grams: 1, pricePerGram: 15160, notes: "", syncState: "local" },
  { id: crypto.randomUUID(), date: "2026-05-06", grams: 1, pricePerGram: 15300, notes: "", syncState: "local" }
];

const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const decimalFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 3
});

const state = {
  entries: loadEntries(),
  settings: loadSettings(),
  livePricePerGram: null,
  priceUpdatedAt: null,
  editingId: null
};

const els = {
  form: document.querySelector("#entryForm"),
  formStatus: document.querySelector("#formStatus"),
  date: document.querySelector("#date"),
  grams: document.querySelector("#grams"),
  pricePerGram: document.querySelector("#pricePerGram"),
  notes: document.querySelector("#notes"),
  entriesBody: document.querySelector("#entriesBody"),
  entryCount: document.querySelector("#entryCount"),
  totalGrams: document.querySelector("#totalGrams"),
  investedValue: document.querySelector("#investedValue"),
  avgBuyPrice: document.querySelector("#avgBuyPrice"),
  currentValue: document.querySelector("#currentValue"),
  gainLoss: document.querySelector("#gainLoss"),
  gainLossPct: document.querySelector("#gainLossPct"),
  priceSource: document.querySelector("#priceSource"),
  bestBuy: document.querySelector("#bestBuy"),
  highestBuy: document.querySelector("#highestBuy"),
  latestEntry: document.querySelector("#latestEntry"),
  portfolioMargin: document.querySelector("#portfolioMargin"),
  purchaseChart: document.querySelector("#purchaseChart"),
  chartRange: document.querySelector("#chartRange"),
  refreshPrice: document.querySelector("#refreshPrice"),
  exportCsv: document.querySelector("#exportCsv"),
  sheetUrl: document.querySelector("#sheetUrl"),
  manualGoldRate: document.querySelector("#manualGoldRate"),
  savePriceSettings: document.querySelector("#savePriceSettings"),
  saveSheetUrl: document.querySelector("#saveSheetUrl"),
  loadSheet: document.querySelector("#loadSheet"),
  cancelEdit: document.querySelector("#cancelEdit"),
  syncStatus: document.querySelector("#syncStatus")
};

els.date.valueAsDate = new Date();
els.sheetUrl.value = state.settings.sheetUrl || "";
els.manualGoldRate.value = state.settings.manualGoldRate || "";

render();
refreshLivePrice();
registerServiceWorker();

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.editingId) {
    await saveEditedEntry();
  } else {
    await addNewEntry();
  }
});

els.entriesBody.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete]");
  const editButton = event.target.closest("[data-edit]");

  if (deleteButton) {
    state.entries = state.entries.filter((entry) => entry.id !== deleteButton.dataset.delete);
    if (state.editingId === deleteButton.dataset.delete) resetFormMode();
    saveEntries();
    render();
    return;
  }

  if (editButton) {
    startEdit(editButton.dataset.edit);
  }
});

els.refreshPrice.addEventListener("click", refreshLivePrice);
els.exportCsv.addEventListener("click", exportCsv);

els.savePriceSettings.addEventListener("click", () => {
  state.settings.manualGoldRate = Number(els.manualGoldRate.value || 0);
  saveSettings();
  els.syncStatus.textContent = state.settings.manualGoldRate > 0
    ? "Manual IBJA rate saved."
    : "Enter today's IBJA rate per gram.";
  refreshLivePrice();
});

els.saveSheetUrl.addEventListener("click", () => {
  state.settings.sheetUrl = els.sheetUrl.value.trim();
  saveSettings();
  els.syncStatus.textContent = state.settings.sheetUrl
    ? "Sheet URL saved. New rows will sync automatically."
    : "Sheet sync is off.";
});

els.loadSheet.addEventListener("click", loadFromSheet);
els.cancelEdit.addEventListener("click", resetFormMode);

function loadEntries() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return seedEntries;
  try {
    return JSON.parse(stored);
  } catch {
    return seedEntries;
  }
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function render() {
  const sorted = [...state.entries].sort((a, b) => new Date(b.date) - new Date(a.date));
  els.entriesBody.innerHTML = sorted.map(entry => `
    <tr>
      <td>${formatDate(entry.date)}${entry.syncState === "synced" ? " - synced" : ""}</td>
      <td>${decimalFormatter.format(entry.grams)}</td>
      <td>${formatter.format(entry.pricePerGram)}</td>
      <td>${escapeHtml(entry.notes)}</td>
      <td class="row-actions">
        <button class="edit-button" type="button" data-edit="${entry.id}" aria-label="Edit row">Edit</button>
        <button class="delete-button" type="button" data-delete="${entry.id}" aria-label="Delete row">x</button>
      </td>
    </tr>
  `).join("");

  const totalGrams = sum(state.entries, "grams");
  const invested = state.entries.reduce((total, entry) => total + entry.grams * entry.pricePerGram, 0);
  const averageBuy = totalGrams ? invested / totalGrams : 0;
  const currentValue = state.livePricePerGram ? totalGrams * state.livePricePerGram : null;
  const gain = currentValue === null ? null : currentValue - invested;
  const absoluteReturnPct = gain === null || invested === 0 ? null : (gain / invested) * 100;
  const xirrPct = currentValue === null ? null : calculateXirr(state.entries, currentValue);

  els.entryCount.textContent = `${state.entries.length} row${state.entries.length === 1 ? "" : "s"}`;
  els.totalGrams.textContent = `${decimalFormatter.format(totalGrams)} g`;
  els.investedValue.textContent = formatter.format(invested);
  els.avgBuyPrice.textContent = `Avg buy ${formatter.format(averageBuy)}/g`;
  els.currentValue.textContent = currentValue === null ? "--" : formatter.format(currentValue);
  els.gainLoss.textContent = gain === null ? "--" : formatter.format(gain);
  els.gainLoss.className = gain > 0 ? "positive" : gain < 0 ? "negative" : "";
  els.gainLossPct.textContent = formatReturnLine(absoluteReturnPct, xirrPct);
  els.gainLossPct.className = els.gainLoss.className;

  const best = minBy(state.entries, "pricePerGram");
  const high = maxBy(state.entries, "pricePerGram");
  const latest = sorted[0];
  els.bestBuy.textContent = best ? `${formatter.format(best.pricePerGram)}/g on ${formatDate(best.date)}` : "--";
  els.highestBuy.textContent = high ? `${formatter.format(high.pricePerGram)}/g on ${formatDate(high.date)}` : "--";
  els.latestEntry.textContent = latest ? `${decimalFormatter.format(latest.grams)} g on ${formatDate(latest.date)}` : "--";
  els.portfolioMargin.textContent = state.livePricePerGram
    ? `${formatter.format(state.livePricePerGram - averageBuy)}/g from average`
    : "--";

  drawPurchaseChart(sorted);
}

async function addNewEntry() {
  const entry = {
    id: crypto.randomUUID(),
    date: els.date.value,
    grams: Number(els.grams.value),
    pricePerGram: Number(els.pricePerGram.value),
    notes: els.notes.value.trim(),
    syncState: "local"
  };

  state.entries = [entry, ...state.entries];
  saveEntries();
  render();
  resetFormMode();
  els.formStatus.textContent = "Row added locally.";

  if (state.settings.sheetUrl) {
    await appendEntryToSheet(entry);
    render();
  }
}

async function saveEditedEntry() {
  const entry = state.entries.find(item => item.id === state.editingId);
  if (!entry) return;

  entry.date = els.date.value;
  entry.grams = Number(els.grams.value);
  entry.pricePerGram = Number(els.pricePerGram.value);
  entry.notes = els.notes.value.trim();
  saveEntries();
  render();

  if (state.settings.sheetUrl && entry.sheetRow) {
    await updateEntryInSheet(entry);
    render();
  } else {
    els.formStatus.textContent = "Row updated locally.";
  }

  resetFormMode();
}

function startEdit(id) {
  const entry = state.entries.find(item => item.id === id);
  if (!entry) return;

  state.editingId = id;
  els.date.value = entry.date;
  els.grams.value = entry.grams;
  els.pricePerGram.value = entry.pricePerGram;
  els.notes.value = entry.notes || "";
  els.form.querySelector(".primary-button").textContent = "Save changes";
  els.cancelEdit.classList.remove("hidden");
  els.formStatus.textContent = entry.sheetRow
    ? "Editing row loaded from Google Sheet."
    : "Editing local row.";
}

function resetFormMode() {
  state.editingId = null;
  els.form.reset();
  els.date.valueAsDate = new Date();
  els.form.querySelector(".primary-button").textContent = "Add row";
  els.cancelEdit.classList.add("hidden");
}

async function refreshLivePrice() {
  const manualRate = Number(state.settings.manualGoldRate || 0);
  if (manualRate > 0) {
    state.livePricePerGram = manualRate;
    state.priceUpdatedAt = new Date();
    els.priceSource.textContent = `${formatter.format(manualRate)}/g, manual IBJA 999 rate`;
  } else {
    state.livePricePerGram = null;
    els.priceSource.textContent = "Enter today's IBJA 999 rate/g";
  }
  render();
}

async function appendEntryToSheet(entry) {
  if (!state.settings.sheetUrl) return;
  try {
    await postSheetEntry(entry, "append");
    entry.syncState = "synced";
    saveEntries();
    els.formStatus.textContent = "Row sent to Google Sheets.";
  } catch {
    entry.syncState = "local";
    saveEntries();
    els.formStatus.textContent = "Row saved locally. Sheet sync can retry later.";
  }
}

async function updateEntryInSheet(entry) {
  try {
    await postSheetEntry(entry, "update");
    entry.syncState = "synced";
    saveEntries();
    els.formStatus.textContent = "Row updated in Google Sheets.";
  } catch {
    entry.syncState = "local";
    saveEntries();
    els.formStatus.textContent = "Row updated locally. Sheet update did not complete.";
  }
}

async function postSheetEntry(entry, action) {
  const form = new FormData();
  form.append("action", action);
  form.append("date", entry.date);
  form.append("grams", String(entry.grams));
  form.append("pricePerGram", String(entry.pricePerGram));
  form.append("notes", entry.notes || "");
  if (entry.sheetRow) form.append("sheetRow", String(entry.sheetRow));

  await fetch(state.settings.sheetUrl, {
    method: "POST",
    mode: "no-cors",
    body: form
  });
}

async function loadFromSheet() {
  if (!state.settings.sheetUrl) {
    els.syncStatus.textContent = "Add your Apps Script URL first.";
    return;
  }

  els.syncStatus.textContent = "Loading rows from Google Sheet...";

  try {
    const payload = await fetchSheetRows(state.settings.sheetUrl);
    if (!payload.ok || !Array.isArray(payload.entries)) {
      throw new Error("Sheet response was not readable");
    }

    state.entries = payload.entries.map(entry => ({
      id: crypto.randomUUID(),
      date: normalizeDate(entry.date),
      grams: Number(entry.grams || 0),
      pricePerGram: Number(entry.pricePerGram || 0),
      notes: entry.notes || "",
      sheetRow: entry.sheetRow,
      syncState: "synced"
    })).filter(entry => entry.date && entry.grams > 0 && entry.pricePerGram > 0);

    saveEntries();
    render();
    els.syncStatus.textContent = `Loaded ${state.entries.length} row${state.entries.length === 1 ? "" : "s"} from Google Sheet.`;
  } catch (error) {
    els.syncStatus.textContent = `Could not load from Sheet: ${error.message}`;
  }
}

function fetchSheetRows(sheetUrl) {
  return new Promise((resolve, reject) => {
    const callbackName = `goldLedgerSheet_${Date.now()}_${Math.round(Math.random() * 100000)}`;
    const script = document.createElement("script");
    const url = new URL(sheetUrl);

    url.searchParams.set("callback", callbackName);
    url.searchParams.set("action", "list");

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Apps Script did not respond. Check deployment access is Anyone and redeploy a new version."));
    }, 15000);

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Apps Script URL could not be loaded. Check that the saved URL ends with /exec."));
    };

    script.async = true;
    script.src = url.toString();
    document.body.appendChild(script);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }
  });
}

function exportCsv() {
  const header = ["Date", "Grams", "Price/gm", "Notes"];
  const rows = state.entries.map(entry => [entry.date, entry.grams, entry.pricePerGram, entry.notes]);
  const csv = [header, ...rows]
    .map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "gold-ledger.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function sum(entries, key) {
  return entries.reduce((total, entry) => total + Number(entry[key] || 0), 0);
}

function minBy(entries, key) {
  return entries.reduce((best, entry) => !best || entry[key] < best[key] ? entry : best, null);
}

function maxBy(entries, key) {
  return entries.reduce((best, entry) => !best || entry[key] > best[key] ? entry : best, null);
}

function formatReturnLine(absoluteReturnPct, xirrPct) {
  const absolute = absoluteReturnPct === null ? "--" : `${absoluteReturnPct.toFixed(1)}%`;
  const xirr = xirrPct === null ? "--" : `${xirrPct.toFixed(1)}%`;
  return `Absolute ${absolute} - XIRR ${xirr}`;
}

function calculateXirr(entries, currentValue) {
  const cashflows = entries
    .filter(entry => entry.date && entry.grams > 0 && entry.pricePerGram > 0)
    .map(entry => ({
      date: new Date(`${entry.date}T00:00:00`),
      amount: -(entry.grams * entry.pricePerGram)
    }));

  if (!cashflows.length || currentValue <= 0) return null;

  cashflows.push({
    date: new Date(),
    amount: currentValue
  });

  const hasPositive = cashflows.some(flow => flow.amount > 0);
  const hasNegative = cashflows.some(flow => flow.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  const earliestDate = cashflows.reduce((earliest, flow) => flow.date < earliest ? flow.date : earliest, cashflows[0].date);
  const npv = rate => cashflows.reduce((total, flow) => {
    const years = (flow.date - earliestDate) / (365.25 * 24 * 60 * 60 * 1000);
    return total + flow.amount / Math.pow(1 + rate, years);
  }, 0);

  let low = -0.9999;
  let high = 10;
  let lowValue = npv(low);
  let highValue = npv(high);

  for (let i = 0; i < 20 && lowValue * highValue > 0; i += 1) {
    high *= 2;
    highValue = npv(high);
  }

  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || lowValue * highValue > 0) {
    return null;
  }

  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    const midValue = npv(mid);
    if (Math.abs(midValue) < 0.01) return mid * 100;

    if (lowValue * midValue <= 0) {
      high = mid;
      highValue = midValue;
    } else {
      low = mid;
      lowValue = midValue;
    }
  }

  return ((low + high) / 2) * 100;
}

function drawPurchaseChart(entries) {
  const canvas = els.purchaseChart;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const ordered = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!ordered.length) {
    els.chartRange.textContent = "--";
    ctx.fillStyle = "#66736e";
    ctx.font = "16px system-ui";
    ctx.fillText("No purchases yet", 28, height / 2);
    return;
  }

  const prices = ordered.map(entry => entry.pricePerGram);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const padding = Math.max((max - min) * 0.12, 250);
  const floor = Math.max(0, min - padding);
  const ceiling = max + padding;
  const left = 72;
  const right = 24;
  const top = 22;
  const bottom = 58;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xFor = index => left + (ordered.length === 1 ? plotWidth / 2 : (plotWidth * index) / (ordered.length - 1));
  const yFor = price => top + plotHeight - ((price - floor) / (ceiling - floor || 1)) * plotHeight;

  els.chartRange.textContent = `${formatter.format(min)}/g - ${formatter.format(max)}/g`;

  ctx.strokeStyle = "#dce3de";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#66736e";
  ctx.font = "13px system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i < 4; i += 1) {
    const y = top + (plotHeight * i) / 3;
    const value = ceiling - ((ceiling - floor) * i) / 3;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();
    ctx.fillText(formatter.format(value), left - 10, y);
  }

  ctx.strokeStyle = "#165a4a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ordered.forEach((entry, index) => {
    const x = xFor(index);
    const y = yFor(entry.pricePerGram);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ordered.forEach((entry, index) => {
    const x = xFor(index);
    const y = yFor(entry.pricePerGram);
    ctx.fillStyle = "#b8882e";
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#17201d";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "12px system-ui";
    ctx.fillText(shortDate(entry.date), x, height - bottom + 18);
  });
}

function formatDate(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function shortDate(value) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short"
  }).format(new Date(`${value}T00:00:00`));
}

function normalizeDate(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value;

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const parts = String(value).split(/[/-]/).map(Number);
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return "";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch {
      // The app still works without install/offline support.
    }
  }
}
