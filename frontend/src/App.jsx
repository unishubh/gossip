import { useEffect, useRef, useState } from "react";

const defaultTestParam = () => ({ id: crypto.randomUUID(), value: "" });
const pollingIntervalMs = 4000;
const apiBaseUrlStorageKey = "gossip_api_base_url";

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
  if (!value) {
    return "";
  }

  return JSON.stringify(value, null, 2);
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

function formatDate(value) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function getInitialApiBaseUrl() {
  const runtimeConfigUrl =
    typeof window !== "undefined" ? window.__GOSSIP_CONFIG__?.apiBaseUrl : "";
  const savedUrl =
    typeof window !== "undefined"
      ? window.localStorage.getItem(apiBaseUrlStorageKey) || ""
      : "";

  return (runtimeConfigUrl || savedUrl || "").trim();
}

function resolveApiUrl(pathname, apiBaseUrl) {
  if (!apiBaseUrl) {
    return pathname;
  }

  return new URL(pathname, apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`).toString();
}

function App() {
  const [activeView, setActiveView] = useState("campaigns");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState(getInitialApiBaseUrl);
  const [apiBaseUrlInput, setApiBaseUrlInput] = useState(getInitialApiBaseUrl);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [testForm, setTestForm] = useState({
    to: "",
    templateName: "",
    languageCode: "en_US"
  });
  const [testParams, setTestParams] = useState([
    defaultTestParam(),
    defaultTestParam(),
    defaultTestParam(),
    defaultTestParam()
  ]);
  const [testState, setTestState] = useState({
    loading: false,
    error: "",
    response: null
  });
  const [campaignForm, setCampaignForm] = useState({
    templateName: "",
    languageCode: "en_US",
    file: null
  });
  const [campaignState, setCampaignState] = useState({
    loading: false,
    error: "",
    startedCampaignId: "",
    response: null
  });
  const [monitorId, setMonitorId] = useState("");
  const [monitorState, setMonitorState] = useState({
    loading: false,
    error: "",
    data: null
  });
  const [isPolling, setIsPolling] = useState(false);
  const [campaignListState, setCampaignListState] = useState({
    loading: false,
    error: "",
    data: []
  });
  const pollRef = useRef(null);

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
    }
  }, [activeView]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (apiBaseUrl) {
      window.localStorage.setItem(apiBaseUrlStorageKey, apiBaseUrl);
    } else {
      window.localStorage.removeItem(apiBaseUrlStorageKey);
    }
  }, [apiBaseUrl]);

  async function requestJson(url, options) {
    const response = await fetch(resolveApiUrl(url, apiBaseUrl), options);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        data?.error || data?.message || "The server could not process the request.";
      throw new Error(message);
    }

    return data;
  }

  function saveApiBaseUrl(event) {
    event.preventDefault();
    const nextValue = apiBaseUrlInput.trim().replace(/\/+$/, "");
    setApiBaseUrl(nextValue);
    setShowApiSettings(false);
  }

  function resetApiBaseUrl() {
    setApiBaseUrl("");
    setApiBaseUrlInput("");
    setShowApiSettings(false);
  }

  function queueNextPoll(campaignId) {
    if (!campaignId) {
      return;
    }

    pollRef.current = window.setTimeout(() => {
      fetchCampaignStatus(campaignId, { keepPolling: true });
    }, pollingIntervalMs);
  }

  async function fetchCampaignStatus(campaignId, options = {}) {
    const { keepPolling = false } = options;
    const id = campaignId || monitorId.trim();

    if (!id) {
      setMonitorState((current) => ({
        ...current,
        error: "Enter a campaign ID to check progress."
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
      setCampaignListState({
        loading: false,
        error: error.message,
        data: []
      });
    }
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
        error: "Choose a CSV file before starting a campaign.",
        startedCampaignId: "",
        response: null
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", campaignForm.file);
    formData.append("templateName", campaignForm.templateName);
    formData.append("languageCode", campaignForm.languageCode || "en_US");

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
      setCampaignState({
        loading: false,
        error: error.message,
        startedCampaignId: "",
        response: null
      });
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
  const statusData = monitorState.data;
  const progressPercent = statusData
    ? Math.round(((statusData.delivered + statusData.failed) / statusData.total) * 100)
    : 0;
  const activeParamCount = testParams.filter((param) => param.value.trim()).length;
  const statusTone = getStatusTone(statusData?.status);

  const pageMeta = {
    campaigns: {
      eyebrow: "Campaign History",
      title: "Previous campaigns",
      description:
        "Review earlier runs, check outcome counts, and reopen any campaign in the live monitor.",
      actionLabel: "Start new campaign",
      actionView: "campaign"
    },
    campaign: {
      eyebrow: "New Campaign",
      title: "Start a CSV campaign",
      description:
        "Upload your audience file, choose the approved template, and launch delivery.",
      actionLabel: "Open campaigns",
      actionView: "campaigns"
    },
    test: {
      eyebrow: "Template Check",
      title: "Send a test message",
      description:
        "Validate parameter order and message rendering before starting a bulk campaign.",
      actionLabel: "Start new campaign",
      actionView: "campaign"
    },
    monitor: {
      eyebrow: "Campaign Monitor",
      title: "Track live progress",
      description:
        "Follow a campaign without reading logs. Paste an ID or jump here from campaign history.",
      actionLabel: "Open campaigns",
      actionView: "campaigns"
    }
  }[activeView];

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">G</div>
          <div className="brand-copy">
            <h1>Gossip</h1>
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((current) => !current)}
            type="button"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? "»" : "«"}
          </button>
        </div>

        <p className="sidebar-section-label">Navigation</p>
        <nav className="nav">
          {[
            ["campaigns", "Campaigns", "≡"],
            ["campaign", "New campaign", "+"],
            ["test", "Send test", "✉"],
            ["monitor", "Monitor", "◔"]
          ].map(([key, label, icon]) => (
            <button
              key={key}
              className={activeView === key ? "nav-item active" : "nav-item"}
              onClick={() => setActiveView(key)}
              type="button"
              aria-label={label}
              title={label}
            >
              <span className="nav-icon" aria-hidden="true">
                {icon}
              </span>
              <span className="nav-title">{label}</span>
              <span className="nav-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-panel page-panel">
        <header className="topbar">
          <div>
            <p className="breadcrumb">Gossip / {pageMeta.title}</p>
            <h2>{pageMeta.title}</h2>
            <p className="hero-description">{pageMeta.description}</p>
          </div>
          <div className="topbar-actions">
            <button
              className="ghost-button"
              onClick={() => setShowApiSettings((current) => !current)}
              type="button"
            >
              API settings
            </button>
            <button
              className="ghost-button"
              onClick={() => setActiveView(pageMeta.actionView)}
              type="button"
            >
              {pageMeta.actionLabel}
            </button>
          </div>
        </header>

        {showApiSettings ? (
          <section className="page-card settings-card">
            <div className="panel-header">
              <div>
                <h3>API connection</h3>
                <p className="panel-description">
                  Leave this empty when the UI is served by the same backend. Set a full
                  base URL only when the API is hosted elsewhere.
                </p>
              </div>
              <span className="badge neutral">
                {apiBaseUrl ? "Custom backend" : "Same origin"}
              </span>
            </div>

            <form className="settings-form" onSubmit={saveApiBaseUrl}>
              <label>
                Backend base URL
                <input
                  value={apiBaseUrlInput}
                  onChange={(event) => setApiBaseUrlInput(event.target.value)}
                  placeholder="https://api.example.com"
                />
              </label>

              <div className="settings-actions">
                <button className="primary-button" type="submit">
                  Save connection
                </button>
                <button className="ghost-button" onClick={resetApiBaseUrl} type="button">
                  Use same origin
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="hero-card compact-hero">
          <div className="hero-stats compact">
            <div>
              <span className="stat-label">Saved campaigns</span>
              <strong>{campaigns.length}</strong>
              <small>Available in history</small>
            </div>
            <div>
              <span className="stat-label">Draft template</span>
              <strong>{testForm.templateName || "Not chosen"}</strong>
              <small>{activeParamCount} parameters filled</small>
            </div>
            <div>
              <span className="stat-label">Monitor</span>
              <strong>{statusData ? statusData.status : "Idle"}</strong>
              <small>{statusData ? `${progressPercent}% complete` : "Waiting for an ID"}</small>
            </div>
          </div>
        </section>

        {activeView === "campaigns" ? (
          <section className="page-card">
            <div className="panel-header">
              <div>
                <h3>Campaign library</h3>
                <p className="panel-description">
                  Every campaign stored in SQLite appears here, including its delivery
                  outcome counts.
                </p>
              </div>
              <button className="ghost-button" onClick={fetchCampaigns} type="button">
                Refresh
              </button>
            </div>

            {campaignListState.error ? (
              <p className="message error">{campaignListState.error}</p>
            ) : null}

            <div className="campaign-table">
              {campaignListState.loading ? (
                <div className="empty-state">
                  <p className="empty-title">Loading campaigns</p>
                  <p>Fetching campaign history from the server.</p>
                </div>
              ) : campaigns.length > 0 ? (
                <>
                  <div className="campaign-table-head">
                    <span>Template</span>
                    <span>Created</span>
                    <span>Queued</span>
                    <span>Sent</span>
                    <span>Delivered</span>
                    <span>Failed</span>
                    <span>Status</span>
                    <span>Action</span>
                  </div>
                  {campaigns.map((campaign) => (
                    <article className="campaign-table-row" key={campaign.id}>
                      <div className="campaign-primary">
                        <strong>{campaign.templateName || "Unknown template"}</strong>
                        <span className="history-id">{campaign.id}</span>
                      </div>
                      <span>{formatDate(campaign.createdAt)}</span>
                      <strong>{campaign.queued}</strong>
                      <strong>{campaign.sent}</strong>
                      <strong>{campaign.delivered}</strong>
                      <strong>{campaign.failed}</strong>
                      <span className={`badge neutral tone-${getStatusTone(campaign.status)}`}>
                        {campaign.status}
                      </span>
                      <button
                        className="secondary-button"
                        onClick={() => openMonitor(campaign.id, campaign.status)}
                        type="button"
                      >
                        View
                      </button>
                    </article>
                  ))}
                </>
              ) : (
                <div className="empty-state">
                  <p className="empty-title">No campaigns yet</p>
                  <p>Start your first CSV campaign and it will appear here.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {activeView === "campaign" ? (
          <section className="page-card form-page">
            <div className="page-copy-block">
              <h3>Launch a new campaign</h3>
              <p className="panel-description">
                Upload a CSV, confirm the template details, and the backend will queue
                valid rows for background delivery.
              </p>

              <div className="mini-checklist">
                <div className="mini-item">Template is approved in Meta</div>
                <div className="mini-item">CSV columns match the template parameters</div>
                <div className="mini-item">Phone numbers include country code</div>
              </div>
            </div>

            <form className="form-grid form-panel" onSubmit={handleStartCampaign}>
              <label>
                Template name
                <input
                  value={campaignForm.templateName}
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      templateName: event.target.value
                    }))
                  }
                  placeholder="seminar_feedback"
                  required
                />
              </label>

              <label>
                Language code
                <input
                  value={campaignForm.languageCode}
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      languageCode: event.target.value
                    }))
                  }
                  placeholder="en_US"
                />
              </label>

              <label className="file-input">
                CSV file
                <input
                  accept=".csv"
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      file: event.target.files?.[0] || null
                    }))
                  }
                  type="file"
                  required
                />
                <span>
                  {campaignForm.file
                    ? campaignForm.file.name
                    : "Choose a CSV file with phone,param1,param2..."}
                </span>
              </label>

              <button
                className="primary-button"
                disabled={campaignState.loading}
                type="submit"
              >
                {campaignState.loading ? "Starting..." : "Start campaign"}
              </button>
            </form>

            {campaignState.error ? <p className="message error">{campaignState.error}</p> : null}
            {campaignState.startedCampaignId ? (
              <div className="success-card">
                <p className="success-title">Campaign started</p>
                <p className="success-copy">
                  Delivery continues in the background. Open the monitor to watch progress.
                </p>
                <p className="success-id">{campaignState.startedCampaignId}</p>
                <button
                  className="secondary-button"
                  onClick={() => openMonitor(campaignState.startedCampaignId, "processing")}
                  type="button"
                >
                  Open live monitor
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeView === "test" ? (
          <section className="page-card form-page">
            <div className="page-copy-block">
              <h3>Send a single test message</h3>
              <p className="panel-description">
                Confirm the parameter order and template details before you use the
                same content in a CSV campaign.
              </p>
            </div>

            <form className="form-grid form-panel" onSubmit={handleSendTest}>
              <label>
                Recipient phone
                <input
                  value={testForm.to}
                  onChange={(event) =>
                    setTestForm((current) => ({
                      ...current,
                      to: event.target.value
                    }))
                  }
                  placeholder="919580174041"
                  required
                />
              </label>

              <label>
                Template name
                <input
                  value={testForm.templateName}
                  onChange={(event) =>
                    setTestForm((current) => ({
                      ...current,
                      templateName: event.target.value
                    }))
                  }
                  placeholder="seminar_feedback"
                  required
                />
              </label>

              <label>
                Language code
                <input
                  value={testForm.languageCode}
                  onChange={(event) =>
                    setTestForm((current) => ({
                      ...current,
                      languageCode: event.target.value
                    }))
                  }
                  placeholder="en_US"
                  required
                />
              </label>

              <div className="param-group">
                <div className="param-header">
                  <span>Template parameters</span>
                  <button className="ghost-button" onClick={addParamField} type="button">
                    Add field
                  </button>
                </div>

                <div className="helper-strip">
                  <span>Fill parameters in the same order defined in Meta.</span>
                  <span>{activeParamCount} filled</span>
                </div>

                {testParams.map((param, index) => (
                  <div className="param-row" key={param.id}>
                    <input
                      value={param.value}
                      onChange={(event) => updateParam(param.id, event.target.value)}
                      placeholder={`Parameter ${index + 1}`}
                    />
                    <button
                      className="icon-button"
                      onClick={() => removeParamField(param.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <button className="primary-button" disabled={testState.loading} type="submit">
                {testState.loading ? "Sending..." : "Send test message"}
              </button>
            </form>

            {testState.error ? <p className="message error">{testState.error}</p> : null}
            {testState.response ? (
              <div className="result-stack">
                <div className="result-banner success">
                  Test message accepted by WhatsApp.
                </div>
                <pre className="response-box">{formatJson(testState.response)}</pre>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeView === "monitor" ? (
          <section className="page-card">
            <div className="panel-header">
              <div>
                <h3>Live campaign monitor</h3>
                <p className="panel-description">
                  Paste a campaign ID or open one from the history page.
                </p>
              </div>
              <span className={`badge neutral ${isPolling ? "pulse" : ""}`}>
                {isPolling ? "Auto-refreshing" : "On demand"}
              </span>
            </div>

            <div className="monitor-controls large">
              <input
                value={monitorId}
                onChange={(event) => setMonitorId(event.target.value)}
                placeholder="Paste a campaign ID"
              />
              <button
                className="primary-button"
                onClick={() => fetchCampaignStatus(monitorId, { keepPolling: true })}
                type="button"
              >
                Check status
              </button>
            </div>

            {monitorState.error ? <p className="message error">{monitorState.error}</p> : null}

            {statusData ? (
              <div className={`monitor-card ${statusTone}`}>
                <div className="progress-header">
                  <div>
                    <p className="eyebrow">Campaign health</p>
                    <h4>{statusData.status}</h4>
                  </div>
                  <strong>{progressPercent}%</strong>
                </div>

                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
                </div>

                <div className="status-summary">
                  <div>
                    <span className="summary-label">Campaign ID</span>
                    <strong>{monitorId}</strong>
                  </div>
                  <div>
                    <span className="summary-label">Next action</span>
                    <strong>
                      {statusData.status === "completed"
                        ? "Review final outcome"
                        : "Keep monitoring"}
                    </strong>
                  </div>
                </div>

                <div className="metric-grid monitor-metrics">
                  <div className="metric">
                    <span>Total</span>
                    <strong>{statusData.total}</strong>
                  </div>
                  <div className="metric">
                    <span>Queued</span>
                    <strong>{statusData.queued ?? 0}</strong>
                  </div>
                  <div className="metric">
                    <span>Sent</span>
                    <strong>{statusData.sent}</strong>
                  </div>
                  <div className="metric">
                    <span>Delivered</span>
                    <strong>{statusData.delivered}</strong>
                  </div>
                  <div className="metric">
                    <span>Failed</span>
                    <strong>{statusData.failed}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p className="empty-title">No campaign selected</p>
                <p>Start a campaign or open one from the history page.</p>
              </div>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;
