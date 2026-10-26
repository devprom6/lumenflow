import { test, expect } from '@playwright/test';
import { Keypair, TransactionBuilder, Account, Operation, Networks } from '@stellar/stellar-sdk';

test.describe('End-to-End Swap Journey', () => {
  const testKeypair = Keypair.random();
  const testPublicKey = testKeypair.publicKey();

  test.beforeEach(async ({ page }) => {
    // 1. Inject automated test wallet before page loads
    await page.addInitScript(
      ({ pubKey }) => {
        window.__LUMENFLOW_TEST_WALLET__ = {
          publicKey: pubKey,
          signTransaction: async (xdr: string) => {
            // Non-custodial local signature simulation
            return { signedTxXdr: xdr };
          },
        };
      },
      { pubKey: testPublicKey },
    );

    // 2. Mock API endpoints with realistic responses
    // Challenge
    await page.route('**/auth/challenge', async (route) => {
      const serverAccount = new Account(
        'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
        '0',
      );
      const tx = new TransactionBuilder(serverAccount, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.manageData({
            name: 'SEP10 auth challenge',
            value: 'lumenflow-test',
          }),
        )
        .setTimeout(300)
        .build();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          transaction: tx.toXDR(),
          networkPassphrase: Networks.TESTNET,
        }),
      });
    });

    // Verify
    await page.route('**/auth/verify', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'mock-jwt-session-token',
          user: {
            id: 'user-e2e-1',
            publicKey: testPublicKey,
          },
        }),
      });
    });

    // Quote
    await page.route('**/swap/quote', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'quote-e2e-123',
          sourceAsset: { type: 'native', code: 'XLM' },
          destinationAsset: {
            type: 'credit_alphanum4',
            code: 'USDC',
            issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
          },
          sourceAmount: '50.0000000',
          destinationAmount: '49.5000000',
          minimumReceived: '49.0050000',
          slippageTolerance: 0.01,
          priceImpact: 0.005,
          networkFee: '100',
          platformFee: '0.0750000',
          path: [],
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          createdAt: new Date().toISOString(),
        }),
      });
    });

    // Build
    await page.route('**/swap/build', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          unsignedXdr: 'AAAAAgAAAAD6xtahhF86HnFu3...',
          quoteId: 'quote-e2e-123',
          orderId: 'order-e2e-789',
          addedTrustline: true,
          networkPassphrase: Networks.TESTNET,
        }),
      });
    });

    // Submit
    await page.route('**/swap/submit', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: 'order-e2e-789',
          status: 'COMPLETED',
          stellarTxHash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
          ledger: 123456,
        }),
      });
    });

    // Transactions History
    await page.route('**/transactions*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'order-e2e-789',
            userId: 'user-e2e-1',
            type: 'SWAP',
            status: 'COMPLETED',
            sourceAsset: { type: 'native', code: 'XLM' },
            destinationAsset: {
              type: 'credit_alphanum4',
              code: 'USDC',
              issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
            },
            sourceAmount: '50.0000000',
            destinationAmount: '49.5000000',
            stellarTxHash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]),
      });
    });
  });

  test('completes full swap journey: connect -> quote -> trustline explanation -> sign -> swap -> history', async ({
    page,
  }) => {
    // 1. Visit homepage
    await page.goto('/');
    await expect(page).toHaveTitle(/LumenFlow/);

    // Verify disabled navigation entries for Bridge and Offramp
    const bridgeNav = page.getByRole('button', { name: /bridge/i }).first();
    await expect(bridgeNav).toBeDisabled();

    const offrampNav = page.getByRole('button', { name: /offramp/i }).first();
    await expect(offrampNav).toBeDisabled();

    // 2. Connect Wallet
    const connectBtn = page.getByRole('button', { name: 'Connect Wallet', exact: true });
    await connectBtn.click();

    // Select testnet dev wallet from modal
    const testnetWalletOption = page.getByRole('button', { name: /testnet dev wallet/i });
    await testnetWalletOption.click();

    // Address truncated badge should appear in header
    const addressPrefix = testPublicKey.slice(0, 4);
    await expect(page.getByText(new RegExp(addressPrefix, 'i'))).toBeVisible();

    // 3. Enter swap amount
    const payInput = page.getByLabel(/you pay/i);
    await payInput.fill('50');

    // 4. Live quote received
    await expect(page.getByText(/minimum received/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('49.0050000 USDC')).toBeVisible();
    await expect(page.getByText(/price impact/i)).toBeVisible();

    // 5. Click Swap Assets
    const swapBtn = page.getByRole('button', { name: /swap assets/i });
    await swapBtn.click();

    // 6. Pre-signing trustline dialog explanation
    await expect(page.getByRole('heading', { name: /trustline & reserve requirement/i })).toBeVisible();
    await expect(page.getByText(/stellar reserves 0.5 xlm/i)).toBeVisible();

    // 7. Confirm trustline & proceed to sign
    const confirmTrustlineBtn = page.getByRole('button', { name: /i understand, proceed to sign/i });
    await confirmTrustlineBtn.click();

    // 8. Progress modal with Stepper
    await expect(page.getByRole('heading', { name: /swap completed successfully!/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/transaction confirmed/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /view on stellar expert/i })).toBeVisible();

    // 9. Close progress modal
    const closeBtn = page.getByRole('button', { name: /close/i });
    await closeBtn.click();

    // 10. Navigate to Transaction History
    const historyLink = page.getByRole('link', { name: /history/i }).first();
    await historyLink.click();
    await page.waitForURL('**/history');

    // 11. Verify completed transaction in history
    await expect(page.getByRole('heading', { name: /transaction history/i })).toBeVisible();
    await expect(page.getByText('50.0000000 XLM → 49.5000000 USDC')).toBeVisible();
    await expect(page.getByRole('status', { name: /status: completed/i })).toBeVisible();
  });
});
