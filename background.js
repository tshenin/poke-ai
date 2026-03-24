const CURSOR_API_URL = 'https://api.cursor.com/v0/agents';
const DEFAULT_REPOSITORY = '';
const DEFAULT_REF = 'main';
const MAX_DESCRIPTION_LENGTH = 12000;
const SUPER_DEFAULT_PROMPT_TEMPLATE = [
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
const REPO_DEFAULT_PROMPT_TEMPLATES = {};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RUN_AGENT' || message.type === 'TRIGGER_AGENT') {
    handleRunAgent(message.payload || {})
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          success: false,
          errorCode: 'UNEXPECTED_ERROR',
          errorMessage: `Unexpected extension error: ${error.message}`,
        });
      });
    return true;
  }
});

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function truncateDescription(descriptionText) {
  if (descriptionText.length <= MAX_DESCRIPTION_LENGTH) {
    return descriptionText;
  }
  const truncated = descriptionText.slice(0, MAX_DESCRIPTION_LENGTH).trim();
  return `${truncated}\n\n[Description truncated by extension due to size limit.]`;
}

function getRepositoryKey(repositoryUrl) {
  const match = (repositoryUrl || '').match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/i);
  if (!match) {
    return '';
  }
  return `${match[1]}/${match[2]}`.toLowerCase();
}

function getDefaultPromptTemplate(repositoryUrl) {
  const repositoryKey = getRepositoryKey(repositoryUrl);
  return REPO_DEFAULT_PROMPT_TEMPLATES[repositoryKey] || SUPER_DEFAULT_PROMPT_TEMPLATE;
}

function applyPlaceholders(template, context) {
  const title = context.ticketTitle || 'Untitled ticket';
  const description = truncateDescription(context.ticketDescription || '(No description provided in Jira.)');
  const ticket = context.ticketKey || 'UNKNOWN';

  let result = template
    .replace(/\{\{\s*ticket\s*\}\}/gi, ticket)
    .replace(/\{\{\s*title\s*\}\}/gi, title)
    .replace(/\{\{\s*description\s*\}\}/gi, description);

  // Append annotations if present
  const annotations = context.annotations || [];
  if (annotations.length > 0) {
    result += '\n\n---\n\nUI Annotations (elements marked for changes):\n';
    annotations.forEach((ann, i) => {
      result += `\n${i + 1}. ${ann.note}`;
      result += `\n   Element selector: ${ann.selector}`;
      if (ann.textContent) {
        result += `\n   Element text: "${ann.textContent}"`;
      }
      if (ann.tagName) {
        result += `\n   Tag: <${ann.tagName}>`;
      }
      result += '\n';
    });
    result += '\nUse these annotations as additional context for UI-related changes.';
  }

  return result;
}

function buildAnnotationsOnlyPrompt(annotations, pageUrl) {
  const lines = [
    'You need to implement UI changes based on the annotations below.',
    'Each annotation marks a specific UI element that needs to be modified.',
    '',
    `Source page: ${pageUrl || 'Unknown page'}`,
    '',
    'UI Annotations:',
  ];

  annotations.forEach((ann, i) => {
    lines.push(`\n${i + 1}. ${ann.note}`);
    lines.push(`   Element selector: ${ann.selector}`);
    if (ann.textContent) {
      lines.push(`   Element text: "${ann.textContent}"`);
    }
    if (ann.tagName) {
      lines.push(`   Tag: <${ann.tagName}>`);
    }
  });

  lines.push('');
  lines.push('Find the components matching these selectors and implement the requested changes.');
  lines.push('Run pre-commit tasks (lint, tests, formatting) and create a pull request when done.');

  return lines.join('\n');
}

function mapHttpError(status, upstreamMessage) {
  if (status === 400) {
    return {
      errorCode: 'BAD_REQUEST',
      errorMessage: upstreamMessage || 'Cursor rejected the request payload.',
    };
  }
  if (status === 401) {
    return {
      errorCode: 'UNAUTHORIZED',
      errorMessage: 'Invalid Cursor API key. Update it in extension settings.',
    };
  }
  if (status === 403) {
    return {
      errorCode: 'FORBIDDEN',
      errorMessage: upstreamMessage || 'Cursor API access denied for this request.',
    };
  }
  if (status === 429) {
    return {
      errorCode: 'RATE_LIMITED',
      errorMessage: 'Cursor API rate limit reached. Try again shortly.',
    };
  }
  if (status >= 500) {
    return {
      errorCode: 'CURSOR_SERVER_ERROR',
      errorMessage: 'Cursor API server error. Try again later.',
    };
  }
  return {
    errorCode: 'HTTP_ERROR',
    errorMessage: upstreamMessage || `Cursor API request failed with HTTP ${status}.`,
  };
}

function normalizeGithubRepository(repositoryUrl) {
  const trimmed = (repositoryUrl || '').trim();
  const match = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?\/?$/i);
  if (!match) {
    return null;
  }

  const owner = match[1];
  const repo = match[2];
  return `https://github.com/${owner}/${repo}`;
}

function buildCursorAuthHeader(apiKey) {
  return `Basic ${btoa(`${apiKey}:`)}`;
}

function buildBearerAuthHeader(apiKey) {
  return `Bearer ${apiKey}`;
}

async function requestAgentLaunch(body, authHeaderValue) {
  return fetch(CURSOR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeaderValue,
    },
    body: JSON.stringify(body),
  });
}

async function handleRunAgent(payload) {
  const requestId = createRequestId();
  const startMs = Date.now();

  const {
    cursorApiKey,
    targetRepository = DEFAULT_REPOSITORY,
    targetRef = DEFAULT_REF,
    selectedModel = '',
    customPromptsByRepo = {},
  } = await chrome.storage.local.get([
    'cursorApiKey',
    'targetRepository',
    'targetRef',
    'selectedModel',
    'customPromptsByRepo',
  ]);

  if (!cursorApiKey) {
    return {
      success: false,
      errorCode: 'NO_API_KEY',
      errorMessage: 'Cursor API key not configured. Open settings and save it first.',
    };
  }

  const normalizedRepository = normalizeGithubRepository(targetRepository);
  if (!normalizedRepository) {
    return {
      success: false,
      errorCode: 'INVALID_REPOSITORY',
      errorMessage: 'Repository URL is invalid. Use format https://github.com/<owner>/<repo>.',
    };
  }
  const normalizedRef = (targetRef || '').trim() || DEFAULT_REF;

  const repositoryKey = getRepositoryKey(normalizedRepository);
  
  // Handle annotations-only mode (from platform pages)
  let resolvedPrompt;
  if (payload.annotationsOnly && payload.annotations?.length > 0) {
    resolvedPrompt = buildAnnotationsOnlyPrompt(payload.annotations, payload.pageUrl);
  } else {
    const customTemplate =
      customPromptsByRepo && typeof customPromptsByRepo === 'object'
        ? customPromptsByRepo[repositoryKey]
        : '';
    const promptTemplate =
      typeof customTemplate === 'string' && customTemplate.trim()
        ? customTemplate
        : getDefaultPromptTemplate(normalizedRepository);
    resolvedPrompt = applyPlaceholders(promptTemplate, payload);
  }

  const body = {
    prompt: { text: resolvedPrompt },
    source: {
      repository: normalizedRepository,
      ref: normalizedRef,
    },
    target: {
      autoCreatePr: true,
    },
  };

  if (selectedModel) {
    body.model = selectedModel;
  }

  try {
    console.info(`[POKE-AI][${requestId}] Launching agent`, {
      repository: normalizedRepository,
      ref: normalizedRef,
    });
    const authVariants = [
      { label: 'bearer', value: buildBearerAuthHeader(cursorApiKey) },
      { label: 'basic', value: buildCursorAuthHeader(cursorApiKey) },
    ];
    let response = null;
    let authUsed = '';

    for (const variant of authVariants) {
      const attemptedResponse = await requestAgentLaunch(body, variant.value);
      if (attemptedResponse.status !== 401) {
        response = attemptedResponse;
        authUsed = variant.label;
        break;
      }
      response = attemptedResponse;
      authUsed = variant.label;
    }

    let responseJson = null;
    try {
      responseJson = await response.json();
    } catch (error) {
      responseJson = null;
    }

    if (!response.ok) {
      const mapped = mapHttpError(
        response.status,
        responseJson?.error?.message || responseJson?.message
      );
      console.warn(`[POKE-AI][${requestId}] Launch failed`, {
        status: response.status,
        code: mapped.errorCode,
        authUsed,
      });
      return {
        success: false,
        errorCode: mapped.errorCode,
        errorMessage: mapped.errorMessage,
      };
    }

    const agentId = responseJson?.id || '';
    const agentUrl = responseJson?.target?.url || '';

    await chrome.storage.local.set({
      lastTriggered: Date.now(),
      lastAgentId: agentId,
      lastAgentUrl: agentUrl,
    });

    console.info(`[POKE-AI][${requestId}] Launch success`, {
      elapsedMs: Date.now() - startMs,
      agentId,
      authUsed,
    });

    return {
      success: true,
      agentId,
      agentUrl,
    };
  } catch (error) {
    console.warn(`[POKE-AI][${requestId}] Network or timeout error`, {
      elapsedMs: Date.now() - startMs,
    });
    return {
      success: false,
      errorCode: 'NETWORK_ERROR',
      errorMessage: 'Network error while calling Cursor API.',
    };
  }
}
