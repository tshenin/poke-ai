const MAX_DEEPLINK_DESCRIPTION = 4000;
const DEEPLINK_URL_LIMIT = 8000;

document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const ticketEl = document.getElementById('ticket');
  const ticketKeyEl = document.getElementById('ticketKey');
  const ticketTitleEl = document.getElementById('ticketTitle');
  const lastTriggeredEl = document.getElementById('lastTriggered');
  const runCloudBtn = document.getElementById('runCloudAgent');
  const runLocalBtn = document.getElementById('runLocally');
  const openSettingsBtn = document.getElementById('openSettings');
  const toggleAnnotationBtn = document.getElementById('toggleAnnotation');
  const platformSectionEl = document.getElementById('platformSection');
  const annotationsSectionEl = document.getElementById('annotationsSection');
  const annotationsCountEl = document.getElementById('annotationsCount');
  const annotationsListEl = document.getElementById('annotationsList');
  const clearAnnotationsBtn = document.getElementById('clearAnnotations');

  let inFlight = false;
  let currentTicket = null;
  let annotationModeActive = false;
  let currentAnnotations = [];

  const storage = await chrome.storage.local.get([
    'cursorApiKey',
    'lastTriggered',
    'lastAgentUrl'
  ]);
  const hasApiKey = Boolean(storage.cursorApiKey);

  if (storage.lastTriggered) {
    const date = new Date(storage.lastTriggered);
    lastTriggeredEl.textContent = `Last triggered: ${date.toLocaleString()}`;
  }

  const activeTab = await getActiveTab();
  const isTargetPage = activeTab?.url?.includes('.pages.github.io');
  const isJiraPage = activeTab?.url?.includes('.atlassian.net');

  // Handle platform page (annotation mode)
  if (isTargetPage) {
    platformSectionEl.style.display = 'block';
    toggleAnnotationBtn.style.display = 'block';

    // Check current annotation mode state
    try {
      const modeResponse = await chrome.tabs.sendMessage(activeTab.id, { type: 'GET_ANNOTATION_MODE' });
      annotationModeActive = modeResponse?.enabled || false;
      updateAnnotationButton();
    } catch (e) {
      // Content script might not be loaded yet
    }

    // Load annotations for this page
    await loadAnnotations(activeTab.id);

    // Enable cloud agent if we have annotations and API key
    if (currentAnnotations.length > 0 && hasApiKey) {
      statusEl.className = 'status ready';
      statusEl.textContent = `${currentAnnotations.length} annotation(s) ready. Run agent to apply changes.`;
      runCloudBtn.disabled = false;
      runLocalBtn.disabled = false;
    } else if (currentAnnotations.length > 0) {
      statusEl.className = 'status warning';
      statusEl.textContent = 'Annotations ready. Add API key in Settings to run cloud agent.';
      runLocalBtn.disabled = false;
    } else {
      statusEl.className = 'status ready';
      statusEl.textContent = 'On platform page. Add annotations to UI elements.';
    }
  }

  // Handle Jira page (ticket context)
  if (isJiraPage) {
    const ticketContext = await getTicketContextFromTab(activeTab.id);

    if (ticketContext?.isIssuePage && ticketContext.ticketKey && ticketContext.ticketTitle) {
      currentTicket = ticketContext;
      ticketEl.style.display = 'block';
      ticketKeyEl.textContent = ticketContext.ticketKey;
      ticketTitleEl.textContent = ticketContext.ticketTitle;

      runLocalBtn.disabled = false;

      if (hasApiKey) {
        statusEl.className = 'status ready';
        statusEl.textContent = 'Ready to run a Cursor agent for this ticket.';
        runCloudBtn.disabled = false;
      } else {
        statusEl.className = 'status warning';
        statusEl.textContent = 'Cloud agent needs an API key. Configure it in Settings, or use "Open in Cursor".';
      }
    } else {
      statusEl.className = 'status warning';
      statusEl.textContent = 'Open a Jira issue page.';
    }
  }

  // Neither platform nor Jira page
  if (!isTargetPage && !isJiraPage) {
    statusEl.className = 'status warning';
    statusEl.textContent = 'Open a Jira issue or annotatable platform page.';
  }

  // Load stored annotations to include with agent runs
  await loadStoredAnnotations();

  toggleAnnotationBtn.addEventListener('click', async () => {
    if (!activeTab) return;

    annotationModeActive = !annotationModeActive;

    try {
      await chrome.tabs.sendMessage(activeTab.id, {
        type: 'TOGGLE_ANNOTATION_MODE',
        enabled: annotationModeActive
      });
      updateAnnotationButton();

      if (annotationModeActive) {
        window.close(); // Close popup so user can interact with page
      }
    } catch (e) {
      statusEl.className = 'status warning';
      statusEl.textContent = 'Could not activate annotation mode. Refresh the page.';
      annotationModeActive = false;
      updateAnnotationButton();
    }
  });

  clearAnnotationsBtn.addEventListener('click', async () => {
    // Clear ALL annotations from storage first
    await chrome.storage.local.set({ pageAnnotations: {} });

    // Tell content script to reload (will get empty array from storage)
    if (activeTab && isTargetPage) {
      try {
        await chrome.tabs.sendMessage(activeTab.id, { type: 'RELOAD_ANNOTATIONS' });
      } catch (e) {
        // Content script might not be available
      }
    }

    currentAnnotations = [];
    updateAnnotationsDisplay();
  });

  runCloudBtn.addEventListener('click', async () => {
    if (inFlight) return;

    // For platform pages, run with annotations only
    if (isTargetPage && currentAnnotations.length > 0) {
      inFlight = true;
      runCloudBtn.disabled = true;
      runLocalBtn.disabled = true;
      runCloudBtn.textContent = 'Running...';

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'RUN_AGENT',
          payload: {
            ticketKey: '',
            ticketTitle: '',
            ticketDescription: '',
            annotations: currentAnnotations,
            pageUrl: activeTab.url,
            annotationsOnly: true
          }
        });

        if (response?.success) {
          statusEl.className = 'status ready';
          if (response.agentUrl) {
            statusEl.innerHTML = `Agent started successfully. <a href="${response.agentUrl}" target="_blank" class="agent-link">Open agent</a>`;
          } else {
            statusEl.textContent = 'Agent started successfully.';
          }
        } else {
          statusEl.className = 'status warning';
          statusEl.textContent = response?.errorMessage || 'Failed to run agent.';
        }
      } catch (error) {
        statusEl.className = 'status warning';
        statusEl.textContent = 'Failed to run agent: extension communication error.';
      } finally {
        inFlight = false;
        runCloudBtn.disabled = false;
        runLocalBtn.disabled = false;
        runCloudBtn.textContent = 'Run Cloud Agent';
      }
      return;
    }

    // For Jira pages, run with ticket context
    if (!currentTicket) return;

    inFlight = true;
    runCloudBtn.disabled = true;
    runLocalBtn.disabled = true;
    runCloudBtn.textContent = 'Running...';

    try {
      const storedAnnotations = await getStoredAnnotations();
      const response = await chrome.runtime.sendMessage({
        type: 'RUN_AGENT',
        payload: {
          ticketKey: currentTicket.ticketKey,
          ticketTitle: currentTicket.ticketTitle,
          ticketDescription: currentTicket.ticketDescription || '',
          annotations: storedAnnotations
        }
      });

      if (response?.success) {
        statusEl.className = 'status ready';
        if (response.agentUrl) {
          statusEl.innerHTML = `Agent started successfully. <a href="${response.agentUrl}" target="_blank" class="agent-link">Open agent</a>`;
        } else {
          statusEl.textContent = 'Agent started successfully.';
        }
      } else {
        statusEl.className = 'status warning';
        statusEl.textContent = response?.errorMessage || 'Failed to run agent.';
      }
    } catch (error) {
      statusEl.className = 'status warning';
      statusEl.textContent = 'Failed to run agent: extension communication error.';
    } finally {
      inFlight = false;
      runCloudBtn.disabled = !hasApiKey;
      runLocalBtn.disabled = false;
      runCloudBtn.textContent = 'Run Cloud Agent';
    }
  });

  runLocalBtn.addEventListener('click', async () => {
    // For platform pages, open with annotations only
    if (isTargetPage && currentAnnotations.length > 0) {
      const prompt = buildAnnotationsOnlyPrompt(currentAnnotations, activeTab.url);
      const deeplink = buildCursorDeeplink(prompt);

      if (deeplink.length > DEEPLINK_URL_LIMIT) {
        statusEl.className = 'status warning';
        statusEl.textContent = 'Too many annotations for a deeplink. Try the cloud agent instead.';
        return;
      }

      chrome.tabs.create({ url: deeplink });
      statusEl.className = 'status ready';
      statusEl.textContent = 'Opened in Cursor. Review the prompt and confirm.';
      return;
    }

    // For Jira pages
    if (!currentTicket) return;

    const storedAnnotations = await getStoredAnnotations();
    const prompt = buildLocalPrompt(currentTicket, storedAnnotations);
    const deeplink = buildCursorDeeplink(prompt);

    if (deeplink.length > DEEPLINK_URL_LIMIT) {
      statusEl.className = 'status warning';
      statusEl.textContent = 'Ticket description is too long for a deeplink. Try the cloud agent instead.';
      return;
    }

    chrome.tabs.create({ url: deeplink });
    statusEl.className = 'status ready';
    statusEl.textContent = 'Opened in Cursor. Review the prompt and confirm.';
  });

  openSettingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  function updateAnnotationButton() {
    if (annotationModeActive) {
      toggleAnnotationBtn.textContent = '🛑 Stop Annotation Mode';
      toggleAnnotationBtn.classList.add('active');
    } else {
      toggleAnnotationBtn.textContent = '🎯 Start Annotation Mode';
      toggleAnnotationBtn.classList.remove('active');
    }
  }

  async function loadAnnotations(tabId) {
    // Load directly from storage instead of content script to ensure consistency
    if (activeTab?.url) {
      try {
        const url = new URL(activeTab.url);
        const pageUrl = url.origin + url.pathname;
        const result = await chrome.storage.local.get(['pageAnnotations']);
        const pageAnnotations = result.pageAnnotations || {};
        currentAnnotations = pageAnnotations[pageUrl] || [];
        updateAnnotationsDisplay();
        return;
      } catch (e) {
        // Fall through to content script
      }
    }

    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_ANNOTATIONS' });
      currentAnnotations = response?.annotations || [];
      updateAnnotationsDisplay();
    } catch (e) {
      currentAnnotations = [];
    }
  }

  async function loadStoredAnnotations() {
    const result = await chrome.storage.local.get(['pageAnnotations']);
    const pageAnnotations = result.pageAnnotations || {};
    let allAnnotations = [];
    for (const url in pageAnnotations) {
      allAnnotations = allAnnotations.concat(pageAnnotations[url]);
    }
    if (allAnnotations.length > 0) {
      currentAnnotations = allAnnotations;
      updateAnnotationsDisplay();
    }
  }

  async function getStoredAnnotations() {
    const result = await chrome.storage.local.get(['pageAnnotations']);
    const pageAnnotations = result.pageAnnotations || {};
    let allAnnotations = [];
    for (const url in pageAnnotations) {
      allAnnotations = allAnnotations.concat(pageAnnotations[url]);
    }
    return allAnnotations;
  }

  function updateAnnotationsDisplay() {
    if (currentAnnotations.length === 0) {
      annotationsSectionEl.style.display = 'none';
      return;
    }

    annotationsSectionEl.style.display = 'block';
    annotationsCountEl.textContent = currentAnnotations.length.toString();

    annotationsListEl.innerHTML = currentAnnotations.map((ann, i) => `
      <div class="annotation-item">
        <div class="annotation-note">${i + 1}. ${escapeHtml(ann.note)}</div>
        <div class="annotation-selector">${escapeHtml(ann.selector)}</div>
      </div>
    `).join('');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});

function buildAnnotationsOnlyPrompt(annotations, pageUrl) {
  const lines = [
    'You need to implement UI changes based on the annotations below.',
    'Each annotation marks a specific UI element that needs to be modified.',
    '',
    `Source page: ${pageUrl}`,
    '',
    'UI Annotations:',
  ];

  annotations.forEach((ann, i) => {
    lines.push(`${i + 1}. ${ann.note}`);
    lines.push(`   Element: ${ann.selector}`);
    if (ann.textContent) {
      lines.push(`   Text: "${ann.textContent}"`);
    }
    if (ann.tagName) {
      lines.push(`   Tag: <${ann.tagName}>`);
    }
    lines.push('');
  });

  lines.push('Find the components matching these selectors and implement the requested changes.');

  return lines.join('\n');
}

function buildLocalPrompt(ticket, annotations = []) {
  const key = ticket.ticketKey || 'UNKNOWN';
  const title = ticket.ticketTitle || 'Untitled ticket';
  let description = ticket.ticketDescription || '(No description provided in Jira.)';

  if (description.length > MAX_DEEPLINK_DESCRIPTION) {
    description = description.slice(0, MAX_DEEPLINK_DESCRIPTION).trim()
      + '\n\n[Description truncated due to length.]';
  }

  const lines = [
    `You need to implement the change described in the Jira ticket below.`,
    `Read through the details carefully and make the necessary code changes.`,
    '',
    `Ticket: ${key}`,
    `Title: ${title}`,
    '',
    'Description:',
    description,
  ];

  if (annotations.length > 0) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('UI Annotations (elements marked for changes):');
    annotations.forEach((ann, i) => {
      lines.push(`${i + 1}. ${ann.note}`);
      lines.push(`   Element: ${ann.selector}`);
      if (ann.textContent) {
        lines.push(`   Text: "${ann.textContent}"`);
      }
      lines.push('');
    });
  }

  return lines.join('\n');
}

function buildCursorDeeplink(promptText) {
  const url = new URL('cursor://anysphere.cursor-deeplink/prompt');
  url.searchParams.set('text', promptText);
  return url.toString();
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs.length > 0 ? tabs[0] : null;
}

async function getTicketContextFromTab(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'GET_TICKET_CONTEXT' });
  } catch (error) {
    return null;
  }
}
