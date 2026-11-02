import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import BASE_URL from "./config";

const defaultTestParam = () => ({ id: crypto.randomUUID(), value: "" });
const pollingIntervalMs = 4000;

const googleAppsScriptCode = `function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  sheet.appendRow([
    data.name || "Unknown",
    data.phone || "",
    data.triggerMessage || "",
    data.timestamp || new Date().toISOString()
  ]);
  return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
    .setMimeType(ContentService.MimeType.JSON);
}`;

function getStatusTone(status) {
  switch (status) {
    case "completed":
      return "good";
    case "processing":
      return "warm";
    case "failed":
      return "bad";
    default:
      return "neutral";
  }
}

function formatJson(value) {
  if (!value) return "";
  return JSON.stringify(value, null, 2);
}

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function buildTestPayload({ to, templateName, languageCode, params }) {
  return {
    to,
    type: "template",
    templateName,
    languageCode,
    components: [
      {
        type: "body",
        parameters: params
          .map((param) => param.value.trim())
          .filter(Boolean)
          .map((text) => ({
            type: "text",
            text
          }))
      }
    ]
  };
}

export default function App() {
  const [activeView, setActiveView] = useState("campaigns");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [copiedId, setCopiedId] = useState(null);

  // Send Test State
  const [testForm, setTestForm] = useState({
    to: "919580174041",
    templateName: "seminar_feedback",
    languageCode: "en_US"
  });
  const [testParams, setTestParams] = useState([
    { id: "1", value: "Shubham" },
    { id: "2", value: "visit to our seminar" },
    { id: "3", value: "March 19, 2026" },
    { id: "4", value: "5" }
  ]);
  const [testState, setTestState] = useState({
    loading: false,
    error: "",
    response: null
  });

  // Campaign Form State
  const [campaignForm, setCampaignForm] = useState({
    templateName: "",
    languageCode: "en_US",
    file: null
  });
  const [isDragOver, setIsDragOver] = useState(false);
  const [campaignState, setCampaignState] = useState({
    loading: false,
    error: "",
    startedCampaignId: "",
    response: null
  });

  // Monitor State
  const [monitorId, setMonitorId] = useState("");
  const [monitorState, setMonitorState] = useState({
    loading: false,
    error: "",
    data: null
  });
  const [isPolling, setIsPolling] = useState(false);

  // Campaigns List State
  const [campaignListState, setCampaignListState] = useState({
    loading: false,
    error: "",
    data: []
  });

  // QR Code & Lead Capture State
  const [qrForm, setQrForm] = useState({
    phone: "919580174041",
    triggerText: "JOIN_SUMMIT"
  });
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [leadsState, setLeadsState] = useState({
    loading: false,
    error: "",
    data: []
  });

  // Google Sheet Sync State
  const [googleSheetUrl, setGoogleSheetUrl] = useState("");
  const [googleSheetTestState, setGoogleSheetTestState] = useState({
    loading: false,
    message: "",
    error: ""
  });
  const [showAppsScript, setShowAppsScript] = useState(false);

  const pollRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        window.clearTimeout(pollRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeView === "campaigns") {
      fetchCampaigns();
    } else if (activeView === "leads") {
      fetchLeads();
      fetchGoogleSheetConfig();
    }
  }, [activeView]);

  // Generate QR Code whenever phone or trigger keyword changes
  useEffect(() => {
    const cleanPhone = qrForm.phone.replace(/\D/g, "");
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(qrForm.triggerText)}`;
    QRCode.toDataURL(waUrl, {
      width: 420,
      margin: 2,
      color: {
        dark: "#0b141a",
        light: "#ffffff"
      }
    })
      .then(setQrDataUrl)
      .catch((err) => console.error("QR generation error", err));
  }, [qrForm.phone, qrForm.triggerText]);

  async function requestJson(url, options) {
    const requestUrl = `${BASE_URL}${url}`;
    const response = await fetch(requestUrl, options);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        data?.error || data?.message || "The server could not process the request.";
      console.error("API request failed", {
        url: requestUrl,
        status: response.status,
        response: data
      });
      throw new Error(message);
    }

    return data;
  }

  function copyToClipboard(text, idKey) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text);
    setCopiedId(idKey || text);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function queueNextPoll(campaignId) {
    if (!campaignId) return;
    pollRef.current = window.setTimeout(() => {
      fetchCampaignStatus(campaignId, { keepPolling: true });
    }, pollingIntervalMs);
  }

  async function fetchCampaignStatus(campaignId, options = {}) {
    const { keepPolling = false } = options;
    const id = (campaignId || monitorId).trim();

    if (!id) {
      setMonitorState((current) => ({
        ...current,
        error: "Enter a valid Campaign ID to check telemetry."
      }));
      return;
    }

    if (pollRef.current) {
      window.clearTimeout(pollRef.current);
    }

    setMonitorState((current) => ({
      ...current,
      loading: true,
      error: ""
    }));

    try {
      const result = await requestJson(`/campaign/${id}`);
      const status = result.data;

      setMonitorId(id);
      setMonitorState({
        loading: false,
        error: "",
        data: status
      });

      const shouldContinue = keepPolling && status.status === "processing";
      setIsPolling(shouldContinue);

      if (shouldContinue) {
        queueNextPoll(id);
      }
    } catch (error) {
      console.error("Failed to fetch campaign status", error);
      setIsPolling(false);
      setMonitorState({
        loading: false,
        error: error.message,
        data: null
      });
    }
  }

  async function fetchCampaigns() {
    setCampaignListState((current) => ({
      ...current,
      loading: true,
      error: ""
    }));

    try {
      const result = await requestJson("/campaign");
      setCampaignListState({
        loading: false,
        error: "",
        data: result.data || []
      });
    } catch (error) {
      console.error("Failed to fetch campaigns", error);
      setCampaignListState({
        loading: false,
        error: error.message,
        data: []
      });
    }
  }

  async function fetchLeads() {
    setLeadsState((curr) => ({ ...curr, loading: true, error: "" }));
    try {
      const result = await requestJson("/leads");
      setLeadsState({
        loading: false,
        error: "",
        data: result.data || []
      });
    } catch (error) {
      console.error("Failed to fetch leads", error);
      setLeadsState({
        loading: false,
        error: error.message,
        data: []
      });
    }
  }

  async function fetchGoogleSheetConfig() {
    try {
      const res = await requestJson("/leads/google-sheet");
      if (res.url) {
        setGoogleSheetUrl(res.url);
      }
    } catch (err) {
      console.warn("Failed to load Google Sheet config:", err);
    }
  }

  async function handleSaveGoogleSheetUrl() {
    setGoogleSheetTestState({ loading: false, message: "", error: "" });
    try {
      await requestJson("/leads/google-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: googleSheetUrl })
      });
      setGoogleSheetTestState({
        loading: false,
        message: "Google Sheet Webhook URL saved successfully!",
        error: ""
      });
      setTimeout(() => setGoogleSheetTestState((c) => ({ ...c, message: "" })), 4000);
    } catch (err) {
      setGoogleSheetTestState({ loading: false, message: "", error: err.message });
    }
  }

  async function handleTestGoogleSheet() {
    setGoogleSheetTestState({ loading: true, message: "", error: "" });
    try {
      const res = await requestJson("/leads/test-google-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: googleSheetUrl })
      });
      setGoogleSheetTestState({
        loading: false,
        message: res.message || "✓ Row written to Google Sheet successfully!",
        error: ""
      });
    } catch (err) {
      setGoogleSheetTestState({
        loading: false,
        message: "",
        error: err.message || "Failed to write row to Google Sheet"
      });
    }
  }

  function handleDownloadExcel() {
    window.open(`${BASE_URL}/leads/export`, "_blank");
  }

  function handleDownloadQr() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `whatsapp_qr_${qrForm.triggerText || "invite"}.png`;
    a.click();
  }

  async function handleSendTest(event) {
    event.preventDefault();
    setTestState({
      loading: true,
      error: "",
      response: null
    });

    try {
      const result = await requestJson("/send-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildTestPayload({ ...testForm, params: testParams }))
      });

      setTestState({
        loading: false,
        error: "",
        response: result
      });
    } catch (error) {
      console.error("Failed to send test message", error);
      setTestState({
        loading: false,
        error: error.message,
        response: null
      });
    }
  }

  async function handleStartCampaign(event) {
    event.preventDefault();

    if (!campaignForm.file) {
      setCampaignState({
        loading: false,
        error: "Please select or drop a valid CSV file before launching.",
        startedCampaignId: "",
        response: null
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", campaignForm.file);
    formData.append("templateName", campaignForm.templateName.trim());
    formData.append("languageCode", campaignForm.languageCode.trim() || "en_US");

    setCampaignState({
      loading: true,
      error: "",
      startedCampaignId: "",
      response: null
    });

    try {
      const result = await requestJson("/campaign", {
        method: "POST",
        body: formData
      });

      setCampaignState({
        loading: false,
        error: "",
        startedCampaignId: result.campaignId,
        response: result
      });

      fetchCampaigns();
      setActiveView("monitor");
      setMonitorId(result.campaignId);
      fetchCampaignStatus(result.campaignId, { keepPolling: true });
    } catch (error) {
      console.error("Failed to start campaign", error);
      setCampaignState({
        loading: false,
        error: error.message,
        startedCampaignId: "",
        response: null
      });
    }
  }

  function handleFileDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.name.endsWith(".csv")) {
      setCampaignForm((curr) => ({ ...curr, file: droppedFile }));
    } else {
      setCampaignState((curr) => ({
        ...curr,
        error: "Please upload a file with .csv extension."
      }));
    }
  }

  function updateParam(id, value) {
    setTestParams((current) =>
      current.map((param) => (param.id === id ? { ...param, value } : param))
    );
  }

  function addParamField() {
    setTestParams((current) => [...current, defaultTestParam()]);
  }

  function removeParamField(id) {
    setTestParams((current) =>
      current.length === 1 ? current : current.filter((param) => param.id !== id)
    );
  }

  function openMonitor(campaignId, status) {
    setActiveView("monitor");
    setMonitorId(campaignId);
    fetchCampaignStatus(campaignId, {
      keepPolling: status === "processing"
    });
  }

  const campaigns = campaignListState.data;
  const filteredCampaigns = campaigns.filter((item) => {
    const matchesSearch =
      (item.templateName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.id || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ? true : item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalCampaignsCount = campaigns.length;
  const totalMessagesSent = campaigns.reduce((acc, c) => acc + (c.sent || 0), 0);
  const totalDelivered = campaigns.reduce((acc, c) => acc + (c.delivered || 0), 0);
  const totalFailed = campaigns.reduce((acc, c) => acc + (c.failed || 0), 0);
  const aggregateSuccessRate =
    totalDelivered + totalFailed > 0
      ? Math.round((totalDelivered / (totalDelivered + totalFailed)) * 100)
      : 100;

  const statusData = monitorState.data;
  const progressPercent = statusData && statusData.total > 0
    ? Math.min(100, Math.round(((statusData.delivered + statusData.failed) / statusData.total) * 100))
    : 0;

  const cleanPhone = qrForm.phone.replace(/\D/g, "");
  const waDeepLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(qrForm.triggerText)}`;

  const pageMeta = {
    campaigns: {
      eyebrow: "Campaign Center",
      title: "Broadcast Campaigns",
      description: "Manage, track and inspect bulk WhatsApp template broadcasts across all runs.",
      actionLabel: "+ Launch New Campaign",
      actionView: "campaign"
    },
    campaign: {
      eyebrow: "Broadcast Dispatcher",
      title: "Launch Bulk Campaign",
      description: "Upload audience CSV, map template parameters, and stream delivery with automatic rate-limiting.",
      actionLabel: "View All Campaigns",
      actionView: "campaigns"
    },
    leads: {
      eyebrow: "Inbound Funnel",
      title: "Google Sheet Sync & QR Leads",
      description: "Generate Click-to-WhatsApp QR codes and stream captured user leads directly into your Google Sheet.",
      actionLabel: "Backup CSV Export",
      actionCallback: handleDownloadExcel
    },
    test: {
      eyebrow: "Template Studio",
      title: "Test Send & Preview",
      description: "Simulate WhatsApp messages with live parameter binding before blasting your audience.",
      actionLabel: "+ Launch Campaign",
      actionView: "campaign"
    },
    monitor: {
      eyebrow: "Telemetry Engine",
      title: "Live Delivery Telemetry",
      description: "Real-time delivery confirmation, webhook tracking, retry monitoring and error auditing.",
      actionLabel: "Campaign Library",
      actionView: "campaigns"
    }
  }[activeView];

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo-glow">
            <svg className="brand-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.34 5L2 22l5.14-1.31A9.96 9.96 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm.05 17.5c-1.6 0-3.09-.45-4.37-1.24l-.31-.19-3.24.83.87-3.15-.2-.33A7.95 7.95 0 014.05 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 7.5-8 7.5z"
                fill="currentColor"
              />
              <circle cx="12" cy="12" r="3" fill="#25D366" />
            </svg>
          </div>
          <div className="brand-text">
            <h2>Gossip</h2>
            <span className="brand-badge">WhatsApp Engine</span>
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            type="button"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              {sidebarCollapsed ? (
                <path d="M9 18l6-6-6-6" />
              ) : (
                <path d="M15 18l-6-6 6-6" />
              )}
            </svg>
          </button>
        </div>

        <div className="sidebar-meta">
          <div className="api-status-pill">
            <span className="status-dot-pulse" />
            <span className="api-status-label">Meta Cloud API v21.0</span>
          </div>
        </div>

        <p className="sidebar-section-label">Main Navigation</p>
        <nav className="nav">
          <button
            className={activeView === "campaigns" ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView("campaigns")}
            type="button"
          >
            <span className="nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </span>
            <span className="nav-title">Campaigns</span>
            <span className="nav-count">{campaigns.length}</span>
          </button>

          <button
            className={activeView === "campaign" ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView("campaign")}
            type="button"
          >
            <span className="nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span className="nav-title">New Campaign</span>
          </button>

          <button
            className={activeView === "leads" ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView("leads")}
            type="button"
          >
            <span className="nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h3M20 14v3" />
              </svg>
            </span>
            <span className="nav-title">Google Sheets & QR</span>
            <span className="nav-count green-count">{leadsState.data.length}</span>
          </button>

          <button
            className={activeView === "test" ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView("test")}
            type="button"
          >
            <span className="nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </span>
            <span className="nav-title">Send Test</span>
          </button>

          <button
            className={activeView === "monitor" ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView("monitor")}
            type="button"
          >
            <span className="nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </span>
            <span className="nav-title">Live Monitor</span>
            {isPolling && <span className="nav-live-indicator">LIVE</span>}
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="rate-limit-card">
            <div className="rate-limit-header">
              <span className="rate-title">Google Sheets</span>
              <span className="rate-value">{googleSheetUrl ? "Connected" : "Ready"}</span>
            </div>
            <p className="rate-desc">Leads stream directly to your connected Google Sheet.</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-panel">
        {/* Topbar Header */}
        <header className="topbar">
          <div className="topbar-info">
            <div className="topbar-breadcrumb">
              <span>Gossip</span>
              <span className="separator">/</span>
              <span className="current">{pageMeta.eyebrow}</span>
            </div>
            <h1 className="page-heading">{pageMeta.title}</h1>
            <p className="page-subheading">{pageMeta.description}</p>
          </div>
          <div className="topbar-actions">
            {pageMeta.actionCallback ? (
              <button
                className="action-pill-button excel-btn"
                onClick={pageMeta.actionCallback}
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>{pageMeta.actionLabel}</span>
              </button>
            ) : (
              <button
                className="action-pill-button"
                onClick={() => setActiveView(pageMeta.actionView)}
                type="button"
              >
                {pageMeta.actionLabel}
              </button>
            )}
          </div>
        </header>

        {/* Global Metric Ribbon */}
        <section className="metrics-ribbon">
          <div className="metric-tile">
            <div className="metric-tile-header">
              <span className="metric-tile-label">Total Campaigns</span>
              <span className="metric-icon-bubble green">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </span>
            </div>
            <div className="metric-tile-body">
              <strong className="metric-tile-val">{totalCampaignsCount}</strong>
              <span className="metric-tile-sub">Archived in SQLite</span>
            </div>
          </div>

          <div className="metric-tile">
            <div className="metric-tile-header">
              <span className="metric-tile-label">Captured Leads</span>
              <span className="metric-icon-bubble emerald">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
            </div>
            <div className="metric-tile-body">
              <strong className="metric-tile-val">{leadsState.data.length}</strong>
              <span className="metric-tile-sub">Synced to Google Sheet</span>
            </div>
          </div>

          <div className="metric-tile">
            <div className="metric-tile-header">
              <span className="metric-tile-label">Delivery Health</span>
              <span className="metric-icon-bubble emerald">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            </div>
            <div className="metric-tile-body">
              <strong className="metric-tile-val">{aggregateSuccessRate}%</strong>
              <span className="metric-tile-sub">{totalDelivered} delivered / {totalFailed} failed</span>
            </div>
          </div>

          <div className="metric-tile">
            <div className="metric-tile-header">
              <span className="metric-tile-label">Google Sheet Status</span>
              <span className={`metric-icon-bubble ${googleSheetUrl ? "good" : "neutral"}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="21" x2="9" y2="9" />
                </svg>
              </span>
            </div>
            <div className="metric-tile-body">
              <strong className="metric-tile-val">{googleSheetUrl ? "Live Sync" : "Not Set"}</strong>
              <span className="metric-tile-sub">
                {googleSheetUrl ? "Apps Script connected" : "Paste Webhook URL"}
              </span>
            </div>
          </div>
        </section>

        {/* VIEW: QR CODE & GOOGLE SHEETS LEADS FUNNEL */}
        {activeView === "leads" && (
          <div className="two-column-layout">
            {/* Left Column: QR Generator Studio */}
            <div className="glass-panel qr-studio-panel">
              <div className="guide-header">
                <span className="badge-chip">Inbound Funnel Studio</span>
                <h3>Click-to-WhatsApp QR Generator</h3>
                <p>When customers scan this code, WhatsApp opens with your prefilled keyword. Tapping Send automatically captures their verified phone and name directly into your Google Sheet.</p>
              </div>

              <div className="qr-controls-form">
                <div className="input-group">
                  <label>
                    <span className="label-text">Your WhatsApp Business Number</span>
                    <span className="label-req">*</span>
                  </label>
                  <input
                    type="text"
                    className="text-input"
                    value={qrForm.phone}
                    onChange={(e) => setQrForm((curr) => ({ ...curr, phone: e.target.value }))}
                    placeholder="e.g. 919580174041"
                  />
                </div>

                <div className="input-group">
                  <label>
                    <span className="label-text">Prefilled Trigger Keyword / Message</span>
                    <span className="label-req">*</span>
                  </label>
                  <input
                    type="text"
                    className="text-input"
                    value={qrForm.triggerText}
                    onChange={(e) => setQrForm((curr) => ({ ...curr, triggerText: e.target.value }))}
                    placeholder="e.g. JOIN_SUMMIT or CLAIM_OFFER"
                  />
                </div>

                {/* Direct wa.me Deep Link */}
                <div className="deep-link-box">
                  <div className="deep-link-info">
                    <span className="deep-link-label">Direct wa.me URL</span>
                    <code className="deep-link-url">{waDeepLink}</code>
                  </div>
                  <button
                    className="copy-link-btn"
                    onClick={() => copyToClipboard(waDeepLink, "wa_link")}
                    type="button"
                  >
                    {copiedId === "wa_link" ? "Copied!" : "Copy URL"}
                  </button>
                </div>
              </div>

              {/* QR Code Canvas Card */}
              <div className="qr-display-card">
                <div className="qr-image-wrapper">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="WhatsApp QR Code" className="qr-img" />
                  ) : (
                    <div className="spinner" />
                  )}
                  <div className="qr-center-badge">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="#25D366">
                      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.34 5L2 22l5.14-1.31A9.96 9.96 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm.05 17.5c-1.6 0-3.09-.45-4.37-1.24l-.31-.19-3.24.83.87-3.15-.2-.33A7.95 7.95 0 014.05 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 7.5-8 7.5z" />
                    </svg>
                  </div>
                </div>

                <div className="qr-card-actions">
                  <button
                    className="download-qr-btn"
                    onClick={handleDownloadQr}
                    type="button"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>Download QR Image (PNG)</span>
                  </button>

                  <a
                    href={waDeepLink}
                    target="_blank"
                    rel="noreferrer"
                    className="test-link-btn"
                  >
                    <span>Open in WhatsApp Web ↗</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Right Column: Google Sheet Integration & Captured Leads */}
            <div className="glass-panel leads-table-panel">
              {/* Google Sheets Sync Card */}
              <div className="google-sheet-sync-card">
                <div className="sync-card-header">
                  <div className="sync-title-group">
                    <span className="google-sheet-icon">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="3" width="18" height="18" rx="2" fill="#0F9D58" />
                        <line x1="3" y1="9" x2="21" y2="9" stroke="#ffffff" strokeWidth="1.5" />
                        <line x1="3" y1="15" x2="21" y2="15" stroke="#ffffff" strokeWidth="1.5" />
                        <line x1="9" y1="9" x2="9" y2="21" stroke="#ffffff" strokeWidth="1.5" />
                        <line x1="15" y1="9" x2="15" y2="21" stroke="#ffffff" strokeWidth="1.5" />
                      </svg>
                    </span>
                    <div>
                      <h4>Google Sheets Live Sync</h4>
                      <p>Stream every inbound QR scan directly into your active Google Spreadsheet.</p>
                    </div>
                  </div>
                  <span className={`sheet-status-pill ${googleSheetUrl ? "connected" : "not-connected"}`}>
                    <span className="status-dot-pulse" />
                    {googleSheetUrl ? "Sync Active" : "Not Configured"}
                  </span>
                </div>

                {/* Google Sheet Webhook Input */}
                <div className="sync-input-row">
                  <input
                    type="text"
                    className="sheet-input"
                    value={googleSheetUrl}
                    onChange={(e) => setGoogleSheetUrl(e.target.value)}
                    placeholder="Paste Apps Script Web App URL: https://script.google.com/macros/s/.../exec"
                  />
                  <button
                    className="save-sheet-btn"
                    onClick={handleSaveGoogleSheetUrl}
                    type="button"
                  >
                    Save URL
                  </button>
                  <button
                    className="test-sheet-btn"
                    onClick={handleTestGoogleSheet}
                    disabled={googleSheetTestState.loading || !googleSheetUrl}
                    type="button"
                  >
                    {googleSheetTestState.loading ? "Pinging..." : "Test Row"}
                  </button>
                </div>

                {googleSheetTestState.message && (
                  <div className="sheet-alert success">
                    <span>{googleSheetTestState.message}</span>
                  </div>
                )}

                {googleSheetTestState.error && (
                  <div className="sheet-alert error">
                    <span>{googleSheetTestState.error}</span>
                  </div>
                )}

                {/* Toggle Apps Script Helper */}
                <div className="script-helper-toggle-row">
                  <button
                    type="button"
                    className="script-toggle-btn"
                    onClick={() => setShowAppsScript(!showAppsScript)}
                  >
                    {showAppsScript ? "▲ Hide 30-Second Setup Script" : "▼ How to connect Google Sheets (30-Second Setup Script)"}
                  </button>
                </div>

                {showAppsScript && (
                  <div className="apps-script-drawer">
                    <div className="script-steps">
                      <p><strong>Step 1:</strong> In your Google Sheet, click <code>Extensions</code> → <code>Apps Script</code>.</p>
                      <p><strong>Step 2:</strong> Replace everything in <code>Code.gs</code> with this script:</p>
                    </div>
                    <div className="script-code-block">
                      <pre>{googleAppsScriptCode}</pre>
                      <button
                        type="button"
                        className="copy-script-btn"
                        onClick={() => copyToClipboard(googleAppsScriptCode, "script_code")}
                      >
                        {copiedId === "script_code" ? "Copied!" : "Copy Script"}
                      </button>
                    </div>
                    <div className="script-steps">
                      <p><strong>Step 3:</strong> Click <strong>Deploy</strong> → <strong>New deployment</strong> → Type: <strong>Web app</strong>.</p>
                      <p><strong>Step 4:</strong> Set <em>"Who has access"</em> to <strong>Anyone</strong>, click <strong>Deploy</strong>, and copy the Web app URL into the box above!</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Captured Leads Table */}
              <div className="leads-panel-header">
                <div>
                  <div className="leads-title-row">
                    <h3>Captured Inbound Contacts</h3>
                    <span className="count-tag green-tag">{leadsState.data.length} Leads</span>
                  </div>
                  <p>Inbound user scans are automatically captured and synchronized with your Google Sheet.</p>
                </div>

                <div className="leads-header-actions">
                  <button
                    className="sync-leads-btn"
                    onClick={fetchLeads}
                    type="button"
                    title="Refresh leads"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 4v6h-6M1 20v-6h6" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    <span>Sync</span>
                  </button>
                </div>
              </div>

              {leadsState.error && (
                <div className="alert-banner error">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{leadsState.error}</span>
                </div>
              )}

              <div className="leads-table-container">
                {leadsState.loading ? (
                  <div className="table-loader">
                    <div className="spinner" />
                    <p>Loading captured leads...</p>
                  </div>
                ) : leadsState.data.length > 0 ? (
                  <div className="leads-data-table">
                    <div className="leads-table-head">
                      <div>Profile Name</div>
                      <div>Phone Number</div>
                      <div>Trigger Keyword</div>
                      <div>Captured At</div>
                    </div>

                    <div className="leads-table-body">
                      {leadsState.data.map((lead, idx) => (
                        <div className="leads-table-row" key={lead.id || idx}>
                          <div className="lead-name-cell">
                            <span className="lead-avatar-bubble">
                              {(lead.name || "U")[0].toUpperCase()}
                            </span>
                            <strong>{lead.name || "WhatsApp User"}</strong>
                          </div>

                          <div className="lead-phone-cell">
                            <code className="phone-tag">{lead.phone}</code>
                          </div>

                          <div className="lead-msg-cell">
                            <span className="trigger-chip">{lead.triggerMessage || "Inbound Scan"}</span>
                          </div>

                          <div className="lead-date-cell">
                            <span>{formatDate(lead.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-graphic">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                        <path d="M14 14h3v3h-3zM18 18h3v3h-3z" />
                      </svg>
                    </div>
                    <h4>No Inbound Leads Yet</h4>
                    <p>Once deployed, when users scan your QR code and send a WhatsApp message, their details will automatically write into your Google Sheet and show up here!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 1: CAMPAIGNS LIBRARY */}
        {activeView === "campaigns" && (
          <section className="glass-panel">
            <div className="glass-panel-header">
              <div className="panel-title-group">
                <h3>Campaign Library</h3>
                <p>All bulk broadcast records retrieved from SQLite database.</p>
              </div>
              <div className="panel-controls">
                <div className="search-bar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search template or campaign ID..."
                  />
                  {searchTerm && (
                    <button className="clear-btn" onClick={() => setSearchTerm("")} type="button">
                      ×
                    </button>
                  )}
                </div>

                <div className="filter-chips">
                  {["all", "processing", "completed"].map((st) => (
                    <button
                      key={st}
                      type="button"
                      className={`filter-chip ${statusFilter === st ? "active" : ""}`}
                      onClick={() => setStatusFilter(st)}
                    >
                      {st.toUpperCase()}
                    </button>
                  ))}
                </div>

                <button className="refresh-button" onClick={fetchCampaigns} type="button" title="Refresh list">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 4v6h-6M1 20v-6h6" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  <span>Sync</span>
                </button>
              </div>
            </div>

            {campaignListState.error && (
              <div className="alert-banner error">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{campaignListState.error}</span>
              </div>
            )}

            <div className="table-container">
              {campaignListState.loading ? (
                <div className="table-loader">
                  <div className="spinner" />
                  <p>Querying SQLite database...</p>
                </div>
              ) : filteredCampaigns.length > 0 ? (
                <div className="campaign-data-table">
                  <div className="table-head">
                    <div className="col-template">Template & ID</div>
                    <div className="col-created">Launched</div>
                    <div className="col-counts">Queued</div>
                    <div className="col-counts">Sent</div>
                    <div className="col-counts">Delivered</div>
                    <div className="col-counts">Failed</div>
                    <div className="col-progress">Progress</div>
                    <div className="col-status">Status</div>
                    <div className="col-action">Action</div>
                  </div>

                  <div className="table-body">
                    {filteredCampaigns.map((camp) => {
                      const completedCount = (camp.delivered || 0) + (camp.failed || 0);
                      const pct = camp.total > 0 ? Math.min(100, Math.round((completedCount / camp.total) * 100)) : 0;
                      return (
                        <div className="table-row" key={camp.id}>
                          <div className="col-template">
                            <div className="template-primary">
                              <span className="template-name">{camp.templateName || "Unknown Template"}</span>
                              <div className="id-copy-group">
                                <span className="mono-id">{camp.id.slice(0, 8)}...{camp.id.slice(-4)}</span>
                                <button
                                  className="icon-copy-btn"
                                  onClick={() => copyToClipboard(camp.id, camp.id)}
                                  type="button"
                                  title="Copy Campaign UUID"
                                >
                                  {copiedId === camp.id ? (
                                    <span className="copied-tag">✓</span>
                                  ) : (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="col-created">
                            <span className="created-text">{formatDate(camp.createdAt)}</span>
                          </div>

                          <div className="col-counts">
                            <span className="count-pill neutral">{camp.queued}</span>
                          </div>

                          <div className="col-counts">
                            <span className="count-pill blue">{camp.sent}</span>
                          </div>

                          <div className="col-counts">
                            <span className="count-pill green">{camp.delivered}</span>
                          </div>

                          <div className="col-counts">
                            <span className={`count-pill ${camp.failed > 0 ? "red" : "neutral"}`}>
                              {camp.failed}
                            </span>
                          </div>

                          <div className="col-progress">
                            <div className="mini-progress-track">
                              <div
                                className="mini-progress-bar"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="mini-pct">{pct}%</span>
                          </div>

                          <div className="col-status">
                            <span className={`status-badge ${getStatusTone(camp.status)}`}>
                              <span className="status-badge-dot" />
                              {camp.status}
                            </span>
                          </div>

                          <div className="col-action">
                            <button
                              className="view-telemetry-btn"
                              onClick={() => openMonitor(camp.id, camp.status)}
                              type="button"
                            >
                              <span>Telemetry</span>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-graphic">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h4>No Campaigns Found</h4>
                  <p>
                    {searchTerm
                      ? `No campaigns match "${searchTerm}". Try adjusting your search query.`
                      : "You have not launched any bulk campaigns yet. Get started with your first CSV broadcast!"}
                  </p>
                  <button
                    className="primary-action-btn"
                    onClick={() => setActiveView("campaign")}
                    type="button"
                  >
                    + Launch New Campaign
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* VIEW 2: LAUNCH NEW CAMPAIGN */}
        {activeView === "campaign" && (
          <div className="two-column-layout">
            {/* Guide Card */}
            <div className="glass-panel guide-panel">
              <div className="guide-header">
                <span className="badge-chip">Operator Checklist</span>
                <h3>Campaign Best Practices</h3>
                <p>Follow these guidelines to ensure maximum delivery rates and zero Meta policy rejections.</p>
              </div>

              <div className="checklist-items">
                <div className="checklist-item">
                  <div className="check-icon">✓</div>
                  <div>
                    <strong>Approved Meta Template</strong>
                    <p>Ensure the template name matches your WhatsApp Manager template exactly.</p>
                  </div>
                </div>

                <div className="checklist-item">
                  <div className="check-icon">✓</div>
                  <div>
                    <strong>Country Code Required</strong>
                    <p>Numbers must include country codes without plus signs or spaces (e.g., <code>919580174041</code>).</p>
                  </div>
                </div>

                <div className="checklist-item">
                  <div className="check-icon">✓</div>
                  <div>
                    <strong>CSV Columns Format</strong>
                    <p>First column must be <code>phone</code>, followed by dynamic parameters: <code>param1,param2,param3</code>.</p>
                  </div>
                </div>
              </div>

              <div className="sample-csv-preview">
                <div className="sample-header">
                  <span>Sample CSV Format</span>
                  <button
                    className="sample-copy-btn"
                    onClick={() => copyToClipboard("phone,param1,param2,param3\n919580174041,Shubham,VIP Pass,Hall A\n919876543210,Aarav,General,Hall B", "csv_sample")}
                    type="button"
                  >
                    {copiedId === "csv_sample" ? "Copied!" : "Copy Template"}
                  </button>
                </div>
                <pre className="code-block">
phone,param1,param2,param3
919580174041,Shubham,VIP Pass,Hall A
919876543210,Aarav,General,Hall B
                </pre>
              </div>
            </div>

            {/* Campaign Form */}
            <div className="glass-panel form-panel-wrap">
              <div className="form-panel-header">
                <h3>Launch Audience Broadcast</h3>
                <p>Upload contacts and stream through the rate-limited dispatch engine.</p>
              </div>

              <form onSubmit={handleStartCampaign} className="campaign-form">
                {/* Drag and Drop Zone */}
                <div
                  className={`dropzone ${isDragOver ? "dragover" : ""} ${campaignForm.file ? "has-file" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setCampaignForm((curr) => ({ ...curr, file: f }));
                    }}
                  />

                  {campaignForm.file ? (
                    <div className="file-selected-view">
                      <div className="file-icon-wrap">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                      </div>
                      <div className="file-details">
                        <strong>{campaignForm.file.name}</strong>
                        <span>{(campaignForm.file.size / 1024).toFixed(1)} KB • CSV Audience</span>
                      </div>
                      <button
                        type="button"
                        className="file-remove-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCampaignForm((curr) => ({ ...curr, file: null }));
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="dropzone-idle">
                      <div className="upload-arrow-glow">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                      </div>
                      <strong>Drop audience CSV here or click to browse</strong>
                      <span>Supports UTF-8 CSV with phone and template parameter columns</span>
                    </div>
                  )}
                </div>

                <div className="input-grid">
                  <div className="input-group">
                    <label>
                      <span className="label-text">Meta Template Name</span>
                      <span className="label-req">*</span>
                    </label>
                    <input
                      type="text"
                      className="text-input"
                      value={campaignForm.templateName}
                      onChange={(e) => setCampaignForm((curr) => ({ ...curr, templateName: e.target.value }))}
                      placeholder="e.g. seminar_feedback or order_update"
                      required
                    />
                  </div>

                  <div className="input-group">
                    <label>
                      <span className="label-text">Language Code</span>
                    </label>
                    <input
                      type="text"
                      className="text-input"
                      value={campaignForm.languageCode}
                      onChange={(e) => setCampaignForm((curr) => ({ ...curr, languageCode: e.target.value }))}
                      placeholder="en_US"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="submit-broadcast-btn"
                  disabled={campaignState.loading}
                >
                  {campaignState.loading ? (
                    <>
                      <div className="spinner small" />
                      <span>Ingesting & Queuing Messages...</span>
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      <span>Launch WhatsApp Campaign</span>
                    </>
                  )}
                </button>
              </form>

              {campaignState.error && (
                <div className="alert-banner error">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{campaignState.error}</span>
                </div>
              )}

              {campaignState.startedCampaignId && (
                <div className="success-banner-card">
                  <div className="success-icon-wrap">✓</div>
                  <div className="success-info">
                    <h4>Campaign Queued Successfully</h4>
                    <p>Dispatch worker is streaming messages with a 2-second delay.</p>
                    <div className="campaign-launched-id">
                      <span>ID:</span>
                      <code>{campaignState.startedCampaignId}</code>
                    </div>
                  </div>
                  <button
                    className="monitor-jump-btn"
                    onClick={() => openMonitor(campaignState.startedCampaignId, "processing")}
                    type="button"
                  >
                    Open Live Monitor →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 3: SEND TEST & WHATSAPP CHAT SIMULATOR */}
        {activeView === "test" && (
          <div className="two-column-layout">
            {/* Form Side */}
            <div className="glass-panel test-form-wrap">
              <div className="panel-header-simple">
                <h3>Test Message Dispatcher</h3>
                <p>Send a live test message to your personal WhatsApp to verify rendering and parameter alignment.</p>
              </div>

              <form onSubmit={handleSendTest} className="test-form">
                <div className="input-group">
                  <label>
                    <span className="label-text">Recipient Phone (Country code + digits)</span>
                    <span className="label-req">*</span>
                  </label>
                  <input
                    type="text"
                    className="text-input"
                    value={testForm.to}
                    onChange={(e) => setTestForm((curr) => ({ ...curr, to: e.target.value }))}
                    placeholder="e.g. 919580174041"
                    required
                  />
                </div>

                <div className="input-grid">
                  <div className="input-group">
                    <label>
                      <span className="label-text">Template Name</span>
                      <span className="label-req">*</span>
                    </label>
                    <input
                      type="text"
                      className="text-input"
                      value={testForm.templateName}
                      onChange={(e) => setTestForm((curr) => ({ ...curr, templateName: e.target.value }))}
                      placeholder="seminar_feedback"
                      required
                    />
                  </div>

                  <div className="input-group">
                    <label>
                      <span className="label-text">Language Code</span>
                    </label>
                    <input
                      type="text"
                      className="text-input"
                      value={testForm.languageCode}
                      onChange={(e) => setTestForm((curr) => ({ ...curr, languageCode: e.target.value }))}
                      placeholder="en_US"
                      required
                    />
                  </div>
                </div>

                {/* Dynamic Parameters Block */}
                <div className="params-box">
                  <div className="params-box-header">
                    <div className="params-title">
                      <span>Body Parameters</span>
                      <span className="count-tag">{testParams.length} Fields</span>
                    </div>
                    <button className="add-param-btn" type="button" onClick={addParamField}>
                      + Add Parameter
                    </button>
                  </div>

                  <div className="params-list">
                    {testParams.map((p, idx) => (
                      <div className="param-item" key={p.id}>
                        <span className="param-index">&#123;&#123;{idx + 1}&#125;&#125;</span>
                        <input
                          type="text"
                          className="param-input"
                          value={p.value}
                          onChange={(e) => updateParam(p.id, e.target.value)}
                          placeholder={`Value for {{${idx + 1}}}`}
                        />
                        <button
                          type="button"
                          className="param-remove-btn"
                          onClick={() => removeParamField(p.id)}
                          title="Remove field"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="submit-broadcast-btn"
                  disabled={testState.loading}
                >
                  {testState.loading ? (
                    <>
                      <div className="spinner small" />
                      <span>Sending Test via Meta API...</span>
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                      <span>Send Real Test Message</span>
                    </>
                  )}
                </button>
              </form>

              {testState.error && (
                <div className="alert-banner error">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{testState.error}</span>
                </div>
              )}

              {testState.response && (
                <div className="json-response-drawer">
                  <div className="json-header">
                    <span className="json-title">Meta Cloud API HTTP 200 Accepted</span>
                    <button
                      className="copy-json-btn"
                      onClick={() => copyToClipboard(formatJson(testState.response), "test_json")}
                      type="button"
                    >
                      {copiedId === "test_json" ? "Copied!" : "Copy Payload"}
                    </button>
                  </div>
                  <pre className="json-code">{formatJson(testState.response)}</pre>
                </div>
              )}
            </div>

            {/* Interactive WhatsApp Device Preview */}
            <div className="glass-panel simulator-panel">
              <div className="simulator-header">
                <span className="badge-chip">Live Simulator</span>
                <h3>WhatsApp Chat Preview</h3>
                <p>Simulating real-time parameter interpolation on customer devices.</p>
              </div>

              <div className="phone-device-mockup">
                {/* Phone Speaker & Notch */}
                <div className="phone-notch">
                  <div className="camera-lens" />
                  <div className="speaker-earpiece" />
                </div>

                {/* WhatsApp Chat Top Header */}
                <div className="wa-chat-header">
                  <div className="wa-user-avatar">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <div className="wa-user-info">
                    <strong className="wa-user-name">{testForm.to || "+1 (555) 019-2834"}</strong>
                    <span className="wa-user-status">Official Business Account</span>
                  </div>
                  <div className="wa-header-actions">
                    <span className="wa-icon">📹</span>
                    <span className="wa-icon">📞</span>
                    <span className="wa-icon">⋮</span>
                  </div>
                </div>

                {/* WhatsApp Chat Canvas */}
                <div className="wa-chat-canvas">
                  <div className="wa-date-pill">TODAY</div>

                  {/* WhatsApp Message Bubble */}
                  <div className="wa-message-bubble">
                    <div className="wa-template-tag">
                      <span>Template: {testForm.templateName || "template_preview"}</span>
                    </div>

                    <div className="wa-message-text">
                      <p>
                        Hello{" "}
                        <span className="wa-param-highlight">
                          {testParams[0]?.value || "{{1}}"}
                        </span>
                        , thank you for your{" "}
                        <span className="wa-param-highlight">
                          {testParams[1]?.value || "{{2}}"}
                        </span>{" "}
                        scheduled for{" "}
                        <span className="wa-param-highlight">
                          {testParams[2]?.value || "{{3}}"}
                        </span>
                        !
                      </p>
                      {testParams.length > 3 && (
                        <p className="wa-extra-params">
                          Additional details:{" "}
                          {testParams.slice(3).map((p, i) => (
                            <span key={p.id} className="wa-param-highlight">
                              {p.value || `{{${i + 4}}}`}
                              {i < testParams.length - 4 ? ", " : ""}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>

                    <div className="wa-message-footer">
                      <span className="wa-timestamp">
                        {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="wa-checkmarks">✓✓</span>
                    </div>
                  </div>
                </div>

                <div className="phone-bottom-bar" />
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: LIVE MONITOR & TELEMETRY */}
        {activeView === "monitor" && (
          <section className="glass-panel monitor-view-wrap">
            <div className="monitor-top-cockpit">
              <div className="cockpit-info">
                <h3>Live Broadcast Telemetry</h3>
                <p>Tracking delivery callbacks, retry events, and campaign completion.</p>
              </div>

              <div className="monitor-search-box">
                <input
                  type="text"
                  value={monitorId}
                  onChange={(e) => setMonitorId(e.target.value)}
                  placeholder="Paste Campaign UUID here..."
                  className="monitor-id-input"
                />
                <button
                  className="check-status-btn"
                  onClick={() => fetchCampaignStatus(monitorId, { keepPolling: true })}
                  type="button"
                >
                  Inspect Status
                </button>
              </div>
            </div>

            {monitorState.error && (
              <div className="alert-banner error">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{monitorState.error}</span>
              </div>
            )}

            {statusData ? (
              <div className="monitor-dashboard">
                {/* Big Progress Gauge Card */}
                <div className={`gauge-card ${getStatusTone(statusData.status)}`}>
                  <div className="gauge-header">
                    <div>
                      <span className="sub-label">Campaign Execution</span>
                      <h2 className="gauge-status-title capitalize">{statusData.status}</h2>
                    </div>
                    <div className="status-live-beacon">
                      <span className={`beacon-dot ${isPolling ? "pulsing" : ""}`} />
                      <span>{isPolling ? "Auto Polling (4s)" : "Static Snapshot"}</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="big-progress-track">
                    <div
                      className="big-progress-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  <div className="gauge-stats-row">
                    <div>
                      <span className="gauge-stat-title">Completion</span>
                      <strong className="gauge-stat-val emerald">{progressPercent}%</strong>
                    </div>
                    <div>
                      <span className="gauge-stat-title">Campaign UUID</span>
                      <div className="id-copy-inline">
                        <code className="id-code">{monitorId}</code>
                        <button
                          className="copy-mini-btn"
                          onClick={() => copyToClipboard(monitorId, "mon_id")}
                          type="button"
                        >
                          {copiedId === "mon_id" ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="gauge-stat-title">Active Template</span>
                      <strong className="gauge-stat-val">{statusData.templateName || "Unknown"}</strong>
                    </div>
                  </div>
                </div>

                {/* Real-time Metric Breakdown */}
                <div className="telemetry-grid">
                  <div className="telemetry-box">
                    <span className="telemetry-label">Total Audience</span>
                    <strong className="telemetry-num">{statusData.total}</strong>
                    <span className="telemetry-caption">Parsed from CSV</span>
                  </div>

                  <div className="telemetry-box">
                    <span className="telemetry-label">Queued</span>
                    <strong className="telemetry-num neutral">{statusData.queued ?? 0}</strong>
                    <span className="telemetry-caption">In FIFO buffer</span>
                  </div>

                  <div className="telemetry-box">
                    <span className="telemetry-label">Sent to Meta</span>
                    <strong className="telemetry-num blue">{statusData.sent}</strong>
                    <span className="telemetry-caption">HTTP 200 accepted</span>
                  </div>

                  <div className="telemetry-box">
                    <span className="telemetry-label">Delivered & Read</span>
                    <strong className="telemetry-num emerald">{statusData.delivered}</strong>
                    <span className="telemetry-caption">Confirmed on handsets</span>
                  </div>

                  <div className="telemetry-box">
                    <span className="telemetry-label">Failed / Bounced</span>
                    <strong className={`telemetry-num ${statusData.failed > 0 ? "red" : "neutral"}`}>
                      {statusData.failed}
                    </strong>
                    <span className="telemetry-caption">Invalid / unreached</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-graphic">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </div>
                <h4>No Active Campaign Selected</h4>
                <p>Paste a Campaign UUID into the input above or select any campaign from your library to stream live telemetry.</p>
                <button
                  className="primary-action-btn"
                  onClick={() => setActiveView("campaigns")}
                  type="button"
                >
                  Browse Campaign Library
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
