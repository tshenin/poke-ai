document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const repositoryUrlInput = document.getElementById('repositoryUrl');
  const baseRefInput = document.getElementById('baseRef');
  const modelSelect = document.getElementById('modelSelect');
  const refreshModelsBtn = document.getElementById('refreshModelsBtn');
  const advancedToggleInput = document.getElementById('advancedToggle');
  const advancedPanelEl = document.getElementById('advancedPanel');
  const customPromptTemplateInput = document.getElementById('customPromptTemplate');
  const saveBtn = document.getElementById('saveBtn');
  const testConnectionBtn = document.getElementById('testConnectionBtn');
  const messageEl = document.getElementById('message');
  const lastSavedEl = document.getElementById('lastSaved');
  const defaultRepository = '';
  const defaultRef = 'main';
  const superDefaultPromptTemplate = [
    'You are implementing a Jira ticket using the repository context available to you.',
    '',
    'Ticket Key: {{ticket}}',
    'Ticket Title: {{title}}',
    '',
    'Ticket Description:',
    '{{description}}',
    '',
    'Execution checklist:',
    '1. Install project dependencies.',
    '2. Implement the ticket completely.',
    '3. Run pre-commit tasks (lint, tests, formatting, type checks as applicable).',
    '4. Fix any introduced failures.',
    '5. Create a pull request with clear summary and test notes.',
  ].join('\n');
  const repoDefaultPromptTemplates = {};
  const defaultCustomPromptTemplate = superDefaultPromptTemplate;
  let storedApiKey = '';
  let customPromptsByRepo = {};

  // Load existing data
  const result = await chrome.storage.local.get([
    'cursorApiKey',
    'targetRepository',
    'targetRef',
    'selectedModel',
    'apiKeySavedAt',
    'customPromptsByRepo',
    'customPromptEnabled',
    'customPromptTemplate',
  ]);
  
  if (result.cursorApiKey) {
    storedApiKey = result.cursorApiKey;
    apiKeyInput.placeholder = '••••••••••••••••';
    loadModels(result.cursorApiKey, result.selectedModel);
  }

  repositoryUrlInput.value = result.targetRepository || defaultRepository;
  baseRefInput.value = result.targetRef || defaultRef;
  advancedToggleInput.checked = false;
  advancedPanelEl.hidden = !advancedToggleInput.checked;
  customPromptsByRepo = isRecord(result.customPromptsByRepo) ? result.customPromptsByRepo : {};

  // One-time migration from old global custom prompt storage.
  const currentRepoKey = getRepositoryKey(repositoryUrlInput.value.trim() || defaultRepository);
  if (
    result.customPromptEnabled &&
    typeof result.customPromptTemplate === 'string' &&
    result.customPromptTemplate.trim() &&
    currentRepoKey &&
    !customPromptsByRepo[currentRepoKey]
  ) {
    customPromptsByRepo[currentRepoKey] = result.customPromptTemplate;
  }
  loadCustomPromptForCurrentRepo();
  
  if (result.apiKeySavedAt) {
    const date = new Date(result.apiKeySavedAt);
    lastSavedEl.textContent = `Last saved: ${date.toLocaleString()}`;
  }

  advancedToggleInput.addEventListener('change', () => {
    advancedPanelEl.hidden = !advancedToggleInput.checked;
  });

  repositoryUrlInput.addEventListener('blur', () => {
    loadCustomPromptForCurrentRepo();
  });

  refreshModelsBtn.addEventListener('click', () => {
    const tokenToUse = apiKeyInput.value.trim() || storedApiKey;
    if (!tokenToUse) {
      showMessage('Enter or save a Cursor API key first.', 'error');
      return;
    }
    loadModels(tokenToUse);
  });

  // Save button handler
  saveBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const repositoryUrl = repositoryUrlInput.value.trim() || defaultRepository;
    const baseRef = baseRefInput.value.trim() || defaultRef;
    const hasNewApiKey = Boolean(apiKey);
    const effectiveApiKey = hasNewApiKey ? apiKey : storedApiKey;
    
    if (!effectiveApiKey) {
      showMessage('Please enter an API key (first-time setup).', 'error');
      return;
    }
    if (!repositoryUrl.startsWith('https://github.com/')) {
      showMessage('Repository URL must start with https://github.com/', 'error');
      return;
    }

    try {
      const updatePayload = {
        targetRepository: repositoryUrl,
        targetRef: baseRef,
        selectedModel: modelSelect.value || '',
        customPromptsByRepo: customPromptsByRepo
      };

      const repositoryKey = getRepositoryKey(repositoryUrl);
      if (advancedToggleInput.checked && repositoryKey) {
        const template = customPromptTemplateInput.value.trim();
        const defaultTemplate = getDefaultTemplateForRepository(repositoryKey).trim();
        if (template && template !== defaultTemplate) {
          customPromptsByRepo[repositoryKey] = template;
        } else {
          delete customPromptsByRepo[repositoryKey];
        }
        updatePayload.customPromptsByRepo = customPromptsByRepo;
      }

      if (hasNewApiKey) {
        const timestamp = Date.now();
        updatePayload.cursorApiKey = apiKey;
        updatePayload.apiKeySavedAt = timestamp;
        storedApiKey = apiKey;
        apiKeyInput.value = '';
        apiKeyInput.placeholder = '••••••••••••••••';

        const date = new Date(timestamp);
        lastSavedEl.textContent = `Last saved: ${date.toLocaleString()}`;
      }

      await chrome.storage.local.set(updatePayload);
      showMessage(
        hasNewApiKey
          ? 'API key and repository settings saved successfully!'
          : advancedToggleInput.checked
            ? 'Repository and custom prompt saved for this repository.'
            : 'Repository settings saved successfully!',
        'success'
      );
    } catch (error) {
      showMessage('Failed to save settings', 'error');
    }
  });

  testConnectionBtn.addEventListener('click', async () => {
    const tokenToTest = apiKeyInput.value.trim() || storedApiKey;
    const repositoryUrl = repositoryUrlInput.value.trim() || defaultRepository;

    if (!tokenToTest) {
      showMessage('Enter or save a Cursor API key first.', 'error');
      return;
    }
    if (!repositoryUrl.startsWith('https://github.com/')) {
      showMessage('Repository URL must start with https://github.com/', 'error');
      return;
    }

    testConnectionBtn.disabled = true;
    testConnectionBtn.textContent = 'Testing...';

    try {
      const meResponse = await fetchWithTimeout('https://api.cursor.com/v0/me', {
        headers: {
          Authorization: buildCursorAuthHeader(tokenToTest)
        }
      });

      if (!meResponse.ok) {
        const message = await getErrorMessage(meResponse);
        showMessage(
          `Cursor auth failed (${meResponse.status}). ${message || 'Check API key and permissions.'}`,
          'error',
          7000
        );
        return;
      }

      const reposResponse = await fetchWithTimeout('https://api.cursor.com/v0/repositories', {
        headers: {
          Authorization: buildCursorAuthHeader(tokenToTest)
        }
      });

      if (!reposResponse.ok) {
        const message = await getErrorMessage(reposResponse);
        showMessage(
          `Connected, but repository check failed (${reposResponse.status}). ${message || 'Try again.'}`,
          'error',
          7000
        );
        return;
      }

      const reposJson = await reposResponse.json();
      const repos = Array.isArray(reposJson.repositories) ? reposJson.repositories : [];
      const normalizedTarget = normalizeRepoUrl(repositoryUrl);
      const hasAccess = repos.some((repo) => {
        const candidate = normalizeRepoUrl(repo.repository || '');
        return candidate === normalizedTarget;
      });

      if (!hasAccess) {
        showMessage(
          'Token is valid, but this repository is not accessible to Cursor account. Check Cursor GitHub integration/repo permissions.',
          'error',
          9000
        );
        return;
      }

      showMessage('Connection OK. API key works and repository access is available.', 'success', 6000);
    } catch (error) {
      showMessage(`Connection test failed: ${error.message}`, 'error', 7000);
    } finally {
      testConnectionBtn.disabled = false;
      testConnectionBtn.textContent = 'Test Connection';
    }
  });

  function showMessage(text, type, timeoutMs = 3000) {
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
    messageEl.style.display = 'block';
    
    setTimeout(() => {
      messageEl.style.display = 'none';
    }, timeoutMs);
  }

  async function getErrorMessage(response) {
    try {
      const data = await response.json();
      return data?.error?.message || data?.message || '';
    } catch (error) {
      return '';
    }
  }

  async function fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function normalizeRepoUrl(url) {
    return (url || '')
      .trim()
      .replace(/\.git$/i, '')
      .replace(/\/$/, '')
      .toLowerCase();
  }

  function getRepositoryKey(repositoryUrl) {
    const normalized = normalizeRepoUrl(repositoryUrl);
    const match = normalized.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/i);
    if (!match) {
      return '';
    }
    return `${match[1]}/${match[2]}`.toLowerCase();
  }

  function loadCustomPromptForCurrentRepo() {
    const repositoryUrl = repositoryUrlInput.value.trim() || defaultRepository;
    const key = getRepositoryKey(repositoryUrl);
    const customTemplate = key && customPromptsByRepo[key] ? customPromptsByRepo[key] : '';
    const defaultTemplate = getDefaultTemplateForRepository(key);
    customPromptTemplateInput.value = customTemplate || defaultTemplate || defaultCustomPromptTemplate;
  }

  function getDefaultTemplateForRepository(repositoryKey) {
    if (repositoryKey && repoDefaultPromptTemplates[repositoryKey]) {
      return repoDefaultPromptTemplates[repositoryKey];
    }
    return superDefaultPromptTemplate;
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function buildCursorAuthHeader(apiKey) {
    return `Basic ${btoa(`${apiKey}:`)}`;
  }

  async function loadModels(apiKey, selectedModel = '') {
    modelSelect.disabled = true;
    refreshModelsBtn.disabled = true;
    modelSelect.innerHTML = '<option value="">Loading models...</option>';

    try {
      const response = await fetchWithTimeout('https://api.cursor.com/v0/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        modelSelect.innerHTML = '<option value="">Failed to load models</option>';
        return;
      }

      const data = await response.json();
      const models = Array.isArray(data.models) ? data.models : [];

      if (models.length === 0) {
        modelSelect.innerHTML = '<option value="">No models available</option>';
        return;
      }

      modelSelect.innerHTML = '<option value="">(Default - let Cursor choose)</option>';
      models.forEach((model) => {
        const modelId = typeof model === 'string' ? model : model.id || model.name;
        const modelName = typeof model === 'string' ? model : model.name || model.id;
        if (modelId) {
          const option = document.createElement('option');
          option.value = modelId;
          option.textContent = modelName;
          modelSelect.appendChild(option);
        }
      });

      modelSelect.disabled = false;

      if (selectedModel) {
        modelSelect.value = selectedModel;
      }
    } catch (error) {
      modelSelect.innerHTML = '<option value="">Error loading models</option>';
    } finally {
      refreshModelsBtn.disabled = false;
    }
  }
});
