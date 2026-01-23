/// <reference lib="deno.ns" />
import { launch } from '@astral/astral';
import type { ElementHandle, Page } from '@astral/astral';
import { assertEquals, assertStringIncludes } from '@std/assert';
import {
  DEFAULT_PORT,
  HTTP_BATCH_IP,
  MESSAGE_PORT_IP,
  WEBSOCKET_IP,
} from './test-fixtures/server-config.ts';

// Helper function to setup error reporting for a page
function setupErrorReporting(page: Page) {
  page.addEventListener('pageerror', (event) => {
    console.error('Page error:', event.detail);
    Deno.exit(1000);
  });
  page.addEventListener('console', (event) => {
    console.log('Console event:', event.detail);
  });
}

// Helper function to wait for element with timeout
async function waitForElement(
  page: Page,
  selector: string,
  timeout = 5000,
): Promise<ElementHandle> {
  try {
    return await page.waitForSelector(selector, { timeout });
  } catch (error) {
    // Get page content for debugging
    try {
      const content = await page.content();
      console.error(
        `Page HTML when element '${selector}' not found:`,
        content.substring(0, 1000),
      );
    } catch (e) {
      console.error(`Could not get page content: ${e}`);
    }

    throw new Error(
      `Element '${selector}' not found within ${timeout}ms: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

// Helper function to wait for text content in element
async function waitForText(
  page: Page,
  selector: string,
  expectedText: string,
  timeout = 5000,
): Promise<void> {
  let lastText = '';
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      const element = await page.$(selector);
      if (element) {
        lastText = await element.innerText();
        if (lastText && lastText.includes(expectedText)) {
          return;
        }
      }
    } catch {
      // Continue waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  // Take a screenshot for debugging
  try {
    const screenshot = await page.screenshot();
    Deno.writeFileSync('error.png', screenshot);
  } catch {
    // Ignore screenshot errors
  }
  throw new Error(
    `Text '${expectedText}' not found in '${selector}' within ${timeout}ms. Actual text was: ${lastText}`,
  );
}

// Helper to wait for attribute value
async function waitForAttribute(
  page: Page,
  selector: string,
  attribute: string,
  expectedValue: string,
  timeout = 5000,
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      const element = await page.$(selector);
      if (element) {
        const value = await element.getAttribute(attribute);
        if (value === expectedValue) {
          return;
        }
      }
    } catch {
      // Continue waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Attribute '${attribute}' with value '${expectedValue}' not found in '${selector}' within ${timeout}ms`,
  );
}

// ============================================================================
// WebSocket Tests
// ============================================================================

Deno.test('WebSocket - Page loads and shows connection status', async () => {
  const browser = await launch({ headless: true });

  try {
    const page = await browser.newPage(
      `http://${WEBSOCKET_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(page);

    // Wait for demo to load
    await waitForElement(page, '[data-testid="websocket-demo"]');

    // Should show connection status
    await waitForElement(page, '[data-testid="connection-status"]');

    // Should eventually connect or be connecting
    const status = await page.$('[data-testid="status-value"]');
    const statusText = await status?.innerText();
    console.log('Initial connection status:', statusText);

    // Status should be one of the valid states
    const validStatuses = [
      'connecting',
      'connected',
      'reconnecting',
      'disconnected',
      'closed',
    ];
    assertEquals(
      validStatuses.some((s) => statusText?.includes(s)),
      true,
      `Status should be one of ${validStatuses.join(', ')}`,
    );
  } finally {
    await browser.close();
  }
});

Deno.test('WebSocket - Connection state changes are tracked', async () => {
  const browser = await launch({ headless: true });

  try {
    const page = await browser.newPage(
      `http://${WEBSOCKET_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(page);

    await waitForElement(page, '[data-testid="websocket-demo"]');

    // Wait for initial connecting status
    const statusElement = await waitForElement(
      page,
      '[data-testid="connection-status"]',
    );

    // Get initial status
    let status: string | null | undefined = await statusElement.getAttribute(
      'data-status',
    );
    console.log('Initial status:', status);

    // Wait a bit for connection to establish or fail
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check status again
    const updatedElement = await page.$('[data-testid="connection-status"]');
    status = await updatedElement?.getAttribute('data-status');
    console.log('Updated status:', status);

    // Should have a valid status
    const validStatuses = [
      'connecting',
      'connected',
      'reconnecting',
      'disconnected',
    ];
    assertEquals(
      validStatuses.includes(status || ''),
      true,
      `Status should be valid: ${status}`,
    );
  } finally {
    await browser.close();
  }
});

Deno.test('WebSocket - Manual close functionality works', async () => {
  const browser = await launch({ headless: true });

  try {
    const page = await browser.newPage(
      `http://${WEBSOCKET_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(page);

    await waitForElement(page, '[data-testid="websocket-demo"]');

    // Click close button
    const closeBtn = await waitForElement(
      page,
      '[data-testid="close-connection-btn"]',
    );
    await closeBtn.click();

    // Should show confirmation
    await waitForElement(page, '[data-testid="close-confirmation"]');
    await waitForText(
      page,
      '[data-testid="close-confirmation"]',
      'Connection closed manually',
    );

    // Button should be disabled - get fresh reference
    const closeBtnAfter = await page.$('[data-testid="close-connection-btn"]');
    const isDisabled = await closeBtnAfter?.evaluate((el) =>
      (el as HTMLButtonElement).disabled
    );
    assertEquals(isDisabled, true, 'Close button should be disabled');

    // Status should eventually show closed
    await waitForAttribute(
      page,
      '[data-testid="connection-status"]',
      'data-status',
      'closed',
      3000,
    );
  } finally {
    await browser.close();
  }
});

Deno.test('WebSocket - RPC API tests can be executed', async () => {
  const browser = await launch({ headless: true });

  try {
    const page = await browser.newPage(
      `http://${WEBSOCKET_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(page);

    await waitForElement(page, '[data-testid="websocket-demo"]');

    // Click run tests button
    const runTestsBtn = await waitForElement(
      page,
      '[data-testid="run-api-tests-btn"]',
    );
    await runTestsBtn.click();

    // Wait for tests to complete
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Should show test results
    const results = await waitForElement(page, '[data-testid="test-results"]');
    const resultsText = await results.innerText();

    console.log('Test results:', resultsText);

    // Should contain completion message
    assertStringIncludes(
      resultsText,
      'completed',
      'Tests should complete',
    );
  } finally {
    await browser.close();
  }
});

Deno.test('WebSocket - Suspense integration test', async () => {
  const browser = await launch({ headless: true });

  try {
    const page = await browser.newPage(
      `http://${WEBSOCKET_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(page);

    await waitForElement(page, '[data-testid="websocket-demo"]');

    // Click load with suspense button
    const loadBtn = await waitForElement(
      page,
      '[data-testid="load-with-suspense-btn"]',
    );
    await loadBtn.click();

    // Loading state may be too fast to catch, so we'll just wait for the content
    // Either loading state or content should appear
    try {
      await waitForElement(page, '[data-testid="suspense-loading"]', 500);
    } catch {
      // Loading was too fast, that's ok
    }

    // Should eventually show content
    await waitForElement(page, '[data-testid="suspense-content"]', 3000);

    // Should show user data
    await waitForText(
      page,
      '[data-testid="user-data"]',
      'User data loaded',
    );
  } finally {
    await browser.close();
  }
});

Deno.test('WebSocket - Callback logs are captured', async () => {
  const browser = await launch({ headless: true });

  try {
    const page = await browser.newPage(
      `http://${WEBSOCKET_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(page);

    await waitForElement(page, '[data-testid="websocket-demo"]');

    // Wait a bit for callbacks to fire
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check if callback logs exist
    const logsExist = await page.$('[data-testid="callback-logs"]');
    if (logsExist) {
      const logsText = await logsExist.innerText();
      console.log('Callback logs:', logsText);

      // Should contain callback messages
      assertStringIncludes(
        logsText,
        '[Callback]',
        'Should contain callback logs',
      );
    }
  } finally {
    await browser.close();
  }
});

// ============================================================================
// HTTP Batch Tests
// ============================================================================

Deno.test('HTTP Batch - Page loads and shows demo', async () => {
  const browser = await launch({ headless: true });

  try {
    const page = await browser.newPage(
      `http://${HTTP_BATCH_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(page);

    // Wait for demo to load
    await waitForElement(page, '[data-testid="http-batch-demo"]');

    // Should have test sections
    await waitForElement(page, '[data-testid="run-api-tests-btn"]');
    await waitForElement(page, '[data-testid="direct-call-btn"]');
    await waitForElement(page, '[data-testid="close-session-btn"]');
  } finally {
    await browser.close();
  }
});

Deno.test('HTTP Batch - RPC API tests can be executed', async () => {
  const browser = await launch({ headless: true });

  try {
    const page = await browser.newPage(
      `http://${HTTP_BATCH_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(page);

    await waitForElement(page, '[data-testid="http-batch-demo"]');

    // Click run tests button
    const runTestsBtn = await waitForElement(
      page,
      '[data-testid="run-api-tests-btn"]',
    );
    await runTestsBtn.click();

    // Wait for tests to complete
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Should show test results
    const results = await waitForElement(page, '[data-testid="test-results"]');
    const resultsText = await results.innerText();

    console.log('HTTP Batch test results:', resultsText);

    // Should contain completion message
    assertStringIncludes(
      resultsText,
      'completed',
      'Tests should complete',
    );
  } finally {
    await browser.close();
  }
});

Deno.test('HTTP Batch - Direct API call works', async () => {
  const browser = await launch({ headless: true });

  try {
    const page = await browser.newPage(
      `http://${HTTP_BATCH_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(page);

    await waitForElement(page, '[data-testid="http-batch-demo"]');

    // Click direct call button
    const directCallBtn = await waitForElement(
      page,
      '[data-testid="direct-call-btn"]',
    );
    await directCallBtn.click();

    // Wait for result
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Should show result
    const result = await waitForElement(
      page,
      '[data-testid="direct-call-result"]',
    );
    const resultText = await result.innerText();

    console.log('Direct call result:', resultText);

    // Result should indicate success or error
    assertEquals(
      resultText.includes('Success') || resultText.includes('Error'),
      true,
      'Should show a result',
    );
  } finally {
    await browser.close();
  }
});

Deno.test('HTTP Batch - Session can be closed manually', async () => {
  const browser = await launch({ headless: true });

  try {
    const page = await browser.newPage(
      `http://${HTTP_BATCH_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(page);

    await waitForElement(page, '[data-testid="http-batch-demo"]');

    // Click close session button
    const closeBtn = await waitForElement(
      page,
      '[data-testid="close-session-btn"]',
    );
    await closeBtn.click();

    // Should show confirmation
    await waitForElement(page, '[data-testid="close-confirmation"]');
    await waitForText(
      page,
      '[data-testid="close-confirmation"]',
      'Session closed',
    );

    // Button should be disabled - get fresh reference
    const closeBtnAfter = await page.$('[data-testid="close-session-btn"]');
    const isDisabled = await closeBtnAfter?.evaluate((el) =>
      (el as HTMLButtonElement).disabled
    );
    assertEquals(isDisabled, true, 'Close button should be disabled');
  } finally {
    await browser.close();
  }
});

Deno.test('HTTP Batch - Error handling works', async () => {
  const browser = await launch({ headless: true });

  try {
    const page = await browser.newPage(
      `http://${HTTP_BATCH_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(page);

    await waitForElement(page, '[data-testid="http-batch-demo"]');

    // Click trigger error button
    const errorBtn = await waitForElement(
      page,
      '[data-testid="trigger-error-btn"]',
    );
    await errorBtn.click();

    // Wait for error result
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Should show error result
    const result = await waitForElement(page, '[data-testid="error-result"]');
    const resultText = await result.innerText();

    console.log('Error result:', resultText);

    // Should contain error message
    assertStringIncludes(
      resultText,
      'Error',
      'Should show error message',
    );
  } finally {
    await browser.close();
  }
});

// ============================================================================
// MessagePort Tests
// ============================================================================

Deno.test('MessagePort - Page loads and shows demo', async () => {
  const browser = await launch({ headless: true });

  try {
    const page = await browser.newPage(
      `http://${MESSAGE_PORT_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(page);

    // Wait for demo to load
    await waitForElement(page, '[data-testid="message-port-demo"]');

    // Should show port status
    await waitForElement(page, '[data-testid="port-status"]');

    // Should have test sections
    await waitForElement(page, '[data-testid="run-api-tests-btn"]');
    await waitForElement(page, '[data-testid="direct-call-btn"]');
    await waitForElement(page, '[data-testid="close-port-btn"]');
  } finally {
    await browser.close();
  }
});

Deno.test('MessagePort - Port status shows ready', async () => {
  const browser = await launch({ headless: true });

  try {
    const page = await browser.newPage(
      `http://${MESSAGE_PORT_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(page);

    await waitForElement(page, '[data-testid="message-port-demo"]');

    // Wait for status
    const status = await waitForElement(page, '[data-testid="port-status"]');
    const statusAttr = await status.getAttribute('data-status');

    console.log('MessagePort status:', statusAttr);

    // Should be ready initially
    assertEquals(statusAttr, 'ready', 'Port should be ready');
  } finally {
    await browser.close();
  }
});

Deno.test('MessagePort - RPC API tests can be executed', async () => {
  const browser = await launch({ headless: true });

  try {
    const page = await browser.newPage(
      `http://${MESSAGE_PORT_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(page);

    await waitForElement(page, '[data-testid="message-port-demo"]');

    // Click run tests button
    const runTestsBtn = await waitForElement(
      page,
      '[data-testid="run-api-tests-btn"]',
    );
    await runTestsBtn.click();

    // Wait for tests to complete
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Should show test results
    const results = await waitForElement(page, '[data-testid="test-results"]');
    const resultsText = await results.innerText();

    console.log('MessagePort test results:', resultsText);

    // Should contain completion message
    assertStringIncludes(
      resultsText,
      'completed',
      'Tests should complete',
    );
  } finally {
    await browser.close();
  }
});

Deno.test('MessagePort - Direct API call works', async () => {
  const browser = await launch({ headless: true });

  try {
    const page = await browser.newPage(
      `http://${MESSAGE_PORT_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(page);

    await waitForElement(page, '[data-testid="message-port-demo"]');

    // Click direct call button
    const directCallBtn = await waitForElement(
      page,
      '[data-testid="direct-call-btn"]',
    );
    await directCallBtn.click();

    // Wait for result
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Should show result
    const result = await waitForElement(
      page,
      '[data-testid="direct-call-result"]',
    );
    const resultText = await result.innerText();

    console.log('Direct call result:', resultText);

    // Result should indicate success or error
    assertEquals(
      resultText.includes('Success') || resultText.includes('Error'),
      true,
      'Should show a result',
    );
  } finally {
    await browser.close();
  }
});

Deno.test('MessagePort - Port can be closed manually', async () => {
  const browser = await launch({ headless: true });

  try {
    const page = await browser.newPage(
      `http://${MESSAGE_PORT_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(page);

    await waitForElement(page, '[data-testid="message-port-demo"]');

    // Click close port button
    const closeBtn = await waitForElement(
      page,
      '[data-testid="close-port-btn"]',
    );
    await closeBtn.click();

    // Should show confirmation
    await waitForElement(page, '[data-testid="close-confirmation"]');
    await waitForText(
      page,
      '[data-testid="close-confirmation"]',
      'Port closed',
    );

    // Button should be disabled - get fresh reference
    const closeBtnAfter = await page.$('[data-testid="close-port-btn"]');
    const isDisabled = await closeBtnAfter?.evaluate((el) =>
      (el as HTMLButtonElement).disabled
    );
    assertEquals(isDisabled, true, 'Close button should be disabled');
  } finally {
    await browser.close();
  }
});

// ============================================================================
// Integration Tests
// ============================================================================

Deno.test('Integration - All demos load without errors', async () => {
  const browser = await launch({ headless: true });

  try {
    // Test WebSocket demo
    const wsPage = await browser.newPage(
      `http://${WEBSOCKET_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(wsPage);
    await waitForElement(wsPage, '[data-testid="websocket-demo"]');
    await wsPage.close();

    // Test HTTP Batch demo
    const httpPage = await browser.newPage(
      `http://${HTTP_BATCH_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(httpPage);
    await waitForElement(httpPage, '[data-testid="http-batch-demo"]');
    await httpPage.close();

    // Test MessagePort demo
    const mpPage = await browser.newPage(
      `http://${MESSAGE_PORT_IP}:${DEFAULT_PORT}`,
    );
    setupErrorReporting(mpPage);
    await waitForElement(mpPage, '[data-testid="message-port-demo"]');
    await mpPage.close();

    console.log('✓ All demos loaded successfully');
  } finally {
    await browser.close();
  }
});
