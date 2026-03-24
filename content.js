// Content script for Jira pages.
(function () {
  function extractTicketKey() {
    const href = window.location.href;
    const patterns = [
      /\/browse\/([A-Z][A-Z0-9]+-\d+)/i,
      /selectedIssue=([A-Z][A-Z0-9]+-\d+)/i,
      /\/issues\/([A-Z][A-Z0-9]+-\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = href.match(pattern);
      if (match) {
        return match[1].toUpperCase();
      }
    }

    return null;
  }

  function queryFirstText(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const text = element?.textContent?.trim();
      if (text) {
        return text;
      }
    }
    return '';
  }

  function extractTicketTitle(ticketKey) {
    const selectors = [
      '[data-testid="issue.views.issue-base.foundation.summary.heading"]',
      '[data-testid="issue.views.issue-base.foundation.summary.heading"] span',
      '[data-testid="issue.views.issue-base.foundation.summary.heading"] h1',
      'h1[data-testid*="summary"]',
      '#summary-val',
    ];

    const direct = queryFirstText(selectors);
    if (direct) {
      return direct;
    }

    const pageTitle = document.title || '';
    if (ticketKey && pageTitle.startsWith(ticketKey)) {
      const cleaned = pageTitle.replace(`${ticketKey} - `, '').trim();
      if (cleaned) {
        return cleaned;
      }
    }

    return pageTitle.trim();
  }

  function extractTicketDescription() {
    const selectors = [
      '[data-testid="issue.views.field.rich-text.description"]',
      '[data-testid="issue.views.field.rich-text.description"] [data-renderer-start-pos]',
      '[data-testid="issue.views.issue-base.foundation.description"]',
      '#description-val',
      '[aria-label="Description"]',
    ];

    return queryFirstText(selectors);
  }

  function buildTicketContext() {
    const ticketKey = extractTicketKey();
    const isIssuePage = Boolean(ticketKey);

    if (!isIssuePage) {
      return {
        isIssuePage: false,
        ticketKey: '',
        ticketTitle: '',
        ticketDescription: '',
      };
    }

    return {
      isIssuePage: true,
      ticketKey,
      ticketTitle: extractTicketTitle(ticketKey),
      ticketDescription: extractTicketDescription(),
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_TICKET_CONTEXT') {
      sendResponse(buildTicketContext());
    }
  });
})();
