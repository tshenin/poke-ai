// Annotation content script for platform pages.
(function () {
  let annotationMode = false;
  let annotations = [];
  let hoveredElement = null;
  let highlightOverlay = null;
  let annotationPanel = null;

  const HIGHLIGHT_COLOR = 'rgba(59, 130, 246, 0.3)';
  const HIGHLIGHT_BORDER = '2px solid #3b82f6';

  function init() {
    createHighlightOverlay();
    loadAnnotations();
    setupMessageListener();
  }

  function createHighlightOverlay() {
    highlightOverlay = document.createElement('div');
    highlightOverlay.id = 'poke-highlight-overlay';
    highlightOverlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      background: ${HIGHLIGHT_COLOR};
      border: ${HIGHLIGHT_BORDER};
      border-radius: 4px;
      z-index: 2147483646;
      display: none;
      transition: all 0.1s ease;
    `;
    document.body.appendChild(highlightOverlay);
  }

  function createAnnotationPanel() {
    if (annotationPanel) return;

    annotationPanel = document.createElement('div');
    annotationPanel.id = 'poke-annotation-panel';
    annotationPanel.innerHTML = `
      <div class="poke-panel-header">
        <span class="poke-panel-title">🎯 Add Annotation</span>
        <button class="poke-panel-close">&times;</button>
      </div>
      <div class="poke-panel-body">
        <div class="poke-element-info"></div>
        <textarea class="poke-note-input" placeholder="Describe the change needed (e.g., 'Change this icon to a gear icon' or 'Fix button alignment')"></textarea>
        <div class="poke-panel-actions">
          <button class="poke-btn poke-btn-cancel">Cancel</button>
          <button class="poke-btn poke-btn-save">Save Annotation</button>
        </div>
      </div>
    `;
    annotationPanel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 400px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: none;
    `;

    const style = document.createElement('style');
    style.textContent = `
      #poke-annotation-panel .poke-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #e5e7eb;
      }
      #poke-annotation-panel .poke-panel-title {
        font-size: 16px;
        font-weight: 600;
        color: #111827;
      }
      #poke-annotation-panel .poke-panel-close {
        background: none;
        border: none;
        font-size: 24px;
        color: #6b7280;
        cursor: pointer;
        padding: 0;
        line-height: 1;
      }
      #poke-annotation-panel .poke-panel-close:hover {
        color: #111827;
      }
      #poke-annotation-panel .poke-panel-body {
        padding: 20px;
      }
      #poke-annotation-panel .poke-element-info {
        background: #f3f4f6;
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 16px;
        font-size: 12px;
        font-family: ui-monospace, monospace;
        color: #374151;
        word-break: break-all;
        max-height: 80px;
        overflow-y: auto;
      }
      #poke-annotation-panel .poke-note-input {
        width: 100%;
        min-height: 100px;
        padding: 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 14px;
        resize: vertical;
        font-family: inherit;
        margin-bottom: 16px;
      }
      #poke-annotation-panel .poke-note-input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
      #poke-annotation-panel .poke-panel-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      #poke-annotation-panel .poke-btn {
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        border: none;
        transition: background 0.2s;
      }
      #poke-annotation-panel .poke-btn-cancel {
        background: #e5e7eb;
        color: #374151;
      }
      #poke-annotation-panel .poke-btn-cancel:hover {
        background: #d1d5db;
      }
      #poke-annotation-panel .poke-btn-save {
        background: #3b82f6;
        color: white;
      }
      #poke-annotation-panel .poke-btn-save:hover {
        background: #2563eb;
      }
      .poke-annotation-marker {
        position: absolute;
        width: 24px;
        height: 24px;
        background: #ef4444;
        border: 2px solid white;
        border-radius: 50%;
        color: white;
        font-size: 12px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2147483645;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .poke-annotation-marker:hover {
        transform: scale(1.1);
      }
      .poke-mode-indicator {
        position: fixed;
        top: 20px;
        right: 20px;
        background: #3b82f6;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 14px;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .poke-mode-indicator button {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      .poke-mode-indicator button:hover {
        background: rgba(255,255,255,0.3);
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(annotationPanel);

    annotationPanel.querySelector('.poke-panel-close').addEventListener('click', hideAnnotationPanel);
    annotationPanel.querySelector('.poke-btn-cancel').addEventListener('click', hideAnnotationPanel);
    annotationPanel.querySelector('.poke-btn-save').addEventListener('click', saveCurrentAnnotation);
  }

  function showModeIndicator() {
    let indicator = document.getElementById('poke-mode-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'poke-mode-indicator';
      indicator.className = 'poke-mode-indicator';
      indicator.innerHTML = `
        <span>🎯 Annotation Mode Active</span>
        <button id="poke-exit-mode">Exit</button>
      `;
      document.body.appendChild(indicator);
      indicator.querySelector('#poke-exit-mode').addEventListener('click', () => {
        disableAnnotationMode();
        chrome.runtime.sendMessage({ type: 'ANNOTATION_MODE_CHANGED', enabled: false });
      });
    }
    indicator.style.display = 'flex';
  }

  function hideModeIndicator() {
    const indicator = document.getElementById('poke-mode-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  function enableAnnotationMode() {
    annotationMode = true;
    createAnnotationPanel();
    showModeIndicator();
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('click', handleClick, true);
    document.body.style.cursor = 'crosshair';
  }

  function disableAnnotationMode() {
    annotationMode = false;
    hideModeIndicator();
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('click', handleClick, true);
    document.body.style.cursor = '';
    highlightOverlay.style.display = 'none';
    hoveredElement = null;
  }

  function handleMouseMove(e) {
    if (!annotationMode) return;

    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (!element || element === highlightOverlay || element.closest('#poke-annotation-panel') || element.closest('#poke-mode-indicator')) {
      highlightOverlay.style.display = 'none';
      hoveredElement = null;
      return;
    }

    hoveredElement = element;
    const rect = element.getBoundingClientRect();
    highlightOverlay.style.display = 'block';
    highlightOverlay.style.top = rect.top + 'px';
    highlightOverlay.style.left = rect.left + 'px';
    highlightOverlay.style.width = rect.width + 'px';
    highlightOverlay.style.height = rect.height + 'px';
  }

  function handleClick(e) {
    if (!annotationMode) return;
    if (e.target.closest('#poke-annotation-panel') || e.target.closest('#poke-mode-indicator') || e.target.closest('.poke-annotation-marker')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (hoveredElement) {
      showAnnotationPanel(hoveredElement);
    }
  }

  let pendingElement = null;

  function showAnnotationPanel(element) {
    pendingElement = element;
    const selector = generateSelector(element);
    const elementInfo = annotationPanel.querySelector('.poke-element-info');
    elementInfo.textContent = selector;
    annotationPanel.querySelector('.poke-note-input').value = '';
    annotationPanel.style.display = 'block';
    annotationPanel.querySelector('.poke-note-input').focus();
  }

  function hideAnnotationPanel() {
    annotationPanel.style.display = 'none';
    pendingElement = null;
  }

  function saveCurrentAnnotation() {
    const note = annotationPanel.querySelector('.poke-note-input').value.trim();
    if (!note || !pendingElement) {
      return;
    }

    const selector = generateSelector(pendingElement);
    const rect = pendingElement.getBoundingClientRect();
    const annotation = {
      id: Date.now().toString(),
      selector,
      note,
      tagName: pendingElement.tagName.toLowerCase(),
      textContent: (pendingElement.textContent || '').slice(0, 100).trim(),
      url: window.location.href,
      timestamp: Date.now(),
      position: {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX
      }
    };

    annotations.push(annotation);
    saveAnnotations();
    renderAnnotationMarkers();
    hideAnnotationPanel();
  }

  function generateSelector(element) {
    if (element.id && isValidCssId(element.id)) {
      return `#${element.id}`;
    }

    const path = [];
    let current = element;

    while (current && current !== document.body && path.length < 5) {
      let selector = current.tagName.toLowerCase();

      if (current.id && isValidCssId(current.id)) {
        selector = `#${current.id}`;
        path.unshift(selector);
        break;
      }

      if (current.className && typeof current.className === 'string') {
        const classes = current.className.split(/\s+/).filter(c => c && !c.startsWith('poke-'));
        if (classes.length > 0) {
          selector += '.' + classes.slice(0, 2).join('.');
        }
      }

      const testId = current.getAttribute('data-testid');
      if (testId) {
        selector += `[data-testid="${CSS.escape(testId)}"]`;
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  function isValidCssId(id) {
    // CSS IDs cannot start with a digit or hyphen followed by digit
    return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(id);
  }

  function renderAnnotationMarkers() {
    document.querySelectorAll('.poke-annotation-marker').forEach(m => m.remove());

    annotations.forEach((annotation, index) => {
      let targetElement = null;
      try {
        targetElement = document.querySelector(annotation.selector);
      } catch (e) {
        // Invalid selector, skip this annotation marker
        return;
      }
      if (!targetElement) return;

      const marker = document.createElement('div');
      marker.className = 'poke-annotation-marker';
      marker.textContent = (index + 1).toString();
      marker.title = annotation.note;

      const rect = targetElement.getBoundingClientRect();
      marker.style.top = (rect.top + window.scrollY - 12) + 'px';
      marker.style.left = (rect.right + window.scrollX - 12) + 'px';

      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        showAnnotationDetails(annotation, index);
      });

      document.body.appendChild(marker);
    });
  }

  function showAnnotationDetails(annotation, index) {
    const existing = document.getElementById('poke-annotation-details');
    if (existing) existing.remove();

    const details = document.createElement('div');
    details.id = 'poke-annotation-details';
    details.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 400px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
    `;
    details.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <span style="font-size: 16px; font-weight: 600; color: #111827;">Annotation #${index + 1}</span>
        <button id="poke-details-close" style="background: none; border: none; font-size: 24px; color: #6b7280; cursor: pointer;">&times;</button>
      </div>
      <div style="background: #f3f4f6; border-radius: 6px; padding: 12px; margin-bottom: 12px; font-size: 12px; font-family: monospace; color: #374151; word-break: break-all;">
        ${annotation.selector}
      </div>
      <div style="background: #fef3c7; border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 14px; color: #92400e;">
        ${annotation.note}
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="poke-delete-annotation" style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer;">Delete</button>
        <button id="poke-close-details" style="padding: 8px 16px; background: #e5e7eb; color: #374151; border: none; border-radius: 6px; cursor: pointer;">Close</button>
      </div>
    `;

    document.body.appendChild(details);

    details.querySelector('#poke-details-close').addEventListener('click', () => details.remove());
    details.querySelector('#poke-close-details').addEventListener('click', () => details.remove());
    details.querySelector('#poke-delete-annotation').addEventListener('click', () => {
      annotations.splice(index, 1);
      saveAnnotations();
      renderAnnotationMarkers();
      details.remove();
    });
  }

  function saveAnnotations() {
    const pageUrl = window.location.origin + window.location.pathname;
    chrome.storage.local.get(['pageAnnotations'], (result) => {
      const pageAnnotations = result.pageAnnotations || {};
      if (annotations.length === 0) {
        delete pageAnnotations[pageUrl];
      } else {
        pageAnnotations[pageUrl] = annotations;
      }
      chrome.storage.local.set({ pageAnnotations });
    });
  }

  function loadAnnotations() {
    const pageUrl = window.location.origin + window.location.pathname;
    chrome.storage.local.get(['pageAnnotations'], (result) => {
      const pageAnnotations = result.pageAnnotations || {};
      annotations = pageAnnotations[pageUrl] || [];
      renderAnnotationMarkers();
    });
  }

  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'TOGGLE_ANNOTATION_MODE') {
        if (message.enabled) {
          enableAnnotationMode();
        } else {
          disableAnnotationMode();
        }
        sendResponse({ success: true, enabled: annotationMode });
      } else if (message.type === 'GET_ANNOTATIONS') {
        sendResponse({ annotations });
      } else if (message.type === 'CLEAR_ANNOTATIONS') {
        annotations = [];
        saveAnnotations();
        renderAnnotationMarkers();
        sendResponse({ success: true });
      } else if (message.type === 'RELOAD_ANNOTATIONS') {
        loadAnnotations();
        sendResponse({ success: true });
      } else if (message.type === 'GET_ANNOTATION_MODE') {
        sendResponse({ enabled: annotationMode });
      }
    });
  }

  // Re-render markers on scroll/resize
  let renderTimeout;
  function debouncedRender() {
    clearTimeout(renderTimeout);
    renderTimeout = setTimeout(renderAnnotationMarkers, 100);
  }
  window.addEventListener('scroll', debouncedRender);
  window.addEventListener('resize', debouncedRender);

  init();
})();
